---
date: 2025-09-04
tags:
 - Golang
categories: 
 - Golang
---

# Golang sync.Pool 的實現

過去很常看到或使用 sync.Pool，諸如 Gin 的 Context，或各種套件，乃至於大家開發上也都會看到它的身影，雖然知道它的用途也使用過，卻從未探究它的內部，所以這篇主要來探討 sync.Pool 的實現，以及使用時需要注意的地方。

以下原始碼以 **Go 1.25.0** 為準，主要看 `src/sync/pool.go` 和 `src/sync/poolqueue.go`，挑幾個影響使用方式的重點來看。

[[toc]]

## sync.Pool

sync.Pool 是 Golang 內建用來保存與取回臨時物件的工具，目的是複用已經配置、目前暫時不用的物件，減少頻繁建立物件的成本與 GC 壓力。例如一個服務每次處理請求都需要 buffer，如果用完就丟棄，下次又要重新配置，透過 pool，便有機會直接使用上一次留下來的 buffer。

我們可以先來看[官方文件](https://pkg.go.dev/sync@go1.25.0#Pool) 描述的行為，挑幾個重點：

- Any item stored in the Pool **may be removed automatically at any time without notification**. If the Pool holds the only reference when this happens, the item might be deallocated.
- A Pool is safe for use by multiple goroutines simultaneously.
- Pool's purpose is to cache allocated but unused items for later reuse, relieving pressure on the garbage collector.
- On the other hand, **a free list maintained as part of a short-lived object is not a suitable use for a Pool, since the overhead does not amortize well** in that scenario. 


### Get、Put 與 New

sync.Pool 的接口很簡單：

| 接口 | 用途 |
| --- | --- |
| `Get()` | 取出並移除一個物件，取不到時呼叫 `New`，若沒有設定 `New`，就回傳 `nil` |
| `Put(x)` | 把暫時不用的物件放回 pool，`Put(nil)` 不做任何事 |
| `New` | 可選的建立函式，通常回傳一個全新的物件 |

重點：
- `New` 並不會在宣告 pool 時就預先建立一批物件，而是在 `Get` 取不到時才呼叫
- `Get` 不保證取回哪個物件，也不保證一定使用已經放進去的物件，所以不能依賴 FIFO、LIFO，或認為 `Put(x)` 後下一次 `Get()` 一定拿到 `x`

我們先用一個完整的例子，看看如何複用 `bytes.Buffer`：

```go
const maxBufferCapacity = 64 * 1024

var bufferPool = sync.Pool{
	New: func() any {
		return new(bytes.Buffer)
	},
}

func releaseBuffer(buf *bytes.Buffer) {
	// 太大的 buffer 不留下來，避免偶發的大請求撐大常駐記憶體
	if buf.Cap() > maxBufferCapacity {
		return
	}
	buf.Reset()
	bufferPool.Put(buf)
}

func greeting(name string) string {
	buf := bufferPool.Get().(*bytes.Buffer)
	defer releaseBuffer(buf)

	buf.WriteString("Hello, ")
	buf.WriteString(name)
	buf.WriteByte('!')

	return buf.String()
}

func main() {
	fmt.Println(greeting("Go"))
	fmt.Println(greeting("sync.Pool"))
}
```

執行 `go run main.go` 會得到：

```text
Hello, Go!
Hello, sync.Pool!
```

這個例子有兩個比較重要的地方：

1. `Reset()` 清空 buffer 的長度，讓下一個使用者從空內容開始，底層儲存空間仍會保留，才能複用
2. `buf.String()` 回傳的字串不會隨著 buffer 後續被修改而改變，因此可以在函式返回時把 buffer 放回去，換成 `buf.Bytes()` 就不能直接這樣做（[原因](https://blog.wu-boy.com/2022/06/reuse-the-bytes-buffer-in-go/)）

這裡只是為了解釋使用方式，單純組合這麼短的字串，直接使用字串串接就很合適，沒有必要為了使用 pool 增加複雜度。

## 為什麼使用 sync.Pool

假設每個請求都要配置一塊暫存空間，處理完後便不再使用，請求量增加時，反覆配置的成本與 GC 需要處理的工作也會增加，如果暫存空間大小接近、使用時間短，而且不同請求之間可以重複使用，那麼 sync.Pool 就有機會把這部分成本攤平。

不過 pool 自己也有 `Get`、`Put`、查找與維護的成本，所以不能只看到「可以複用」就認為一定比較快，我們直接用 benchmark 來觀察。

### Benchmark

下面兩組都寫入相同的資料，並且把結果存到 package 變數，保留實際產出字串的工作，這樣比較的是「每次建立 buffer」和「嘗試複用 buffer」，而不是只測試 `Get`／`Put` 本身。

將下面內容獨立存為 `pool_test.go`，不需要搭配前面的 `main.go`：

```go title=pool_test.go
var payload = strings.Repeat("Hello, Go!", 256)
var result string

var benchmarkPool = sync.Pool{
	New: func() any {
		return new(bytes.Buffer)
	},
}

func BenchmarkWithoutPool(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		var buf bytes.Buffer
		buf.WriteString(payload)
		result = buf.String()
	}
}

func BenchmarkWithPool(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		buf := benchmarkPool.Get().(*bytes.Buffer)
		buf.WriteString(payload)
		result = buf.String()
		buf.Reset()
		benchmarkPool.Put(buf)
	}
}
```

執行：

```bash
go test -run='^$' -bench=. -benchmem -count=5 pool_test.go
```

觀察以下三個欄位：

| 欄位 | 代表意義 |
| --- | --- |
| `ns/op` | 每次操作平均花費的時間，越小越快 |
| `B/op` | 每次操作平均配置多少 bytes |
| `allocs/op` | 每次操作平均配置記憶體的次數 |

在這個固定大小、反覆使用的測試中，有 pool 的版本通常能減少 buffer 底層空間的配置，但產出獨立字串仍有成本，所以不代表整個 func 就能達到零配置。

這個 benchmark 是連續執行後的平均結果，主要反映 pool 已經有物件可複用的情況。

## 內部結構

知道如何使用之後，接著來看為什麼 sync.Pool 可以讓多個 goroutine 同時存取，又不需要每次都競爭同一把鎖。

### 分區快取：private 與 shared

```go title=src/sync/pool.go
type Pool struct {
	noCopy noCopy

	local     unsafe.Pointer // local fixed-size per-P pool, actual type is [P]poolLocal
	localSize uintptr        // size of the local array

	victim     unsafe.Pointer // local from previous cycle
	victimSize uintptr        // size of victims array

	// New optionally specifies a function to generate
	// a value when Get would otherwise return nil.
	// It may not be changed concurrently with calls to Get.
	New func() any
}
```

從 [pool.go 的結構定義](https://github.com/golang/go/blob/go1.25.0/src/sync/pool.go#L51-L74) 可以看到每個 Pool 主要有兩組快取：`local` 和 `victim`，各自還有對應的大小欄位：
- `local` 是主要快取
- `victim` 則用來保存上一輪 GC 留下來的快取

`local` 不是所有人共用的一條 queue，而是由多個 `poolLocal` 分區組成，這些分區與 runtime 的 P（這裡指的是 GMP 模型的 P）對應，分區數量在建立時依 `GOMAXPROCS` 決定，不是依 goroutine 的數量決定，也不是每個 goroutine 都有自己的 pool。

每個分區的核心結構如下：

```go title=src/sync/pool.go
// Local per-P Pool appendix.
type poolLocalInternal struct {
	private any       // Can be used only by the respective P.
	shared  poolChain // Local P can pushHead/popHead; any P can popTail.
}

type poolLocal struct {
	poolLocalInternal

	// Prevents false sharing on widespread platforms with
	// 128 mod (cache line size) = 0 .
	pad [128 - unsafe.Sizeof(poolLocalInternal{})%128]byte
}
```

- `private`：只放一個物件，只有**對應的 P 能存取**
- `shared`：可以放多個物件，**本地 P 從 head 放入與取出，其他 P 則可以從 tail 取走物件**

概念上可以看成：

- Pool.local
    - 分區 0：`private [obj]  shared [obj, obj, ...]`
    - 分區 1：`private [obj]  shared [obj, obj, ...]`
    - 分區 2：`private []     shared [obj, ...]`


這樣的好處是，大部分操作先嘗試自己的分區，**降低多個執行單位修改同一份資料的競爭**，如果自己的分區沒有物件，再去其他分區尋找。

`poolLocal` **還額外加上 padding，避免相鄰分區經常修改的欄位落在同一條 cache line，造成 False Sharing**，這裡的重點是：資料雖然分開了，仍需要考慮它們在記憶體中的排列，才能減少硬體快取之間的干擾。

### Put - 先放 private，再放 shared

[Put 的實作](https://github.com/golang/go/blob/go1.25.0/src/sync/pool.go#L92-L115) 在一般執行情況下，流程可以整理成：

1. 如果傳入 `nil`，直接返回
2. 透過 `pin()` 取得目前 P 對應的分區
3. 如果 `private` 是空的，就放進 `private`，否則呼叫 `shared.pushHead(x)`
4. 呼叫 `runtime_procUnpin()`，結束這段本地操作

這裡 `pin()` 的用途是讓存取本地分區的短暫區間不會被搶占，確保存取 `private` 時使用的是同一個 P，這也是 `private` 不需要額外 mutex 的原因。

**它只包住 pool 的內部操作，不會把呼叫者後續使用物件的整段程式都固定住。**

因此同一個 goroutine 下一次呼叫 `Get` 或 `Put`，可能已經對應到不同的分區，不能把 `private` 當成 goroutine 專屬的儲存空間。

### Get - 本地優先，再向外尋找

沿著 [Get 與 getSlow](https://github.com/golang/go/blob/go1.25.0/src/sync/pool.go#L123-L189) 看下去，查找順序大致如下：

```text:no-line-numbers
本地 private
    ↓ 沒有
本地 shared 的 head
    ↓ 沒有
掃描主要快取各分區的 shared，從 tail 取走物件
    ↓ 沒有
victim cache：對應分區的 private，再掃描 shared 的 tail
    ↓ 沒有
解除 pin，呼叫 New，若沒設定 New，就回傳 nil
```

`Get` 拿到 `private` 後會把該欄位設成 `nil`，因為取出就是把物件交給呼叫者，<span class="text-red">不能讓下一個人又拿到同一份</span>。

本地 `shared` 優先從 **head** 取，是希望較近使用過的物件能盡快再利用，改善 temporal locality，**其他分區則從 tail 取**，讓本地與外部分別操作不同端點，不過這些是內部策略，並不構成對使用者的取出順序保證。

還有一個容易忽略的地方：其他分區的 `private` 不在主要快取的竊取範圍內，所以即使某個分區還保留著物件，目前這次 `Get` 仍可能一路找不到，最後呼叫 `New`，sync.Pool 的目標是降低常見路徑的成本，不是確保每一個閒置物件都一定被找到。

### shared 為什麼能同時存取

`shared` 使用的 [poolChain 與 poolDequeue](https://github.com/golang/go/blob/go1.25.0/src/sync/poolqueue.go) 並非單純的 slice，`poolDequeue` 是固定大小的 ring buffer，採用 SPMC（Single-Producer, Multi-Consumer）的設計：

- 只有本地 P 能從 head 放入或取出
- 多個其他 P 可以從 tail 取出，透過 atomic 操作協調競爭
- 取出物件後會清掉槽位中的參考，避免 queue 額外留住已經不用的物件

`poolChain` 再把多個這樣的 queue 串起來，當目前的 queue 滿了，就新增更大的 queue，而不是直接搬動所有正在被併發存取的元素，新的 queue 容量會倍增到實作設定的上限，但 chain 可以繼續增加節點，所以這不等於整個 pool 有固定容量。

## sync.Pool 與 GC

前面提到 pool 內的物件可能被移除，但如果每次 GC 都把主要快取完全丟掉，下一波請求又得重新建立大量物件，因此這個版本使用 victim cache，讓物件有一段跨越 GC 的複用機會。

### victim cache 的作用

[poolCleanup](https://github.com/golang/go/blob/go1.25.0/src/sync/pool.go#L242-L281) 會在 GC 開始、Stop The World 的階段執行，主要做兩件事：

1. 清除上一輪保留下來的 victim cache
2. 把目前的主要快取移到 victim cache，並清空主要快取的欄位

假設物件 A 放回主要快取後，一直沒有再被取出，可以把生命週期簡化成：

```text:no-line-numbers
Put(A)
  ↓
主要快取持有 A
  ↓ 第一次 GC 開始
victim cache 持有 A，仍有機會被 Get 取出
  ↓ 第二次 GC 開始，期間沒有取出再放回
pool 移除對 A 的參考
```

如果 A 在 victim 階段被 `Get` 取出，使用完後又 `Put` 回去，**它就回到新的主要快取**，這個流程會重新開始，這也是為什麼<span class="text-red">頻繁被複用的物件有機會一直留下來，而不再需要的物件則逐漸被淘汰</span>。

不過「兩次 GC」是上述版本中，物件一直閒置時的實作流程，<span class="text-red">不是保證每個物件至少保存兩輪，也不是固定的過期時間</span>，GC 不是按固定秒數執行，其他內部路徑也可能讓快取消失。

移除參考也不等於記憶體立刻歸還作業系統，如果**外部還持有物件，它仍然是可達的**，即使物件已經能被 GC 回收，程序的記憶體用量也不一定馬上下降。

### 為什麼先找主要快取，再找 victim

`getSlow` 先掃描主要快取，再使用 victim，是希望主要快取已經夠用時，舊的 victim 物件可以自然老化，在下一輪清理時離開 pool，這樣既保留 GC 後再次複用的機會，也避免所有舊物件都持續被拿回主要快取。

因此 sync.Pool 是在「減少重複配置」與「保留閒置記憶體」之間做取捨，配置次數下降，可能同時伴隨較多存活的記憶體，不能只看 benchmark 的 `B/op` 就認為服務總記憶體一定會下降。

## 使用時需要注意的地方

### Pool 安全，不代表物件可以同時使用

- sync.Pool 的 `Get`／`Put` 可以由多個 goroutine 同時呼叫，<span class="text-red">但不會自動讓放進去的 `bytes.Buffer` 或自訂 struct 變成 thread-safe</span>

    比較容易理解的使用規則是：**Get 後由目前的使用者獨占，Put 後就放棄使用權。**

    下面這段就有問題：

    ```go 
    buf := bufferPool.Get().(*bytes.Buffer)
    bufferPool.Put(buf)
    buf.WriteString("still using it") // 錯誤：其他 goroutine 可能已經拿走 buf // [!code error]
    ```

- <span class="text-red">同一個物件也不能重複 `Put`</span>，否則兩次 `Get` 可能拿到同一個指標，讓兩個使用者以為自己各自擁有一份物件

- `New` 也應該建立獨立物件，不要每次都回傳同一個共用指標

- 官方文件另外保證：`Put(x)` 會 synchronizes before 之後回傳同一個 `x` 的 `Get`<br>
    也就是說 `Put(x)` 和另一個 `Get()` 拿到 `x` 的人來說，`Put(x)` 前面執行的 reset 或操作，對 `Get()` 拿到 x 的人是保證可見的，換句話說：歸還前對物件的初始化與重設，對下一個拿到它的使用者是可見的。<br>
    <span class="text-red">但這項保證不能合理化歸還後繼續讀寫物件。</span><br>
    參考 [從 Ring Buffer 看 Golang GMP 模型的 Processor 對 Local Run Queue 的實現](../../2026/how_golang_implement_ring_buffer_with_atomic/how_golang_implement_ring_buffer_with_atomic.md)。

### 不要把仍在使用的底層空間放回去

`bytes.Buffer.Bytes()` 回傳的是指向 buffer 底層儲存空間的 slice，假設把前面的 `greeting` 改成下面這樣：

```go
// 錯誤示範
func greetingBytes(name string) []byte {
	buf := bufferPool.Get().(*bytes.Buffer)
	defer releaseBuffer(buf)

	buf.WriteString("Hello, ")
	buf.WriteString(name)
	return buf.Bytes() // [!code error]
}
```

函式返回時 <span class="text-red">buffer 已經歸還了，但外部拿到的 slice 還指向同一塊空間</span>，下一個使用者寫入 buffer，就可能覆蓋先前回傳的內容，若兩邊同時讀寫，也可能發生 **data race**。

如果確實需要回傳獨立的 `[]byte`，可以在歸還前改成 `return bytes.Clone(buf.Bytes())`，代價就是需要複製，或者讓呼叫者在持有 buffer 的期間內完成消費，等使用結束再歸還。

要不要複製，取決於輸出資料需要活多久，不能只為了降低配置次數而提早 `Put`。

### nil、型別與 Pool 本身的生命週期

除了前面的物件使用權，還有幾個接口上的限制：

- `Put(nil)` 會被忽略，但 `var buf *bytes.Buffer = nil` 再 `Put(buf)` 是帶有型別的 nil，裝進 `any` 後並不等於 nil，之後 `Get` 可能拿到 nil 指標，<span class="text-red">歸還時要避免這種值</span>
- <span class="text-red">同一個 pool 應該放同一種型別</span>，否則 `Get().(*bytes.Buffer)` 可能 panic，接口回傳 `any`，不會幫我們檢查型別一致性
- sync.Pool 開始使用後，<span class="text-red">不要複製它，也不要複製裝著它的 struct</span>，需要把這個 struct 傳給函式或呼叫方法時，使用指標
- `New` 不可以和 `Get` 併發修改，通常在宣告時設定好即可。多個 `Get` 可能同時呼叫 `New`，若建立函式還會修改外部共用狀態，該狀態也需要同步<br>
    也就是在建立 pool 時就設定好函式：
    ```go:no-line-numbers
    pool := sync.Pool{
        New: func() any {
            return new(bytes.Buffer)
        },
    }
    ```

## 適用情境與限制

sync.Pool 比較適合許多獨立操作都會短暫需要、可以重新建立、而且有機會高頻複用的物件，例如日誌與序列化的暫存 buffer、編解碼過程的工作物件，或每次請求都需要，用完能完整重設的狀態。

標準庫 `fmt` 就是一個例子：透過 package 層級的 pool 複用 printer 與其暫存空間，讓不同呼叫之間分攤配置成本，而不是每次呼叫都從零開始建立。

另外，雖然很多套件名字裡都有 Pool，但用途可能差很多，尤其是需要 `Close` 的資源（如：Database 連線專用資源池），不適合只靠 sync.Pool 管理，Pool 不會在移除物件時替我們呼叫 `Close`，也沒有遍歷所有物件、統一關閉或等待歸還的接口。

最後還是要回到測量：如果配置成本本來就很低、物件很少被再次使用，或清理狀態的成本很高，使用 pool 可能沒有幫助。反過來，如果 benchmark 顯示配置減少，也要一起觀察真實服務的延遲、GC 與保留記憶體，確認這個取捨符合需求。

## 小結

sync.Pool 的實現把本地分區、共享 queue 與 victim cache 組合起來，讓常見操作能快速複用物件，又能隨 GC 逐步放掉不再需要的快取。

對使用者來說，最重要的是維持物件的使用權與重設規則：拿不到時能重新建立，拿到後獨占使用，用完清理狀態，歸還後不再碰它，能做到這些，再配合實際測量，才比較容易讓 pool 的複用收益大於維護成本。

## 參考資料

- [Go 1.25.0 sync.Pool 文件](https://pkg.go.dev/sync@go1.25.0#Pool)
- [深度分析 Golang sync.Pool 底层原理 - 编程沉思录](https://cyhone.com/articles/think-in-sync-pool/)
