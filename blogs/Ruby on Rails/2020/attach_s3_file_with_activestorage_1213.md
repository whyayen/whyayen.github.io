---
title: 如何把 S3 上的檔案透過 ActiveStorage attach 回 Rails 的 record
date: 2020-12-13
tags:
 - Rails
 - ActiveStorage
categories: 
 - Ruby on Rails
---

## 前言
最近開發一個功能是將 ActiveStorage 上傳至 S3 的檔案，進行轉檔後，在將轉完的檔案 attach 回該 record，假設有一個 model 叫做 `User`，並且有兩個 ActiveStorage `has_one_attached` 的欄位，一個是 `original_file`，另一個 `converted_file`，我可以透過 `User.original_file` 及 `User.converted_file` 抓到原始及轉檔後的檔案。

透過 ActiveStorage 上傳檔案到 GCP、S3 很簡單，官方文件寫的很清楚，但如果你的檔案是透過其他服務（轉檔服務）等放到 S3，而不是透過你本身的 Application 上傳，要如何把已經在 S3 的檔案關聯回 record 呢？下面透過 ActiveStorage source code 一步一步說明如何達到此需求。

## ActiveStorage 原理
在 [ActiveStorage 文件](https://edgeguides.rubyonrails.org/active_storage_overview.html)中，並沒有提到如何把已經在 S3 的檔案，在綁回 model 中 ActiveStorage 的欄位，雖然在 StackOverflow 有找到解答，但並不清楚 ActiveStorage 的運作方式，所以也不明白為何要這麼寫，因此了解 ActiveStorage 的原理才能知道為何要這麼寫！

以下將以 Rails v5.2.0 版來解析 ActiveStorage 原理，Storage Service 也都會以 S3 為主（當然其他 Service 也大同小異），其程式碼可以參考此[連結](https://github.com/rails/rails/tree/v5.2.0/activestorage)。

### 資料表結構
從 [migrations](https://github.com/rails/rails/blob/v5.2.0/activestorage/db/migrate/20170806125915_create_active_storage_tables.rb) 可以發現 ActiveStorage 新增 2 張資料表

```Ruby
create_table :active_storage_blobs do |t|
  t.string   :key,        null: false
  t.string   :filename,   null: false
  t.string   :content_type
  t.text     :metadata
  t.bigint   :byte_size,  null: false
  t.string   :checksum,   null: false
  t.datetime :created_at, null: false

  t.index [ :key ], unique: true
end

create_table :active_storage_attachments do |t|
  t.string     :name,     null: false
  t.references :record,   null: false, polymorphic: true, index: false
  t.references :blob,     null: false

  t.datetime :created_at, null: false

  t.index [ :record_type, :record_id, :name, :blob_id ], name: "index_active_storage_attachments_uniqueness", unique: true
end
```

- `active_storage_blobs`: 儲存檔案相關內容
  - `key`: 存在 Service 上的名稱，如：S3 上檔案的 key
  - `filename`: 原始（上傳時）的檔案名稱
  - `content_type`: 檔案的 Content Type (Media Type)
  - `metadata`: 一些 metadata
  - `byte_size`: 檔案大小
  - `checksum`: 用來檢查檔案送到 Service 後，與當初計算的是正確（同個檔案）
- `active_storage_attachments`: 儲存關聯的 Model 及 Blob
  - `name`: Model 的 ActiveStorage 欄位名稱，如：`original_file`
  - `record_type`: Model 名稱，如：`User`
  - `record_id`: 關聯 Model 的 `id`
  - `blob_id`: 關聯 Blob 的 `id`

這裡比較難懂的應該是 `checksum`，自己當初有點好奇為何需要 `checksum`（抱歉，我菜QQ）。
我們來看一下 ActiveStorage upload 做了什麼事情

[activestorage/app/models/active_storage/blob.rb](https://github.com/rails/rails/blob/v5.2.0/activestorage/app/models/active_storage/blob.rb#L139)

```ruby
  # Prior to uploading, we compute the checksum, which is sent to the service for transit integrity validation. If the
  # checksum does not match what the service receives, an exception will be raised. We also measure the size of the +io+
  # and store that in +byte_size+ on the blob record.
  #
  # Normally, you do not have to call this method directly at all. Use the factory class methods of +build_after_upload+
  # and +create_after_upload!+.
  def upload(io)
    self.checksum     = compute_checksum_in_chunks(io)
    self.content_type = extract_content_type(io)
    self.byte_size    = io.size
    self.identified   = true

    service.upload(key, io, checksum: checksum)
  end
```

> Prior to uploading, we compute the checksum, which is sent to the service for transit integrity validation.

仔細看第一行註解，這裡有敘述 upload 實作的詳細過程，而也提到 `checksum` 扮演的角色。
接著我們來看 S3 這個 Service upload 是如何實作的吧

[active_storage/service/s3_service.rb](https://github.com/rails/rails/blob/v5.2.0/activestorage/lib/active_storage/service/s3_service.rb)

```ruby
def upload(key, io, checksum: nil)
  instrument :upload, key: key, checksum: checksum do
    begin
      object_for(key).put(upload_options.merge(body: io, content_md5: checksum))
    rescue Aws::S3::Errors::BadDigest
      raise ActiveStorage::IntegrityError
    end
  end
end
```

簡單來說就是上傳前我們會對檔案做計算，會產生一組 MD5 的 hash，上傳時會把 `checksum` 也給 S3，S3 收到檔案後一樣會做計算，如果與 `checksum` 不同，則會 raise `Aws::S3::Errors::BadDigest`，以此去避免檔案內容損壞、竄改。

可參考：
- [S3 v2 SDK for ruby - #put](https://docs.aws.amazon.com/sdk-for-ruby/v2/api/Aws/S3/Object.html#put-instance_method)
- [How can I check the integrity of an object uploaded to Amazon S3?](https://aws.amazon.com/tw/premiumsupport/knowledge-center/data-integrity-s3/)

### 建立檔案已經在 S3 上的 Blob

雖然 ActiveStorage 的 Tutorial 內沒寫，不過在 API Docs 跟 ActiveStorage Source Code 有說明如何建立一個已經上傳的 Blob。

[activestorage/app/models/active_storage/blob.rb#L3](https://github.com/rails/rails/blob/v5.2.0/activestorage/app/models/active_storage/blob.rb#L3)
```ruby
# A blob is a record that contains the metadata about a file and a key for where that file resides on the service.
# Blobs can be created in two ways:
#
# 1. Subsequent to the file being uploaded server-side to the service via <tt>create_after_upload!</tt>.
# 2. Ahead of the file being directly uploaded client-side to the service via <tt>create_before_direct_upload!</tt>.
#
# The first option doesn't require any client-side JavaScript integration, and can be used by any other back-end
# service that deals with files. The second option is faster, since you're not using your own server as a staging
# point for uploads, and can work with deployments like Heroku that do not provide large amounts of disk space.
```

根據註解說明：如果檔案已經被上傳到 Service，則可以透過 `create_before_direct_upload!` 建立 Blob，那麼我們就來直接看 `create_before_direct_upload!` 的實作。

[activestorage/app/models/active_storage/blob.rb#L64](https://github.com/rails/rails/blob/v5.2.0/activestorage/app/models/active_storage/blob.rb#L64)
```ruby
# Returns a saved blob _without_ uploading a file to the service. This blob will point to a key where there is
# no file yet. It's intended to be used together with a client-side upload, which will first create the blob
# in order to produce the signed URL for uploading. This signed URL points to the key generated by the blob.
# Once the form using the direct upload is submitted, the blob can be associated with the right record using
# the signed ID.
def create_before_direct_upload!(filename:, byte_size:, checksum:, content_type: nil, metadata: nil)
  create! filename: filename, byte_size: byte_size, checksum: checksum, content_type: content_type, metadata: metadata
end
```

我們發現建立一個 Blob 至少需要 `filename`、`byte_size`、`checksum`，而這三個除了 `checksum`，其他我們都可以透過 S3 `get_object` 拿到資料，而 `checksum` 我們則需要實作計算的方式，我是直接 copy Blob 內的 private 方法 `compute_checksum_in_chunks` 來實作。

接下來讓我們自己來實作建立一個檔案已經存放在 S3 的 Blob 吧：
```ruby
def compute_checksum_in_chunks(io)
  Digest::MD5.new.tap do |checksum|
    while chunk = io.read(5.megabytes)
      checksum << chunk
    end

    io.rewind
  end.base64digest
end

def create_blob(s3_key)
  s3 = Aws::S3::Client.new(region: CloudConvert.config.s3[:region])
  converted_file = s3.get_object({bucket: CloudConvert.config.s3[:bucket], key: s3_key})

  blob_params = {
    filename: "change_your_filename.pdf",
    content_type: converted_file.content_type,
    byte_size: converted_file.content_length,
    checksum: compute_checksum_in_chunks(converted_file.body)
  }

  blob = ActiveStorage::Blob.create_before_direct_upload!(blob_params)
  blob.update_attributes key:s3_key

  return blob
end
```

這邊有一點值得注意的是：建立一個 Blob 時，Blob 會自己產生一個 `key`，但這組 `key` 並不是 S3 上檔案的 `key`，因此我們需要透過 `update_attributes` 去改 `key` 參數。

關於 key 的實作，可以看一下 Blob 內的實作：

[activestorage/app/models/active_storage/blob.rb#L83](https://github.com/rails/rails/blob/v5.2.0/activestorage/app/models/active_storage/blob.rb#L83)
```ruby
# Returns the key pointing to the file on the service that's associated with this blob. The key is in the
# standard secure-token format from Rails. So it'll look like: XTAPjJCJiuDrLk3TmwyJGpUo. This key is not intended
# to be revealed directly to the user. Always refer to blobs using the signed_id or a verified form of the key.
def key
  # We can't wait until the record is first saved to have a key for it
  self[:key] ||= self.class.generate_unique_secure_token
end
```

到這裡為止，我們已經可以透過 `create_blob` 這個方法丟入 `s3_key` 給他，然後我們會得到建立好的 Blob，這時候我們可以直接更新 ActiveStorage 設定的那個欄位（這裡以 `has_one_attached` 的欄位 `converted_file` 做示範）。

```ruby
converted_blob = create_blob('converted/example_s3_file_key')

user = User.find(1)
# 直接餵 blob
user.update!(converted_file: converted_blob)

# 或者餵 blob 的 signed_id
user.update!(converted_file: converted_blob.signed_id)
```

這樣就實作完了，把已經在 S3 上的檔案，關聯回 Rails 的 record 了，至於 `update` 時要餵 Blob 或 Blob 的 `signed_id` 其實都可以，這邊會特別拿出來說明是因為當時 [StackOverflow 的範例](https://stackoverflow.com/questions/52323977/rails-activestorage-attachment-to-existing-s3-file)只有 signed_id，困惑了我很久，不過這裡有找到相關的原始碼（此處以 `has_one_attached` 來說明）：

[activestorage/lib/active_storage/attached/one.rb#L16](https://github.com/rails/rails/blob/v5.2.0/activestorage/lib/active_storage/attached/one.rb#L16)
```ruby
def attach(attachable)
  blob_was = blob if attached?
  blob = create_blob_from(attachable)

  ...
end
```

[activestorage/lib/active_storage/attached.rb#L18](https://github.com/rails/rails/blob/v5.2.0/activestorage/lib/active_storage/attached.rb#L18)
```ruby
def create_blob_from(attachable)
  case attachable
  when ActiveStorage::Blob
    attachable
  when ActionDispatch::Http::UploadedFile, Rack::Test::UploadedFile
    ActiveStorage::Blob.create_after_upload! \
      io: attachable.open,
      filename: attachable.original_filename,
      content_type: attachable.content_type
  when Hash
    ActiveStorage::Blob.create_after_upload!(attachable)
  when String
    ActiveStorage::Blob.find_signed(attachable)
  else
    nil
  end
end
```

這裡可發現你餵的 `attachable` 會檢查是什麼，如果是 `String` 則會以 `signed_id` 去做存取，如果是 `Blob` 則會直接寫 attachable，註解表示可以餵 4 種類型的參數：

```ruby
#   person.avatar.attach(params[:avatar]) # ActionDispatch::Http::UploadedFile object
#   person.avatar.attach(params[:signed_blob_id]) # Signed reference to blob from direct upload
#   person.avatar.attach(io: File.open("/path/to/face.jpg"), filename: "face.jpg", content_type: "image/jpg")
#   person.avatar.attach(avatar_blob) # ActiveStorage::Blob object
```

不過我並沒有去探究 `update!` 方法到 `attach` 中間過程的程式碼跟實現方式，這裡我並沒有辦法很確定是不是直接關聯到這，但 `update!` 存取時餵 `Blob` 或 `Blob 的 signed_id` 我測試過是可行的。


## 參考資料
- [Rails ActiveStorage attachment to existing S3 file](https://stackoverflow.com/questions/52323977/rails-activestorage-attachment-to-existing-s3-file)
- [Rails ActiveStorage](https://github.com/rails/rails/tree/v5.2.0/activestorage)