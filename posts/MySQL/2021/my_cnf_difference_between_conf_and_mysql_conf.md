---
title: Ubuntu 上 MySQL 5.7.32 的那些 my.cnf
date: 2021-01-07
tags:
 - MySQL
categories: 
 - MySQL
---

## 前言
最近因為使用 MySQL 的 JSON Aggregate 的一些 function，發現原系統是 `5.7.21`，但 JSON Aggregate Functions 在 `5.7.22` 才支援，加上系統有點舊，無法順利更新上 `5.7.32`，想說直接開一台較新的作業系統 (Ubuntu 18.04)，安裝新版 `5.7.32`，在進行一些設定時，發現 `5.7` 版的 MySQL 設定好繚亂，不是很清楚要設定哪個 configuration file。

## 版本差異
在 `/etc/mysql` 底下有下列這些檔案：
```
- my.cnf
- my.cnf.fallback 
- mysql.cnf
> conf.d
 - mysql.cnf
 - mysqldump.cnf
> mysql.conf.d
 - mysqld.cnf
```

首先有 `my.cnf` 及 `mysql.cnf` 這兩個檔案，究竟有何差異？
透過指令我們可以發現 `my.cnf` 其實是 link 到 `/etc/alternatives/my.cnf`。
```
my.cnf -> /etc/alternatives/my.cnf
mysql.cnf
```

再查看一下 `/etc/alternatives/my.cnf`，可以發現是 link 回 `/etc/mysql/mysql.cnf`。
```
/etc/alternatives/my.cnf -> /etc/mysql/mysql.cnf
```

所以無論你改 `/etc/mysql/mysql.cnf` 或 `/etc/mysql/my.cnf` 其實他們都是長一樣的。接著我們再來看 `/etc/mysql/mysql.cnf` 裡面的內容：
```
!includedir /etc/mysql/conf.d/
!includedir /etc/mysql/mysql.conf.d/
```

會把所有 `/etc/mysql/conf.d/` 及 `/etc/mysql/mysql.conf.d/` 裡面的 `.cnf` 檔案匯入，但 `conf.d/` 跟 `mysql.conf.d` 的差異是什麼呢？查到一個[討論](https://serverfault.com/a/954306)是說：
> !includedir /etc/mysql/mysql.conf.d/ is an SYSCONFDIR generate by ubuntu when Mysql was compiling for the package in CMAKE option.

以及這個答案的第一個 comment：
> Thanks for your reply. So I understand that /etc/mysql/mysql.conf.d is there just for retrocompatibility and /etc/mysql/conf.d is the way to go, right?

在經過我自己的一些測試後，發現 `mysql.conf.d` 資料夾是在 `5.7` 版本才出現的，我起兩台全新的 Ubuntu 14.04 Server，分別安裝 MySQL `5.5` 跟 `5.6`，`/etc/mysql` 下只有 `conf.d` 資料夾，並沒有 `mysql.conf.d`，再起一台 Ubuntu 18.04 Server 安裝 MySQL `5.7` 才出現 `mysql.conf.d`。

另外在 [MySQL 5.7 Reference Manual - 2.5.10 Managing MySQL Server with systemd](https://dev.mysql.com/doc/refman/5.7/en/using-systemd.html) 文件有提到
> To use multiple-instance capability, modify the my.cnf option file to include configuration of key options for each instance. These file locations are typical:
> - /etc/my.cnf or /etc/mysql/my.cnf (RPM platforms)
> - /etc/mysql/mysql.conf.d/mysqld.cnf (Debian platforms)

官方文件寫到可以使用 `multiple-instance capability` 可以修改 my.cnf option file，雖然不是在 option file 的章節裡面寫，而是在一個奇怪的地方寫 option file 一般存放的地方，但從這裡我們可以發現，官方有說一般這個檔案在 RPM 跟 Debian 系統的路徑在哪。

## 結論
我們可以發現 `5.7` 版本會出現 `mysql.conf.d` 資料夾，加上官方文件有提及 Debian 平台可以修改 `/etc/mysql/mysql.conf.d/mysqld.cnf`，所以我個人理解為 Debian 平台 `/etc/mysql/mysql.conf.d/mysqld.cnf` 是官方建議修改的地方，而 `conf.d` 是為兼容舊版使用。

當然在新系統安裝完 MySQL `5.7` 後，可以發現只有 `/etc/mysql/mysql.conf.d/mysqld.cnf` 裡面有詳細的設定，而 `/etc/mysql/conf.d/my.cnf` 是空的，但對於 MySQL 從 `5.6` 升級上來的，可能就有彼此改在不同檔案的問題，最好的方式還是團隊溝通、建立共識改單一一個 configuration file，避免造成設定被覆蓋，是比較重要的。

## 參考資料
- [MySQL 5.7 Reference Manual - 4.2.2.2 Using Option Files](https://dev.mysql.com/doc/refman/5.7/en/option-files.html)
- [MySQL 5.7 Reference Manual - 2.5.10 Managing MySQL Server with systemd](https://dev.mysql.com/doc/refman/5.7/en/using-systemd.html)
- [MySQL 8 on Ubuntu: what's the difference between /etc/mysql/conf.d/ and /etc/mysql/mysql.conf.d/?](https://serverfault.com/a/954306)