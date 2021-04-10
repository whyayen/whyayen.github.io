---
title: 讓 elastic-model 的 msearch 也有 records 方法
date: 2021-04-10
tags:
 - Rails
 - Elasticsearch
categories: 
 - Ruby on Rails
 - ELK
---

## 前言
在 Rails 內要與 Elasticsearch 服務整合成 ActiveRecord::Base 的話，我們會使用 [elastic-model](https://github.com/elastic/elasticsearch-rails/tree/master/elasticsearch-model) 來對 index 做 search，透過 Model 的 `__elasticsearch__ ` proxy 可對單一 index 做 search，且可透過 `records` 方法將 Elasticsearch 的搜尋結果轉換為 ActiveRecords，然而使用 `msearch` 同時搜尋多個 index 時就不支援此方法了。

## 單 index 搜尋
我們先來看只對單一 index 搜尋時，要如何透過 `elastic-model` 來達成，首先必須在 Model 進行設定：

```ruby
require 'elasticsearch/model'

class Article < ActiveRecord::Base
  include Elasticsearch::Model
end
```

如果需要一些額外設定，例如將 Model 對應到特定 index，可以參考 [Index Configuration](https://github.com/elastic/elasticsearch-rails/tree/master/elasticsearch-model#index-configuration) 的相關說明。

一般 Model 會有一個 `__elasticsearch__` 的 proxy，詳細可以參考 [The __elasticsearch__ Proxy](https://github.com/elastic/elasticsearch-rails/tree/master/elasticsearch-model#the-elasticsearch-client) 小節，有了這個 proxy 便可進行 index 的搜尋等行為：

```ruby
Article.__elasticsearch__.search('fox')
Article.search('fox')
```

個人還是比較建議用第一種 `__elasticsearch__` 方式去呼叫 `search` 方法，因為 `search` 方法可能已經存在 Model 本身作為其他用途了，如果用 `Model.search` 遇到 `search` 方法被用走，又要改成用 `__elasticsearch__` proxy 呼叫時，就又顯得不統一、凌亂。

如果今天有多個 Elasticsearch Host，勢必意味著需要多個 Client，如果 Model 需要使用不同的 Client，可以參考 [The Elasticsearch client](https://github.com/elastic/elasticsearch-rails/tree/master/elasticsearch-model#the-elasticsearch-client) 的方式設定。

了解基礎設定後，我們便可透過 Model 進行搜尋了：
```ruby
response = Article.search 'fox dogs'

response.results # Elasticsearch 搜尋的結果
response.records.to_a # 把搜尋結果轉成 ActiveRecords
```

## 多 index 搜尋
`search` 方法本身支援多個 Model/Index 的搜尋，例如：
```ruby
Elasticsearch::Model.search('fox', [Article, Comment]).results.to_a.map(&:to_hash)
```

不過這比較不適合我的使用場景，所以使用 `msearch` 方法，也就是 Elasticsearch 的 [msearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-multi-search.html) API，使用方式大同小異，只是把 payload 變 Ruby 的 Hash 而已，不過缺點是 `msearch` 沒有 `search` 那些像是 `records` 之類的方法可以用，只有單純的把 JSON 轉成 Hash 而已。

```ruby
payload = [
  { index: 'articles' },
  {
    size: 5,
    query: {
      bool: {
        must: [
          {
            multi_match: {
              query: 'Frontend Developers',
              type: "most_fields",
              operator: 'and',
              fields: ['title', 'description']
            }
          }
        ]
      }
    }
  }
]
Elasticsearch::Model.client.msearch(payload)
```
 
如果要用 `msearch` 又想要有 `records` 的話，則必須要自己轉了，我們可以參考一下 `elastic-model` 在呼叫 `search` 後會做哪些事情，先來看一下 [search](https://github.com/elastic/elasticsearch-rails/blob/80822d69a7/elasticsearch-model/lib/elasticsearch/model/searching.rb#L116) 的程式碼：

```ruby
class SearchRequest
  def execute!
    klass.client.search(@definition)
  end
end

...

module ClassMethods
  def search(query_or_payload, options={})
    search   = SearchRequest.new(self, query_or_payload, options)

    Response::Response.new(self, search)
  end
end
```

我們可以知道會去建立一個 Response Object，所以來看一下 [Response Class](https://github.com/elastic/elasticsearch-rails/blob/80822d69a7f33a13fdfc294035bf57fa9777ff17/elasticsearch-model/lib/elasticsearch/model/response.rb#L29) 的實作：

```ruby
def initialize(klass, search, options={})
  @klass     = klass
  @search    = search
end

# Returns the Elasticsearch response
#
# @return [Hash]
#
def response
  @response ||= HashWrapper.new(search.execute!)
end

# Returns the collection of records from the database
#
# @return [Records]
#
def records(options = {})
  @records ||= Records.new(klass, self, options)
end
```

`records` 方法就只是 new 一個  Records 物件，把 `klass`（也就是 Model，比方說你呼叫 `Article.search` 那就是 `Article` ）及 self （Response Object 傳進去﹚。

至此我就沒深追下去相關實作了，因為還有一些 Adapter 方面的實作蠻複雜的，不過可以確定一件事就是 `Records.new` 基本上可以得到跟　`Article.search('fox').records` 的行為一樣，所以我就做了一些嘗試，最終發現帶入對應的 Model Class、Hash Wrapper 即可。

`Records.new(klass, self)` 中的 `klass` 就是 Response Class 的 `@klass`，這個 `@klass` 便是 new Response 時所帶入的 `self`，而這個 `self` 就是呼叫 `search` 方法的 Class，也就是 Model（`Article.search`、`User.search`）
```ruby
module ClassMethods
  def search(query_or_payload, options={})
    search   = SearchRequest.new(self, query_or_payload, options)

    Response::Response.new(self, search)
  end
end
```

而 `Records.new(klass, self)` 中的 `self` 本應是 Response 物件，不過我嘗試 new 一個 Response 物件發現其會呼叫 `search.execute!` 或是 `@search` 的相關方法，因此無法先 new Response 物件，然後在 new Records，不過我們可以看到 `response` 方法是將其結果透過 `HashWrapper` 轉化出來的，於是我就嘗試著把 `msearch` 的結果，轉成 HashWrapper，然後丟給 Records，最終便可以得到把 Elasticsearch results 轉成 ActiveRecords。

相關實作程式碼：

```ruby
class Response
  def initialize(response)
    @response = response
  end

  def records
    @records ||= @response['responses'].reduce({}) do |records, r|
      index_name = get_index_of_first_doc(r) # 抓第一筆結果 index 是哪個，如：articles

      if index_name.present?
        model = index_name.classify.constantize # 把 index name 轉成 Model，如 Article
        hash_wrapper = Elasticsearch::Model::HashWrapper.new({'response': r}) # 把 results 轉成 HashWrapper

        records_of_index = Elasticsearch::Model::Response::Records.new(model, hash_wrapper).records.to_a
        # 把 articles index 的結果轉成 ActiveRecords 在這就像是
        # Elasticsearch::Model::Response::Records.new(Article, hash_wrapper).records.to_a
        records.update(index_name.to_sym => records_of_index)
      end

      records
    end
  end

  private
  def get_index_of_first_doc(result)
    result['hits']['hits'][0]['_index'] if result['hits']['hits'] && result['hits']['hits'].length > 0
  end
end
```


## 總結
寫得有些凌亂，也不是很好懂，且 Records 後面我是靠猜測加實驗，並沒有深追實作方式及原理，最終發現可以如期得到我想要的結果，因此可能有部分理解錯誤、寫錯的地方，還請多多包涵、指正，總之 `mseach` 實作 `records` 的方法是做得到，只是大家的 `msearch` 搜尋方式及結果都不太一樣，可能無法像 `search` 的 response 這麼單純，所以可能需要修改成自己的使用場景。