---
title: Ruby connection_pool 套件的實作原理
date: 2024-05-31
tags:
 - Ruby
categories: 
 - Ruby on Rails
---

最近剛在看一些 Ruby threads、GIL 的資料，看完想找個簡單不複雜的套件，看看是如何用 threads 實現一些功能，剛好 [connection_pool](https://github.com/mperham/connection_pool) 是一套常見且實現偏簡單的套件，用來建立一個 Connection Pool 來快取資料庫連線，避免每次重新建立連線，耗費大量時間，雖然它沒有開新 thread 的部分，但有一些利用到 Mutex、ConditionVariable 的部分還是可以了解一下這麼做的原因為何。

主要的幾個檔案：
- `connection_pool/timed_stack.rb`: 一個用來存放連線的 Stack 資料結構（裡面包含了連線建立、連線獲取方法）
- `connection_pool.rb`:  套件 Class 的主要方法接口
- `connection_pool/wrapper.rb`: 包覆一些方法，實現把 `ConnectionPool::Wrapper` 建立出來的物件可以直接用 `$redis.sadd` 之類的方法，不用在透過 `with` 把要執行的程式碼然後寫在 block 內

## ConnectionPool::TimedStack Class

這是一個 stack 的結構，主要用於存放已建立的 connections，並且透過用 Mutex 確保 `@que` 及其他變數不會因為多線程的讀寫導致 race condition。這裡主要的兩個方法 `pop` & `push`，而 `pop` 主要的用途就是拿到 connection，使用完畢後可以在透過 `push` 方法存回 pool 堆疊裡面，所以越晚用完放回 stack 的 connection，下次會優先被拿出來用，這邊會用 stack 可能的原因我猜是：保持 connection 活躍，避免可能時長過久中斷需重新建立連線，或因為其他因素而變得不可用。

先從建構子開始看這些變數的用途：

```ruby
def initialize(size = 0, &block)
  @create_block = block # 存放要執行建立連線的 block，例如 $redis.new
  @created = 0 # 存放已建立的連線數量
  @que = [] # 存放已建立的連線
  @max = size # 最多能建立多少 connections
  @mutex = Thread::Mutex.new
  @resource = Thread::ConditionVariable.new
end
```



push 方法就是將一個連線放入 stack（這裡先不管 shutdown_block 的場景）

```ruby
def push(obj, options = {})
  @mutex.synchronize do
    if @shutdown_block
      @shutdown_block.call(obj)
    else
      store_connection obj, options
    end

    @resource.broadcast # 喚醒所有在 wait (sleep) 的 threads
  end
end
alias_method :<<, :push

# ...

def store_connection(obj, options = nil)
  @que.push obj
end
```

pop 方法就複雜一點，主要在做的事情：
1. 如果已經有之前建立的 connection（stack 不是空的），就直接 pop stack 的 connection
2. 如果 stack 是空的則嘗試建立一個 connection 並返回
3. 檢查是否已經 Timeout 是的話就 raise TimeoutError
4. 讓 thread 先進入 sleep 待有訊號喚醒時（`resource.broadcast` 或 `resource.signal`），才又重新回到第一步的流程在一次，使用 ConditionVariable 是因為上述的情況就是目前拿不到或產不了 connection，沒必要一直跑迴圈浪費資源，先讓 thread 進入睡眠

```ruby
def pop(timeout = 0.5, options = {})
  options, timeout = timeout, 0.5 if Hash === timeout
  timeout = options.fetch :timeout, timeout

  deadline = current_time + timeout
  @mutex.synchronize do
    loop do
      raise ConnectionPool::PoolShuttingDownError if @shutdown_block
      # 當 stack 不是空的時候，直接返回之前建立的 connection
      return fetch_connection(options) if connection_stored?(options)

      # 沒有 connection 的時候，嘗試建立一個
      connection = try_create(options)
      return connection if connection

      to_wait = deadline - current_time
      # 如果已經超過時間仍還沒法獲取/建立連線的時候，則拋出一個錯誤
      raise ConnectionPool::TimeoutError, "Waited #{timeout} sec, #{length}/#{@max} available" if to_wait <= 0
      # 讓 thread 進入 sleep 並釋放鎖，待 @resource.signal 或 @resource.broadcast 時才會喚醒 thread 並重新獲取鎖
      # 在往下執行，以這裡就是又進迴圈重新獲取/建立 connection
      # 按照 connection_pool 的設計是先 pop 然後連線用完在 push 進 stack，一次執行就是一對 pop/push 的動作
      # 這裡用 ConditionVariable 是因為只有 stack 有新元素的時候，才會需要在執行，不然就是當前情況仍沒有辦法獲取/建立新連線
      @resource.wait(@mutex, to_wait)
    end
  end
end

# 返回 stack 最上面的連線
def fetch_connection(options = nil)
  @que.pop
end

# 當已建立的連線還沒到達最大值的時候，執行 create_block，並且將已建立連線數加 1，然後返回物件本身
def try_create(options = nil)
  unless @created == @max
    object = @create_block.call
    @created += 1
    object
  end
end
```

## ConnectionPool Class

而 ConnectionPool 就是一個套件的接口方法，沒做什麼太複雜的事情，這裡我們就只看幾個主要的方法：`with`、`checkout`、`checkin` 。



主要存放資料的變數：

```ruby
def initialize(options = {}, &block)
  # ...

  @size = Integer(options.fetch(:size)) # 連線池的最大連線數量
  @timeout = options.fetch(:timeout) # Timeout 時間
  @auto_reload_after_fork = options.fetch(:auto_reload_after_fork)

  @available = TimedStack.new(@size, &block) # TimedStack 物件用來建立/獲取連線
  @key = :"pool-#{@available.object_id}" # TimedStack 物件對應的 連線池
  @key_count = :"pool-#{@available.object_id}-count" # TimedStack 物件對應的 連線數量

  # ...
end
```



`with` 方法先呼叫 `checkout` 拿到 connection，可以看到這裡用 `Thread.handle_interrupt(Exception ⇒ :never)` 包起來是因為希望這個區塊中的程式發生異常的時候被延遲到區塊結束在處理，確保 connection 正常釋放回到 connection pool 中。

```ruby
def with(options = {})
  Thread.handle_interrupt(Exception => :never) do
    conn = checkout(options)

    # ...
  end
end
alias_method :then, :with
```

而這裡又用 `Thread.handle_interrupt(Exception => :immediate)` 包覆則是因為當異常發生時馬上處理，不要延遲到區塊執行完畢延遲處理，而 ensure 則是發生異常也要把 connection 放回 connection pool 中。

```ruby
begin
  Thread.handle_interrupt(Exception => :immediate) do
    yield conn
  end
ensure
  checkin
end
```



`checkout` 方法其實就是從 connection pool 中拿到 connection 並把

- `@key_count + 1` 存回 current thread local variable

- 把拿到的 connection 物件存回 current thread local variable

```ruby
def checkout(options = {})
  if ::Thread.current[@key]
    ::Thread.current[@key_count] += 1
    ::Thread.current[@key]
  else
    ::Thread.current[@key_count] = 1
    ::Thread.current[@key] = @available.pop(options[:timeout] || @timeout)
  end
end
```



`checkin` 方法則是把 connection 物件（`TimedStack.pop` 拿到的）存回去 connection pool 中

```ruby
def checkin(force: false)
  if ::Thread.current[@key]
    if ::Thread.current[@key_count] == 1 || force
      @available.push(::Thread.current[@key])
      ::Thread.current[@key] = nil
      ::Thread.current[@key_count] = nil
    else
      ::Thread.current[@key_count] -= 1
    end
  elsif !force
    raise ConnectionPool::Error, "no connections are checked out"
  end

  nil
end
```

## ConnectionPool::Wrapper Class

透過 `method_missing` 讓定義在 Class 內的方法可以透過 `connection.send` 去執行，而不需要每次都拿 `ConnectionPool.new` 建立的 instance 丟到 with 方法的 block 中執行。

```ruby
def initialize(options = {}, &block)
  @pool = options.fetch(:pool) { ::ConnectionPool.new(options, &block) }
end

# ...

def method_missing(name, *args, **kwargs, &block)
  with do |connection|
    connection.send(name, *args, **kwargs, &block)
  end
end
```

後續就不用每次 call `with` 方法，然後把想執行的程式碼丟到 block 中了。

```ruby
$redis = ConnectionPool::Wrapper.new(size: 5, timeout: 3) { Redis.new }
$redis.sadd('foo', 1)
$redis.smembers('foo')
```


