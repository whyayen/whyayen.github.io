---
date: 2026-09-05

tags:
 - AI
categories: 
 - AI
---

# Matt Pocock 是如何寫出這麼好的 Agent Skills

Matt Pocock 的 grill-me 爆火之後，自己也去體驗使用，實際用起來的效果超乎自己預期，能夠流程化各步驟，而且 Matt Pocock 的每個 skill 描述都相當精簡，但產出效果卻比自己原本的方式好上太多，使用上也不會耗費太多 token，反觀過去自己寫的 skills 卻寫了很多，反而影響了 Agent 的判斷能力。

因而特地看一下 Matt Pocock 究竟是用什麼樣的思維在撰寫 skill，而以下是觀看 [Building Greate Agent Skills: The Missing Manual](https://www.youtube.com/watch?v=UNzCG3lw6O0) 的個人筆記。

## Skill Hell

過去大家會安裝各式各樣的 skills，我們可能甚至都不清楚這些 skills 裡面寫了什麼，不知道何時該使用哪個，甚至 skill 會互相干擾，導致 Agent 行為不如預期，而企業也不知道如何把內部 SOP 轉化為可靠的 Agent Skills，因此 Matt Pocock 提出了一套四個面向的評估方法：

1. Trigger - 誰來決定何時使用 skill
2. Structure - 如何組織流程與參考資料
3. Steering - 行為引導
4. Pruning - 精簡優化

## Trigger

第一個重要決策：skill 應該由使用者主動執行，還是讓 AI 自己判斷何時執行

|         |  User-invoked | Model-invoked |
| :---:   |     :---:     |     :---:     |
| 觸發方式 | 使用者明確呼叫 | Agent 自動選擇 |
| 優點 | 可控性、可預測 | 自動化、方便 |
| 缺點 | 使用者要記得呼叫 | 可能沒呼叫或錯誤呼叫 |
| 主要成本 | Cognitive Load | Context Load |
| 適合場景 | 明確的工作流程 | 經常需要自動辨識的任務 |

### Context Load & Cognitive Load

- **Context Load**
    
    如果有 100 個 Model-invoked Skills，Agent 可能需要在每次請求時看到這個 100 個 skill 的描述，即便沒讀取完整內容，描述本身也會消耗 tokens。

- **Cognitive Load**

    如果全部改成 User-invoked，Agent 不需要自行挑選這些 Skill，但使用者就必須記得：
    - 有哪些 skills？
    - 每個 skill 的用途
    - 何時應該呼叫？
    - 按照什麼順序執行？

Matt 偏好 **User-invoked Skills**，因為他比較重視可預測性，而 Model-invoked 多了一個不確定性因素，即使某個 skill 很適合當前任務，Agent 仍可能不使用它，但這只是一種取捨，不代表 Model-invoked 不好。

## Structure

大部分 skill 都可以拆成 2 個單元：

- Steps

    告訴 Agent 要做什麼、依照什麼順序完成。<br>
    例如：讀取程式碼、分析問題、執行測試。

- References

    提供執行流程所需的背景、規範、範本。<br>
    例如：PRD Template、Coding Convention、API Spec。


以 Matt 自己實作 `/to-prd` 當範例，其流程包含：
1. Find relevant context
2. Confirm test seams
3. Write the PRD

而 Reference 則包含 Test Seam 的說明，以及 PRD 文件模板。

最重要的設計原則：<span class="text-red">保持 SKILL.md 精簡</span>，不要把所有文件、模板和條件分支塞進同一份 SKILL.md。

例如：

:::file-tree Skill 目錄結構

- create-prd
  - SKILL.md # 主要流程與必要的檔案引用
  - references
    - test-seams.md # 測試邊界說明
    - prd-template.md # PRD 文件模板
    - adr-template.md # 架構決策模板，僅必要時讀取
:::

只有當 Agent 需要撰寫 ADR 時，才去讀取 `adr-template.md`，而不是每次都載入完整模板，也就是所謂的 **Progressive Disclosure（漸進式揭露）**：先提供必要資訊，遇到特定情況再載入詳細內容，這樣做可以減少不必要的上下文、降低維護成本，並讓 Skill 更容易理解。

## Steering

常見的 Failure Mode:
1. The agent doesn't do what I want

    明明已經在 skill 中寫清楚要求，但 Agent 還是沒有按照預期執行。

    Matt 提到應該要使用：**Leading Words** 用關鍵詞引導行為，Leading Words 是指能用很短的文字承載大量語意的關鍵詞。

    影片中的例子 Vertical Slice：<br>
    假設要求 Agent 開發完整功能，它可能會採用先完成全部 DB 設計，再完成 API，最後才整合前端，端到端的驗證可能很晚才發生（code layer by layer），而 Vertical Slice 則是一次完成一條功能路徑，先完成 Feature A 的端到端流程，驗證能運作後，再實作 Feature B、Feature C。

    所以 Matt 建議，不要只是寫一大段「不要先完成所有 Database Layer」之類的指令，而是在 skill 中反覆使用 Vertical Slice 這個概念，當 Agent 在規劃與執行時，持續採用這個詞彙，就可能更傾向於選擇 Vertical Slice 的實作方式。

2. The agent didn't do enough legwork

    Agent 經常會為了盡快完成最終目標，而草率執行中間步驟。

    Matt 用 Plan Mode 舉例，原本工作流程是 **釐清需求** > **產生計畫**，而 Agent 問幾個問題就急著結束，然後直接完成最終目標。

    而 Matt 改良後的工作流程為：
    1. Skill A：Grill with Docs<br>
        專注釐清需求、詢問問題、整理相關文件，不負責產出 PRD。
    2. Skill B：To PRD<br>
        根據前一階段成功產生 PRD。

    關鍵是<span class="text-red">**讓 Agent 在第一階段看不到後續要完成的目標**</span>，使它把注意力集中於目前工作，這個技巧很適合需要深入分析的任務。

    不過 Matt 也強調，不需要將每一個步驟都拆成不同的 Skill，只在 Agent 經常草率完成重要中間工作時才值得拆分。

## Pruning

當 Skill 已經能正確執行後，下一步不是繼續增加指令，而是盡可能精簡，Matt 提出 3 種特別需要移除的內容：

### 1. Duplication 重複內容

同一個規則出現在多個地方，例如程式碼審查規則可能同時存在於：
- `SKILL.md`
- `references/code-review.md`
- `references/backend-rules.md`

若三個地方有不一致的內容，就可能讓 Agent 不知道該遵循哪一份，應將同一項規則維持在單一來源（Single Source of Truth）。

### 2. Sediment 沈積

隨著 Skill 不斷修改，每個人都往裡面加入新的例外條件、修補指令，卻沒有人敢刪掉舊內容，最後 SKILL.md 越來越長，也越來越難維護，這種問題與軟體工程中的技術債非常相似，**已經過時或沒有相關的內容應該直接刪除**。


### 3. No-ops 沒有實際效果的指令

例如 Skill 寫著：

```
Write a detailed commit message.
```

但 Agent 原本就會產生完整的 Commit Message，這條規則可能沒有任何實質作用。

Matt 建議使用 **Deletion Test**：
1. 暫時移除某段指令
2. 使用相同類型的任務測試 Agent
3. 觀察輸出結果是否明顯變化
4. 如果沒有差異，考慮永久刪除

## 結論

Skill 的價值不在於寫了多少規則，而在於這些規則是否真正改變 Agent 的行為，好的 Agent Skill 不是靠大量指令約束 AI，而是透過精準的觸發、合理的上下文組織、有效的行為引導與持續精簡，讓 Agent 更穩定地完成目標。

最後可以使用 [writing-for-agents skill](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL.md) 來撰寫自己的 skill，原本的 `writing-great-skills` 現在改成 `writing-for-agents` 了，除了 skill 也能用來寫 `AGENTS.md` 或 `CLAUDE.md`


## References
[Building Greate Agent Skills: The Missing Manual](https://www.youtube.com/watch?v=UNzCG3lw6O0)