---
date: 2026-11-14
tags:
- AI
categories:
- AI
---

# 在 AI 海量的 PR 下，Matt Pocock 是如何進行 code review？

Matt Pocock 在 [Fixing the PR Bottleneck - Matt Pocock](https://www.youtube.com/watch?v=LlgiOCmFG_w) 這部影片中主要探討：當 coding agent 讓程式碼產出速度大幅提升時，如果避免 PR Review 成為軟體開發的新瓶頸。

Matt 的核心觀點：
> 不應該只是用更多 AI 產生程式碼，而是建立多層品質把關機制，讓人工類把注意力集中在真正高風險、需要判斷的變更上。

## 使用 3 層 code review 架構

軟體工廠：工作不再全部由人發起，而是相關報告一進來，系統就自動交給 agent 去修正、開 PR，這種工廠會讓 code 越流越快，一座只有油門沒有煞車的工廠，只會得到一大堆很爛的 PR，多到碰不了、review 不了，所以需要煞車，讓速度慢下來，讓品質變高。Agent 寫新 code 時，會去參考現有的 code，所以有一塊爛 code 放進去，它就會照著同樣的樣子產生更多的爛 code，所以需要煞車，煞車會讓速度變慢，但能守住讓 agent 下一輪要參考的那份 code 的品質。

3 層煞車：
- Layer 1: Deterministic Checks
    - Tests、Lint、Type Check、靜態分析等
    - 自動化，便宜、快速、結果可重複的檢查
- Layer 2: AI Code Reviewer
    - 架構、可維護性、團隊 coding standars
    - 由另一個獨立的 Agent & Context 負責
- Layer 3: Human Review
    - 系統風險、業務邏輯、**不可逆變更**
    - 集中精審查高風險決策

目的是儘量讓問題在前 2 層就被解決，而不是全部交給工程師人工 review。

## 測試會說謊

AI 很容易產生沒有實際價值的測試，例如原本的邏輯可能長這樣：

```javascript
export const X_POST_CHARACTER_LIMIT = 280;
```

AI 可能會寫出這樣的測試：
```javascript
describe("x-character-count", () => {
    it("has a limit of 280 characters", () => {
        expect(X_PORT_CHARACTER_LIMIT).toBe(280);
    });
});
```

基本上就是把實作再寫一次，它沒檢查功能到底對不對，哪天如果 X 把字數上限調高，測試就會壞掉。

透過 Deep Module 把很多複雜的行為藏在一個很小的介面後面，外面的人只能從這個小介面去用它，逼 agent 用那個小小的介面，不要讓它把手伸進實作裡，去測那些奇怪的實作細節，可以做三件事：
1. 測試只準打在模組對外的介面上
2. 看到把實作再寫一次的測試，直接刪除
3. 用 `/improve-codebase-architecture` 找可以變深的模組

## 將寫 code 和守規範分別交給兩個 agent
應該把團隊寫法、規範放在 `CODING_STANDARS.md`，而不要直接放在 `AGENT.md` 或 `CLAUDE.md`，理由是：
寫 code 的 agent 的 context window 已經塞滿：
- 找要改的檔案
- 修過
- 跑測試、修錯誤

再加上寫法規範可能已經 overloaded，超過 context window 上限了，每件事可能都做的比較差，AI 可能讀也可能不讀。

Matt 我們都希望 code 一次寫好，但這樣效果可能比較差，他把寫出好 code 看成 2 個步驟：
```
/implement = Make It Work

/code-review = Make It Good
```

第一步實作，讓它能動，第二步 code review，讓它變好，把規範放入 `CODING_STANDARDS.md`，讓只有 review 的 agent 去執行，因為 review agent 只看改動的部分，腦袋比較空，放得下規範。

## 人類 Review 的優先級取決於風險，而非程式碼行數

大部分人的設定是讓 review 的 agent 在找到問題之後，在 PR 底下留言，再由人 review 決定要不要改，Matt 覺得這等於是在幫人類增加工作。

Matt 認為：<span class="text-red">reviewer 應該直接 commit，應該動手修，把它找到的問題解決</span>，只有 agent 自己也不確定的地方才留言問人類。

## 人類只守單向門

哪些 PR 需要人類看？Matt 借用 Amazon 的單向門、雙向門方法：
- 單向門：無法簡單撤回，可能有很大影響的<br>
    例如：一個簡單的改動，可能會發 6 萬封郵件給使用者；expensive migration 或 data loss。
- 雙向門：merge 之後，可以很容易撤回，不會有影響的

<span class="text-red">對於單向門要很小心的 review，把 PR 看到爛！單向門不一定改動很大，很可能改動很小，影響卻很大。</span>

所以判斷的方法是問：**這個改動出錯之後還能否撤回**。

Matt 的 `pr` skill 會把這件事寫進每一個 PR 描述裡：
```
## Summary

## Merge Danger
Door: two-way
Blast radius: localized
```
會多 Door 和 Blast radius，而 Blast radius 就是出錯時會影響多少使用者、資料或系統

<span class="text-red">雙向門看過就好，把時間留給單向門</span>

## Review 的是系統，不是這次的 code

> Review the system, not just the code.

在做 review 時，應該 review agent 產生 PR 的整個系統，而非只有程式碼，原則是：
- 同一句意見不要寫兩次，不要在 2 個 PR 裡抓到 agent 犯同一種錯

Matt 的 `/retro` skill，把做完的工作拿來回顧，可以是：
- 一次對話
- 一個 PR
- 過去一週所有的 PR

Retro 會提供一些建議，例如：
- 加一個自動檢查
- 更新寫法規範

能寫成檢查的，不要寫成規則，因為規則 agent 可能不會讀，但檢查每一次都會跑。

## References
[Fixing the PR Bottleneck - Matt Pocock](https://www.youtube.com/watch?v=LlgiOCmFG_w)