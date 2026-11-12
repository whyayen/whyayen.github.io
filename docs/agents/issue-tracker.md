# Issue tracker: GitHub

工作票與規格存放於 whyayen/whyayen.github.io 的 GitHub Issues。
使用 gh CLI，明確指定 --repo whyayen/whyayen.github.io。

- 建立前確認目標倉庫並檢查是否已有相同工作票。
- 讀取工作票時一併讀取本文、標籤與留言。
- 多行本文寫入暫存檔，以 --body-file 傳入。
- 依阻擋順序建立工作票，先建立前置票。
- 優先使用 GitHub 原生 issue dependencies；
  不支援時，在本文列出 Blocked by: #編號。
- 依賴全部完成才可開始；ready-for-agent 不代表依賴已解除。
- 來源為既有 Issue 時，將工作票設為其子 Issue；
  不支援時在本文標明父 Issue。
- 發布工作票時套用 ready-for-agent 標籤。
- 不因拆票而關閉或修改父 Issue。

PRs as a request surface: no.
