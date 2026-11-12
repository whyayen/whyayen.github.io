---
title: Logstash JDBC input timezone 問題
date: 2020-12-07
tags:
 - Logstash
categories: 
 - ELK
---
## Summary
之前透過 Logstash 的 JDBC input 把資料從 MySQL 匯入到 Elasticsearch，結果發生某個 datetime 欄位的時間竟然差了約 6 個小時，一開始覺得很奇怪，因為存在資料庫的時間都是 `UTC +00:00`，而 Rails 存進去之前都會統一使用 `UTC +00:00` 進行存取，只有在 Application 內會依照預設時區設定顯示，所以一直摸不著頭緒是哪邊造成的，後來發現 MySQL 內的時區是 `CST`，而 `CST` 時區本身有四種含義：

1. Central Standard Time (標準時間：`UTC -06:00`、夏令時間：`UTC -05:00`)
2. Australia Central Standard Time (`UTC +09:30`）
3. China Standard Time (`UTC +08:00`)
4. Cuba Standard Time (`UTC -04:00`)

而這原因可能導致原本是台灣時區 `UTC +08:00`，變成 `UTC -06:00`，不過我遇到的案例比較特別，是資料庫存的時間已經是 `UTC +00:00`，但 MySQL 的時區是設 `CST`，而 JDBC 在抓時當成 Central Standard Time 而造成時間相較資料庫早 6 hrs。

## 解決辦法

解決辦法有 2 種，一種是 JDBC Connection String 指定 Timezone，另一種是改 MySQL 時間 

### JDBC Connection String 加上指定 UTC 時區
```
jdbc {
  ...
  jdbc_connection_string => "jdbc:mysql://${DB_HOST}/${DB_DATABASE}?useUnicode=true&useJDBCCompliantTimezoneShift=true&useLegacyDatetimeCode=false&serverTimezone=UTC"
  ...
}
```

### 修改 MySQL default timezone

1. 編輯 MySQL 檔案

**Linux**
```bash
sudo vi /etc/mysql/mysql.conf.d/mysqld.cnf
```

**MacOS**
```bash
vim /usr/local/etc/my.cnf
```

2. 設定 default timezone
```
[mysqld]
...
default-time-zone = "+00:00"
```

3. Restart MySQL


## 結論
因為時區基本上會透過 Rails 轉成 UTC 存在 DB，所以我們最終選擇使用方法二，直接修改 MySQL default timezone，因為沒使用什麼時間函數，所以沒什麼影響，如果要直接改 DB 時間，可能需確認是否會影響 Application 本身。然後 sync 到 Elasticsearch 的資料，舊的有時間差的資料，我們就沒進行處理了，畢竟四個小時後就沒影響。
