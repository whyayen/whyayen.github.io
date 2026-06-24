---
date: 2026-06-10
---
# 從 Ring Buffer 看 Golang GMP 模型的 Processor 對 Local Run Queue 的實現

## 前言
此篇文章主要是自己學習 [並行程式設計: Atomics 操作](https://hackmd.io/@sysprog/concurrency-atomics#%E8%BB%9F%E9%AB%94%E8%A7%80%E9%BB%9E) 的**筆記**，如果要學習下面提到這些概念的話，建議完整讀過這份教材，以下內容主要涵蓋 Ring Buffer 實作、Atomic、Memory Barrier、Cache Coherence、False Sharing、Lock-free 等概念，並且看 Golang 如何在 GMP 模型中 Processor 的 local run queue 實現 lock-free ring buffer。

[[toc]]

## Ring Buffer
一般寫 Ring Buffer 最入門的版本有兩種：
1. 透過一個額外的變數紀錄目前 Ring Buffer 元素的個數
   - 由於 `buf.head == buf.tail` 可能是空的，也可能是滿的，需要額外借助 `count` 變數，判斷 Buffer 狀態
2. 保留一個空間不使用
    - 判斷是否滿了：`(buf.tail + 1) % buf.size == buf.head`
    - 判斷是否為空：`buf.head == buf.tail`
    - 少一個變數更容易實現 lock-free

先來看第一種：
```go{10,23,37} :collapsed-lines=16
var (
	ErrFull  = errors.New("ring buffer full")
	ErrEmpty = errors.New("ring buffer empty")
)

type RingBuffer[T any] struct {
	data  []T
	head  int
	tail  int
	count int // 用來判斷空、滿
	size  int
}

func NewRingBuffer[T any](size int) *RingBuffer[T] {
	return &RingBuffer[T]{
		data: make([]T, size),
		size: size,
	}
}

func (r *RingBuffer[T]) Enqueue(v T) error {
	// 如果 buf 的元素個數 == size 就是滿的
	if r.count == r.size {
		return ErrFull
	}

	r.data[r.tail] = v

	r.tail = (r.tail + 1) % r.size
	r.count++

	return nil
}

func (r *RingBuffer[T]) Dequeue() (T, error) {
	// 如果 buf 的元素個數是 0 就是空的
	if r.count == 0 {
		return *new(T), ErrEmpty
	}

	v := r.data[r.head]

	r.head = (r.head + 1) % r.size
	r.count--

	return v, nil
}
```

第二種：
保留一格不用，不依賴 `count` 變數

```go{30,43} :collapsed-lines=12
var (
	ErrFull  = errors.New("ring buffer full")
	ErrEmpty = errors.New("ring buffer empty")
)

type RingBuffer[T any] struct {
	data  []T
	head  int
	tail  int
	count int
	size  int
}

func NewRingBuffer[T any](size int) *RingBuffer[T] {
    // 因為會保留 1 個空間不使用，所以 size < 2 直接 return error	
     if size < 2 {
		return nil, errors.New("size must be at least 2")
	}

	return &RingBuffer[T]{
		data: make([]T, size),
		size: size,
	}
}

func (r *RingBuffer[T]) Enqueue(v T) error {
	nextTail := (r.tail + 1) % r.size

	// 保留 1 個空間不使用
	if nextTail == r.head {
		return ErrFull
	}

	r.data[r.tail] = v
	r.tail = nextTail

	return nil
}

func (r *RingBuffer[T]) Dequeue() (T, error) {
	var zero T

	if r.head == r.tail {
		return zero, ErrEmpty
	}

	data := r.data[r.head]
	r.data[r.head] = zero // 清空，避免引用型別造成 GC retention

	r.head = (r.head + 1) % r.size

	return data, nil
}
```

第二種的實作雖然看起來比第一種複雜一點，但其實巧妙地利用保留一個空間來避免無法判斷 buffer 是空的還是滿的，從而需要引入另外一個變數來判斷，如此便會增加在 concurrent 場景下多維護一個變數的成本。

不過這兩個版本都不是 thread-safe，寫個簡單的測試跑 `go test --trace -v ring_buffer.go` 便會發現有一堆 race condition。

考量到以下場景（以上面第 2 版程式碼為例）：
有 2 個 producer 同時 enqueue，假設初始狀態：
```
head=0
tail=0
data=[_, _, _]
```

Thread A 執行 `enqueue(1)`，Thread B 執行 `enqueue(2)`，假設以下面這個順序執行
```
A: 讀 r.tail = 0
B: 讀 r.tail = 0

A: nextTail = 1
B: nextTail = 1

A: 判斷 nextTail != head，可以寫
B: 判斷 nextTail != head，可以寫

A: r.data[0] = 1
B: r.data[0] = 2   // 覆蓋 A 的資料

A: r.tail = 1
B: r.tail = 1
```
結果：
```
data[0] = 2
tail = 1
```
`1` 被蓋掉了，但兩個都以為自己 enqueue 成功

當然可以直接加上 Mutex，在 enqueue/dequeue 操作時，讓 critical section 同時只允許一個執行緒執行：
```go
type RingBuffer[T any] struct {
   data  []T
   mu sync.Mutex // [!code ++]
   ...
}
```

Mutex 語意簡潔且易於開發，但同時也存在一些缺點：
1. 被 block 的 thread 要不 spin，要不等待喚醒（sleep/awake），無法充分運用硬體效能
2. 程式崩潰，發生 Deadlock
3. 發生 [Priority Inversion](https://en.wikipedia.org/wiki/Priority_inversion)

所以如果想充分發揮多處理器的硬體能力，或考慮到 scalability，那就要考慮其他實現方式。

## Atomic 操作：非阻塞式同步的基石

> "atom" 作為電腦術語，指無法再拆分為更小的執行步驟，這實際是對「硬體」的觀點，即微處理器的指令，並非從「軟體」的觀點來看。
> 
> —— [並行程式設計：Atomics 操作](https://hackmd.io/@sysprog/concurrency-atomics#%E9%98%BB%E5%A1%9E%E5%BC%8F%E5%90%8C%E6%AD%A5%E6%A9%9F%E5%88%B6)

第一次看到這句話有種恍然大悟的感覺，就是為什麼在軟體開發很常被忽略 atomic 的重要性，我們總以為只是一行指令，或以為程式不會在一半死掉，例如 RDBMS 的 ACID，很常某些場景應該使用 transaction，以確保資料是完整寫入或全部失敗，然而卻很容易被忽略導致資料內容在特定場景下發生不如預期的值。雖然從並行程式的角度來說與 RDBMS 的 Atomicity 並不一樣，但概念都是要確保 N 個操作是同時成功或失敗。

從軟體角度來說，`counter++` 這樣一個簡單的加法，其實涉及了三個操作：Load、Add、Store，如果沒有 atomicity 確保三個操作一起完成或失敗，那麼可能 2 個執行緒同時 Load，各自對讀出來的值做 Add，接著 Store 後，`counter` 本應該是 2 卻可能變成 1 了。

通常 CPU 會提供有別於一般 load/store memory 的特殊指令，以達成 Read-Modify-Write (RMW) atomic。常見以下二種：
1. [compare-and-swap (CAS)](https://en.wikipedia.org/wiki/Compare-and-swap) / swap (SWP)
   - SWP
     - 直接寫入值，並把舊的值拿回來，這個寫入和讀取舊值是 atomic
     - 實現的處理器
       - ARMv5（含）以前，因為 lock 整個 system bus，在多核心場景下會有效能問題，自 ARMv6 起棄用，改用 LDREX、STREX
   - CAS
     - 如果是 A，就換成 B；如果不是，就放棄寫入
     - 實現的處理器
       - x86 的 `CMPXHG`
       - ARMv8.1
   - 可能導致 [ABA Problem](https://en.wikipedia.org/wiki/ABA_problem)
2. [load-link/store-conditional (LL/SC)](https://en.wikipedia.org/wiki/Load-link/store-conditional)
   - 這兩個指令需要成對使用，以達成原子性
     - LL (Load-Link/Load-Reserved)
       - 從記憶體讀取一個值，但同時 CPU 內部會標記並監控這個記憶體地址為 exclusive。
     - SC (Store-Conditional)
       - 嘗試將新值寫入 LL 監控的地址。如果從 LL 到 SC 期間，沒有任何其他人改變過這個地址，則寫入成功，並清除 exclusive 狀態；如果有人動過，寫入直接失敗。
   - 實現的處理
     - Power
     - ARMv6 以上，提供 LDREX、STREX 指令
   - 能避免 ABA Problem

## Cache
在電腦發展剛開始 CPU 和主記憶體都很慢，但隨著 CPU 的運行速度大幅提升後，主記憶體反而沒有顯著提升，於是為了降低對主記憶體的存取次數，現代電腦引入了 Cache。

::: info
從〈[Latency Numbers Every Programmer Should Know](https://gist.github.com/jboner/2841832)〉可知，存取主記憶體的時間是 100 ns，L1 cache 是 0.5 ns，兩者相距 200 倍。
:::

### Cache 的組成
- Cache Size
  - 代表 cache 可以快取最大的資料大小
- Cache Line
  - 將 cache 平均分成相等大小的塊，即為 cache line
  - Cache 和 main memory 傳輸的最小單位，

### 如何知道 Cache Hit or Miss
如果 CPU 從一個記憶體位址讀取一個字節，如何知道該資料是否存在 cache 中？
我們假設我們有一個 64 bytes 大小的 cache，每個 cache line 大小為 8 bytes，也就是 8 個 cache lines，那麼如果我們要讀取 `0x0654`，cache 會把地址看成三個部分：Tag、Index、Offset

![Address format](https://picx.zhimg.com/v2-e8deb539258684ad9d4dffef08b02c09_r.jpg)
圖片來源：[知乎 @smcdef](https://zhuanlan.zhihu.com/p/102293437)

- Tag (2 bits)
  - 高位剩餘 bits 屬於 tag，但計算方式先參考 Index & Offset，再回頭看 Tag 的作用。
- Index (3 bits)
  - 我們有 8 個 cache lines，要知道資料快取在哪個 cache line，我們就從地址取 3 個 bits （$\log_{2}8=3$）便能表示快取在哪一個 cache lines（如圖中黃色區塊）
- Offset（3 bits）
  - 用來尋址 8 bytes 中的某一個字節（如圖中藍色區塊），所以需要 $\log_{2}8=3\text{ bits}$。 

而我們可以發現多個位址的 index 可能是一樣的 cache line，所以如果只有 index 知道座落於哪個 cache line 是不夠的，因為不知道裡面的資料是否屬於想讀取地址的資料，於是引入了 tag array，而 tag array 與 data array 是一一對應的。每一個 cache line 都對應一個 tag，tag 中保存的是去除 index 和 offset 剩餘的部分（如圖中綠色的部分）

因此當我們根據地址中的 index 找到 cache line 後，取出當前 cache line 的 tag 進行比較，如果一樣就表示 cache hit，如果不一樣則表示 cache miss。
::: warning
但是我們談到 cache size 並不包含 tag 的大小，而是單純 data 的大小。
:::

而通常還會有一些 flag，如：valid bit、dirty bit，如圖中最前面和最後面，valid bit 表示 cache line 中的資料為有效還無效（通常 `1` 表示有效，`0` 為無效），因此通常剛開機會是 `0`，上述除了檢查 tag 是否一致之前，會先確認 valid bit 是否為有效。

### 映射模式

#### Direct Mapped
我們前面說的方式就是 Direct Mapped，透過 memory address 做 mod 運算便能知道是哪一個 cache line。
- 優點
  - 簡單、容易運算
  - 硬體設計成本低
- 缺點
  - Cache Thrashing（Cache 顛簸）
    - 以上面計算例子，如果讀到固定偏移量的地址都是同一個 cache line，就要 evict 然後從主記憶體讀入，容易衝突

#### N-way Set-Associative
N-way 就是代表每 N 個 cache lines 組成一個 set，我們從地址算出屬於哪個 set 之後，從 set 裡面找到空的 cache lines 進行分配，如果沒有空的，需要 evict 時，我們可以採用 LRU、Random、FIFO 等策略進行 evict，同時根據地址找 cache line 時，變成先找到所屬 set，再到該 set 內遍歷尋找符合的 tag。

同樣以上面 Cache Size: 64 bytes、Cache Line：8 bytes 為例，計算得出：
$$
64B \div 8B = 8 \text{ cache lines} \\[0.5em]
8 \text{ cache lines} \div 2 = 4 \text{ sets}
$$

根據計算我們知道有 4 個 Sets，而我們 Address 同樣分為 Tag、Index、Offset，我們的 cache line size 一樣 8 bytes 沒變，因此 offset 照樣是 3 bits，但 Index 變了，我們需要尋找我們的地址在 4 個 sets 裡面的哪個，因此我們需要 $\log_{2}4 = 2 \text{ bits}$，那麼剩下的高位就是 Tag，因此 2-way set-associative cache 的組成會變成：`Tag{3 bits}-Index{2 bits}-Offset{3 bits}`

參考如圖：
![2-way set-associative cache](https://pic3.zhimg.com/v2-4653656ec3d4d5942bae805df6723690_1440w.jpg)
圖片來源：[知乎 @smcdef](https://zhuanlan.zhihu.com/p/102293437)

- 優點
  - 降低 Cache Thrashing 的機率
    - 因為地址一樣只是分配到同一個 set，找到 set 後在裡面找空的 cache line 寫入，沒空的就根據 replacement policy 進行 evict
- 缺點
  - 硬體成本較 Direct Mapped 增加
    - 需要比較多個 cache line 對應的 tag，如果是並行比較其硬體設計更為複雜）

#### Fully Associative
把所有 cache line 放入同一組，直接省去找哪一組，在組內查找對應的 cache line 即可，這樣的方式就是 Fully Associative Cache。

![Fully Associative Cache](https://pic1.zhimg.com/v2-1e61e8d13030ed4f0b42c2d1a854ffce_1440w.jpg)
圖片來源：[知乎 @smcdef](https://zhuanlan.zhihu.com/p/102293437)

也因為沒有 set 的區別了，我們不需要 Index，寫入 cache 時，直接找空的 cache line 寫，查找時則比較所有 cache line 的 tag，找到對應的 cache line 讀取，因此 fully associative cache 是任意地址可以寫入任一 cache line 中，可以最大程度減少 cache thrashing 的機率，但硬體成本也更高。

#### 小結

|            | Direct-Mapped | N-way Set-Associative |       Fully Associative       |
|:-----------| :---: | :---: |:-----------------------------:|
| 概念         | 記憶體區塊只能放到 **唯一固定** 的 Cache Line | 記憶體區塊可以放到 **特定一個 Set** 中的任意 Cache Line | 記憶體區塊可以放到 **任意** 的 Cache Line |
| 硬體複雜度 & 成本 | 最低 | 中等 |              最高               |
| 空間利用率      | 最低 | 中等 |              最高               |
| Miss Rate  | 最高 | 較低 |              最低               |
| Hit Time   | 最快 | 中等 |     較慢<br>(因需要同時比對大量 Tag)     |

以我的電腦使用 M4 Chip 為例，我們可以在 [Apple Silicon CPU Optimization Guide](https://developer.apple.com/download/apple-silicon-cpu-optimization-guide/) 文件的 **Table 5.6. L1I Cache Organization: M-Series Chips** 找到：
- M4 Family
  - Performance Cores: 192KiB, 6-way, 64B lines
  - Efficiency Cores: 128KiB, 4-way, 64B lines

以 P-Core 來說，L1 Cache 大小為 192 KiB，每一條 cache line 為 64B，根據計算可以得出：
$$
\begin{aligned}
& 192 \times 1024 = 196{,}608 B \\[0.5em]
& 196{,}608B \div 64B = 3{,}072 \text{ 條 lines} \\[0.5em]
& 3{,}072 \div 6 = 512 \text{ Sets}
\end{aligned}
$$

### Cache Line 實驗

在我們知道 Cache 的組成之後，回到並行程式設計: Atomics 操作的 [Cache Line 實驗](https://hackmd.io/@sysprog/concurrency-atomics?stext=14501%3A1482%3A0%3A1781338030%3ACIVy3F)，這個實驗在探討變數座落於 2 個不同的 cache line 會發生不預期的值，正是因爲硬體對於跨 cache line 的讀寫**沒有原子性保證**。

定義一個 struct 如下：
```C
struct data {
    int32_t pad[15]; // 4 bytes * 15 = 60 bytes
    int64_t v;       // 8 bytes
};
```

實驗啟動 24 個 threads，每個 thread 進行 10000 次的 NOT 運算：
```C
value.v = ~t;
```

將結果輸出
```C
printf("iteration: %lu\n", count);
printf("data size: %lu\n", sizeof(value));
printf("final: %016lX\n", value.v);
```

持續觀測，那麼 final 最終結果會是什麼呢？
```bash
$ watch -n 1 "./cacheline 24 10000"
```

理論上 `value.v` 的值應該會是：
1. `FFFFFFFFFFFFFFFF`
2. `0000000000000000`

但實際上輸出卻會出現 4 種值：
1. `FFFFFFFFFFFFFFFF`
2. `0000000000000000`
3. `00000000FFFFFFFF`
4. `FFFFFFFF00000000`

由於硬體的 cache coherence 操作的基本單元就是 cache line，為了寫進記憶體，CPU 必須 exclusive 地佔有該 cache line，而若一個變數座落於在 2 個不同的 cache line 上，則 cache line 之間的競爭是「沒有」atomic 特性保證，資料讀取也類似，因此其他執行緒可能觀察到 Torn Read 或 Torn Write。

正如教材裡面提到《[Intel® 64 and IA-32 architectures software developer's manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)》的第 3 卷提及:
> Intel 64 memory ordering guarantees that for each of the following memory-access instructions, the constituent memory operation appears to execute as a single memory access regardless of memory type:
> 
> 1. Instructions that read or write a single byte. 
> 2. Instructions that read or write a word (2 bytes) whose address is aligned on a 2 byte boundary. 
> 3. Instructions that read or write a doubleword (4 bytes) whose address is aligned on a 4 byte boundary. 
> 4. Instructions that read or write a quadword (8 bytes) whose address is aligned on an 8 byte boundary. <br> All locked instructions (the implicitly locked xchg instruction and other read-modify-write instructions with a lock prefix) are an indivisible and uninterruptible sequence of load(s) followed by store(s) regardless of memory type and alignment. 
> 
> Other instructions may be implemented with multiple memory accesses. From a memory-ordering point of view, there are no guarantees regarding the relative order in which the constituent memory accesses are made. There is also no guarantee that the constituent operations of a store are executed in the same order as the constituent operations of a load.

不過如果在 Golang 進行一樣的 struct 宣告，並不會讓 v 座落在 2 個 cache line 上，因為 Golang 本身會對其進行對齊，要做這實驗必須自己手動 offset。

如下 Golang 程式碼，可以看到這樣的結構體本身會進行對齊：
```go
type Data struct {
	Pad [15]int32 // 4 bytes * 15 = 60 bytes
	V   int64     // 8 bytes
}

func main() {
  var d Data

  fmt.Printf("1. 整個結構體的大小 (Size): %d bytes\n", unsafe.Sizeof(d))
  fmt.Printf("2. 整個結構體的對齊限制 (Align): %d bytes\n", unsafe.Alignof(d))

  fmt.Printf("Pad 的偏移量 (Offset): %d, 大小: %d\n", unsafe.Offsetof(d.Pad), unsafe.Sizeof(d.Pad))
  fmt.Printf("V   的偏移量 (Offset): %d, 大小: %d\n", unsafe.Offsetof(d.V), unsafe.Sizeof(d.V))
}
```

會得到：
```
1. 整個結構體的大小 (Size): 72 bytes
2. 整個結構體的對齊限制 (Align): 8 bytes

Pad 的偏移量 (Offset): 0, 大小: 60
V   的偏移量 (Offset): 64, 大小: 8
```

## Cache Coherence
為了減少 CPU 從主記憶體讀取資料太慢，有了 cache，然而在多核心處理器架構，當不同的核心讀取或修改資料時，資料的一致性便成了一個新問題，例如下面這張圖的場景：

![Cache Coherence](./cache_coherence.png)<br>
圖片來源：[MIT 6.004 L25: Cache Coherence](https://youtu.be/83jOKVb_HTM)

步驟：
1. $Core_0$ 從地址 `0xA` 讀取資料，其內容為 `2`
2. $Core_2$ 將資料寫回 `0xA`，更新資料 `3` 在自己的 cache 上，並在稍後補回 memory
3. $Core_0$ 不知道 $Core_2$ 的更新，因此還以為 `0xA` 的資料是 `2`，但這份資料已經過時（Stale）

因此需要一個機制來確保資料一致性，這樣專門處理一致性的協定稱為 Cache Coherence Protocol，透過 Cache Coherence Protocol 當任何一個 CPU 寫入資料前，需要先廣播 PrWr (Probe Write)，確保其他有同一位置 cache 的 CPU 先 invalidate，其他 CPU 回覆 invalidate ack 後，才能寫入自己的 cache，並在稍後寫回主記憶體。

> 使用 cache 時，要確保個別 CPU 有看到「一致 (coherent) 的資料」(注意重點放在 CPU 之間的順序，而非讓 cache 和 memory 保持同步 [synchronous]，如此概念差異會影響到架構設計)。
>
> [並行程式設計: Atomics 操作](https://hackmd.io/@sysprog/concurrency-atomics)

不同的 CPU 間是透過 [system bus](https://en.wikipedia.org/wiki/System_bus) 進行溝通，system bus 連接 CPU、主記憶體和其他 I/O 裝置，當 CPU 進行 cache coherency 時，是透過 system bus 發送廣播 Probe Read 或 Probe Write 請求，其他 CPU 也是透過 system bus 來回應相應的請求，因此也稱 systme bus 為 cache coherent interconnect (CCI)。

![System Bus](./system_bus.png)

### MESI Protocol
我們可以藉由 [MESI Protocol](https://en.wikipedia.org/wiki/MESI_protocol) 了解 CPU 之間如何維持看到一致的資料。

狀態說明：
- Modified (M)
  - Cache Line 只存在於當前 Cache，而且是 **ditry**，表示已經被修改（與主記憶體的值不同）
- Exclusive (E)
  - 只有當前 Cache 有這份 cache line，並且和主記憶體的值相同
- Shared (S)
  - 多個 Cache 都有這份 cache line，並且和主記憶體的值相同
- Invalid (I)
  - Cache Line 無效（未使用）

當要從某個地址讀取資料，此時會發出 PrRd 請求，接著其他 Cache 都不存在這份資料時，便會

## References
- [Cache 的基本原理 - 知乎](https://zhuanlan.zhihu.com/p/102293437)
- [並行程式設計: Atomics 操作](https://hackmd.io/@sysprog/concurrency-atomics)