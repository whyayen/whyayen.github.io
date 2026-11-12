---
title: Git Push 到 Private EC2 Instance
date: 2021-02-22
tags:
 - EC2
 - VPC
 - Git
categories: 
 - AWS
---

## 前言
最近開始使用 [Beancount](https://github.com/beancount/beancount) 作帳，除了有日記帳，還能產資產負債表、損益表，不過是使用文字記帳，沒有資料庫等服務，而好處是可以做版本控制，所以希望在自己 Server 上，建立一個 Git Remote Repository 給我的其他設備可以同步 Beancount 帳本資料。

因為帳務資料較為私密的資料，不希望存放在 GitHub 之類，決定自己架台 Git Server，所以開一台在 Private Subnet 的 EC2 當 Git Server。

## VPC 架構
建立一個 VPC 包含：
- 1 個 Public Subnet
- 1 個 Private Subnet

架構上有點像是下面這張圖，只是是單 AZ（Availability Zone）：
![AWS - Linux Bastion Architecture](https://d1.awsstatic.com/partner-network/QuickStart/datasheets/linux-bastion-architecture.584765ff724625db9ab0d91a8ccb1c2eb7e15a5b.png)

所以大致上就是像上圖的左半部一樣，Public Subnet 指到一個 Internet Gateway，然後起一台 EC2 當 Linux Bastion 放在 Public Subnet，然後開 22 port 給自己連（沒設定任何 Auto Scaling、EIP），甚至這台 EC2 我都用 Spot Instance，反正一天連一次，instance 沒了再開就好，但 spot 的價格讓我比較負擔的起。

接著再起一台 EC2 當存放 Git Remote Repository 的機器，放在 Private Subnet 並允許此 VPC 內的機器可以透過 SSH 連線進來，至少 Bastion 那台要能連線進來。

## 建立 Git Remote Repository
當兩台機器 (Bastion、Git Server) 開好之後，可以先透過 SSH 連線到 Bastion 再連線到 Git Server 看連線是否正常（可用 SSH Agent 等方式節省連線繁瑣的程序），如果無法連線，可能 VPC 的設定有錯誤。

接著我們進到 Git Server 進行 Git 設定，可以參考 Pro Git [4.4 Git on the Server - Setting Up the Server](https://git-scm.com/book/en/v2/Git-on-the-Server-Setting-Up-the-Server) 的步驟做。

**建立 git user**
```bash
# Git Server
sudo adduser git
su git
cd
mkdir .ssh && chmod 700 .ssh
touch .ssh/authorized_keys && chmod 600 .ssh/authorized_keys
```

**把你的 Public Key 放入 authorized_keys**
```bash
# Git Server
cat /tmp/id_rsa.john.pub >> ~/.ssh/authorized_keys
cat /tmp/id_rsa.josie.pub >> ~/.ssh/authorized_keys
cat /tmp/id_rsa.jessica.pub >> ~/.ssh/authorized_keys
```

**建立 remote repository**
```bash
# Git Server
cd /home/git
mkdir project.git
cd project.git
git init --bare
Initialized empty Git repository in /srv/git/project.git/
```

截至目前為止 remote repository 已經建好了，上述步驟相當於你在 GitHub 建立一個 Repository。

## 設定 SSH 連線
透過編輯 `.ssh/config` 的方式我們可以簡單的直接連線到 Git Server，不用自己先連到 Bastion 再連到 Git Server。

```bash
# 你的電腦
vim ~/.ssh/config
```

假設我們兩台機器的 IP:
- Bastion: `35.174.52.219` (Public IPv4)
- Git Server: `192.168.0.34` (Private IPv4)

我們的 `.ssh/config` 如下：
```
Host 35.174.52.219
    HostName 35.174.52.219
    User ec2-user
    IdentityFile /your/ec2/key_path.pem

Host 192.168.0.34
    HostName 192.168.0.34
    User ec2-user
    IdentityFile /your/ec2/key_path.pem
    ProxyCommand ssh -W %h:%p 35.174.52.219
```

存檔後，便可直接透過 `ssh 192.168.0.34` 連線到 Git Server，後面設定 Git Remote 後，也才能透過 Git Push 將我們 local 的 repository 同步到 remote repository。

## 設定 Project 的 remote
接著我們回到 local 的 repository
```bash
cd ~/development/your_project
git remote add origin git@192.168.0.34:/home/git/project.git
git push origin master
```

應該就能成功了：
```
Counting objects: 4, done.
Delta compression using up to 12 threads.
Compressing objects: 100% (2/2), done.
Writing objects: 100% (4/4), 528 bytes | 528.00 KiB/s, done.
Total 4 (delta 1), reused 0 (delta 0)
To 192.168.0.34:/home/git/beancount.git
   0365711..5ecceb5  master -> master
```

## 參考資料
- [Pro Git](https://git-scm.com/book/en/v2/Git-on-the-Server-Setting-Up-the-Server)
- [git clone issues via an SSH proxied host](https://stackoverflow.com/questions/32654857/git-clone-issues-via-an-ssh-proxied-host?fbclid=IwAR3SvXOobzGk14H8nc3Mxc_Er5Tiz6wC6izz2AtNiakBpV2DpHCs97l5idk)
- [SSH ProxyCommand example: Going through one host to reach another server](https://www.cyberciti.biz/faq/linux-unix-ssh-proxycommand-passing-through-one-host-gateway-server/)