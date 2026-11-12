---
title: Circle CI 自動 skip GitHub Draft Pull Request
date: 2021-04-26
tags:
 - CI
categories: 
 - CI
---

## 前言
由於暫時不打算在 CI 工具上付費，基本上免費額度已經夠用，只是如果每 push 一次，就會跑一次 CI，好處是能當下看到是否有測試未通過，不過礙於測試一次跑完要耗費 150 credits 以上，免費額度大概 2 天就沒了，但對我們而言 Draft PR 是還在開發中，所以只要最終整合、驗收時測試有跑過就好。

## 實現方式
我們使用 Circle CI 本身並沒有直接支援 pattern 或設定的方式，可以直接跳過 GitHub Draft PR 不跑測試，所以找了一些解決方案，最終找到 [artsy/skip-wip-ci](https://circleci.com/developer/orbs/orb/artsy/skip-wip-ci) orb，不過有一些缺點就是要餵 `CIRCLE_PROJECT_USERNAME`、`CIRCLE_PR_REPONAME`、`CIRCLE_PR_NUMBER`、`CIRCLE_BUILD_NUM` 這些環境變數，有點麻煩，但其實這些環境變數已經是 [Built-in environment variables](https://circleci.com/docs/2.0/env-vars/#built-in-environment-variables)，所以理應可以只設定 `GITHUB_TOKEN`、`CIRCLE_TOKEN` 就可以跑這個 orb。

照著上面的想法，剛好那個 orb 是 MIT LICENSE 可以直接 fork 來改，於是大部分都是基於 [artsy/skip-wip-ci](https://circleci.com/developer/orbs/orb/artsy/skip-wip-ci) orb 的實作，稍微做了一些修正，流程如下：
1. 透過 Circle CI Built-in 環境變數，拿到 `CIRCLE_PROJECT_USERNAME`、`CIRCLE_PROJECT_REPONAME`、以及 PR Number
```
https://api.github.com/repos/${CIRCLE_PROJECT_USERNAME}/${CIRCLE_PROJECT_REPONAME}/pulls/${CIRCLE_PULL_REQUEST##*/}
```
2. 接著去打 API 檢查 PR 狀態是不是 Draft
3. 如果是 Draft，則去打 Circle CI API 取消整個 Workflow
```bash
curl -X POST https://circleci.com/api/v2/workflow/${CIRCLE_WORKFLOW_ID}/cancel -H 'Accept: application/json' -u "${CIRCLE_TOKEN}:"
```

## bye-github-draft
[bye-github-draft](https://github.com/whyayen/bye-github-draft) 是基於 [artsy/skip-wip-ci](https://circleci.com/developer/orbs/orb/artsy/skip-wip-ci) fork 出來修改的版本，使用前必須先：

1. 確保 Organization Settings 有開啟 **Allow Uncertified Orbs** 設定
2. 去 User settings 建立 **Personal API Tokens**（**Circle CI API v2 不支援 Project Token**）
3. 到 Circle CI Project Settings 新增環境變數，名稱：`CIRCLE_TOKEN`，值為剛剛建立的 Personal API Token
4. 到 GitHub 建立 Personal Access Token，需包含 `repo` 權限
5. 到 Circle CI Project Settings 新增環境變數，名稱：`GITHUB_TOKEN`，值為剛剛戀的 GitHub Personal Access Token
6. 修改你的 `config.yml`

```yaml
version: 2.1 # 一定要是 2.1 版，2.0 過不了
orbs:
  bye-github-draft: whyayen/bye-github-draft@0.0.1

# 你的 jobs/workflows/commands

workflows:
  your_workflow:
    jobs:
      - bye-github-draft/check-skippable-pr
      # 確保你的 job 跑在 check-skippable-pr 之後
      - your_job:
          requires:
            - bye-github-draft/check-skippable-pr
```

## 總結
照著上述使用 orb 的步驟，應該是蠻輕鬆簡單可以做到 Circle CI skip GitHub Draft PR，不過缺點是當你把 Draft PR 轉為一般 PR 後，沒有 push 任何 commit，就等於整個 PR 都沒跑過測試，其實蠻容易讓程式碼變髒、測試沒有維護等問題出現，其次是它仍然會消耗約 2 ~ 3 credits，不過如果暫時沒有經費花費在 CI 上，也許這也是一種做法，但是團隊內應該要討論 Merge 之前，要如何確保程式通過測試、跑測試的機制。