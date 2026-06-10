# 透過 Golang 的 GMP 模型看 Ring Buffer 的實現

## 前言
此篇文章主要是自己學習寫出 thread-safe 的 Ring Buffer 筆記，內容主要涵蓋 Ring Buffer、Atomic、Memory Barrier、Cache Coherence、False Sharing、Lock-free 等概念，GMP 模型的部分僅探討 Golang 如何把 Ring Buffer 應用在 P 的一些行為上，而不會探討 GMP 模型本身。

## Ring Buffer
一般寫 Ring Buffer 最入門的版本有兩種：
1. 透過一個額外的變數紀錄目前 Ring Buffer 元素的個數
   - 由於 `buf.head == buf.tail` 可能是空的，也可能是滿的，需要額外借助 `count` 變數，判斷 Buffer 狀態
2. 保留一個空間不使用
    - 判斷是否滿了：`(buf.tail + 1) % buf.size == buf.head`
    - 判斷是否為空：`buf.head == buf.tail`
    - 少一個變數更容易實現 lock-free

先來看第一個版本
```go :collapsed-lines=5
type RingBuffer[T any] struct {
	data  []T
	head  int
	tail  int
	count int // 用來判斷空、滿 // [!code highlight]
	size  int
}

func NewRingBuffer[T any](size int) *RingBuffer[T] {
	return &RingBuffer[T]{
		data: make([]T, size),
		size: size,
	}
}

func (r *RingBuffer[T]) Push(v T) error {
	// 如果 buf 的元素個數 == size 就是滿的
	if r.count == r.size { // [!code highlight]
		return fmt.Errorf("buffer full")
	}

	r.data[r.tail] = v

	r.tail = (r.tail + 1) % r.size
	r.count++

	return nil
}

func (r *RingBuffer[T]) Pop() (T, error) {
	// 如果 buf 的元素個數是 0 就是空的
	if r.count == 0 { // [!code highlight]
		return *new(T), fmt.Errorf("buffer empty")
	}

	v := r.data[r.head]

	r.head = (r.head + 1) % r.size
	r.count--

	return v, nil
}
```