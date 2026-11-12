---
date: 2026-10-28

tags:
 - AI
 - ChatGPT
 - Codex
categories: 
 - AI
---

# 使用 GPT-6 核心技巧筆記

這篇整理自 [Jason 的 GPT-6 與 Codex 核心技巧](https://jasonai.me/blog/codex-core-tips/)，加上自己的閱讀筆記，主要記錄在 Codex 裡使用 Agent 時，怎麼管理上下文、選擇模型，以及調整提示詞與工作方式。

我自己覺得最重要的一個重點，Prompt 的寫法調整：

[Best Practices - ChatGPT Learn](https://learn.chatgpt.com/guides/best-practices)
If you work in a large or complex repository, the biggest unlock is giving Codex the right context for the task and a clear structure for what you want done.
A good default is to include four things in your prompt:

```
Goal: What are you trying to change or build?
Context: Which files, folders, docs, examples, or errors matter for this task? You can @ mention certain files as context.
Constraints: What standards, architecture, safety requirements, or conventions should Codex follow?
Done when: What should be true before the task is complete, such as tests passing, behavior changing, or a bug no longer reproducing?
```

- Goal
    - 寫結果，不要羅列一長串步驟（指引），只有過程本身重要時才描述
    - 留給 codex 自己搜尋、比較和調整的空間
- Context
    - 只給會改變結果的資訊，只加真正有關的來源
- Constraints
    - 只關注最重要的一兩條規則，不需要控制 AI 的每一步
- Done when
    - 讓 AI 能自己驗證，有對應的測試條件 AI 才知道什麼時候要停，什麼時候要檢查什麼

模型能力提升後，可以把更多執行細節交給 Agent 判斷，自己則要把目標、邊界與驗收條件說清楚。

## 上下文管理

### 容量上限與工作舒適區

GPT-6 Astra 的上下文視窗已經超過 100 萬 token，不過能容納大量資訊，和持續處理長任務時的判斷品質，是兩個不同的問題。[官方模型規格](https://developers.openai.com/api/docs/models/gpt-6-astra)

例如：從長文件找回指定資訊，主要考驗資訊檢索，程式開發還需要一路記住需求、排除失敗方案、理解修改後的狀態，並持續做出工程判斷。

自己的使用原則：

- 一開始只提供目前任務需要的資料
- 文件先給位置，需要時再讀
- 過期方案、重複日誌、無關的旁支討論，盡量不要一直累積
- 階段切換時，重新整理目前狀態

[grill me](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md) 作者 Matt Pocock 的觀點：
> 1. 模型能力越強，**一個錯誤的決策造成的破壞速度也越快**，GPT-6 既能把正確決策放大，也能把錯誤決策放大（水能載舟亦能覆舟）
> 2. 給 Agent 的 context 越多，Agent 的表現通常會越差
> 3. 估計「1 Million token window 前 150K token 是 smart zone」

### 什麼時候繼續、壓縮或開新對話？

先確認目前的目標是否相同，再決定對話要怎麼處理：

還是同一個核心目標？
- 是
    - 上下文仍清楚 → 繼續目前對話
    - 但歷史已經很長 → `/compact` 壓縮上下文
- 只是臨時的旁支問題 → `/side` 用側邊聊天開啟對話，可以調整合適的模型，降低 token 消耗
    - 前陣子的 side chat 發生一些 [bug](https://github.com/openai/codex/issues/57668) 無法正常調用
- 想從目前進度探索另一條路線 → `/fork`
- 已經進入獨立的新工作 → `/new` 開啟新 chat，同時考慮做 Handoff
    - 推薦使用 Matt Pocock 的 `/handoff` [skill](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)


這也對應 OpenAI 建議的順序：先查看狀態，目標相同就考慮 compact，目標分岔就 fork。

| 方式 | 帶入哪些舊資訊 | 適合情境 |
| --- | --- | --- |
| Resume / Continue | 原本的對話狀態 | 暫時離開後繼續工作 |
| Compact | 壓縮後的工作狀態 | 同一任務還要繼續，但歷史太長 |
| Fork | 從原對話繼承的歷史 | 保留背景，探索另一條主要路線 |
| Handoff → 新對話 | 自己挑選的交接資訊 | 階段切換，或需要重新整理上下文 |

**Fork 仍會繼承歷史，要讓新 Agent 從精簡的狀態開始，可以使用 Handoff。**

### Handoff

可以把交接內容放在 `HANDOFF.md`，讓新對話先讀，再開始後續的工作。

推薦使用 Matt Pocock 的 `/handoff` [skill](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)，這個 skill 主要做：
1. 把交接文件存到作業系統的暫存目錄（例如 macOS 的 $TMPDIR），而不是專案目錄
2. 文件需要包含「建議使用的 Skills」，方便下一個 Agent 知道該載入哪些流程
3. 不要重複貼上已存在於規格、計畫、ADR、Issue、commit 或 diff 的內容，改為引用它們的位置
4. 要遮蔽 API key、密碼等敏感資訊
5. 如果執行 /handoff 時有附上用途說明，交接內容就會依照那個方向整理

這個 skill 是 `disable-model-invocation: true`，所以需要自己手動呼叫。

## 模型、思考強度與快取

### 按任務分配模型

原文的分工方式，可以先當成選擇起點：

| 模型 | 優先嘗試的工作 | 標準輸入 / 輸出價格 |
| --- | --- | --- |
| GPT-6 Luna | 明確、重複、高頻的整理工作 | $0.10 / $0.50 |
| GPT-6.1 Sol | 日常開發、研究與需要判斷的任務 | $2 / $10 |
| GPT-6 Astra | 複雜推理、多步驟或高歧義的工作 | $10 / $50 |

真正要比較的還有：完成時間、返工次數，以及最後需要自己補多少工作，**單次呼叫便宜，但反覆修正很多次，整體未必划算**。

### 思考強度不用一開始就開到最大

起點可以是：

- 明確的整理或小幅修改：先用較低強度
- 日常開發：從中等強度觀察結果
- 跨模組設計、難重現的錯誤：再提高強度

如果結果不好，先檢查需求、資料與完成條件是否清楚，再判斷需不需要換模型或提高思考強度。

### 調整思考強度與切換模型要分開看

原文特別提醒：調整 reasoning effort 與切換模型，對快取的影響不同：
- GPT-5.6 sol，中途修改思考強度，會導致快取未命中。[Codex Issue #35416](https://github.com/openai/codex/issues/35416)
- GPT-6.1 sol，中途修改思考強度，**則會保留快取**。[Change reasoning mid-conversation while preserving cache](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra#gpt-6-astra-whats-new)
- <span class="text-red">中途切換模型必定導致效能下降和快取丟失</span>
    - [Unrolling the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/)
    - [Prompt cache diagnostics](https://developers.openai.com/api/docs/guides/prompt-caching/diagnostics)

所以並不是在同一個對話裡：
```
Astra → 寫架構
↓
切 Luna → 寫文件
↓
切 Astra → Debug
↓
切 Luna → 改 README
```

避免為每個小工作，反覆切換主對話的模型，任務夠大、可以清楚拆分時，再考慮讓不同模型的 Subagent 分工：
```text
主 Agent：維持主要目標、整合結果
│
├─ 較強模型的 Subagent：分析複雜問題
└─ 較輕量模型的 Subagent：掃描、整理、處理明確子任務
```

這種安排仍有啟動、交接與整合成本，簡單任務直接完成就好，不需要為了分工而分工。

## 提示詞：把任務契約寫清楚

### Goal → Context → Constraints → Done when

避免再像過去那樣給模型安排每一步怎麼思考、怎麼做。

|     | 要回答的問題 |
| --- | --- |
| Goal | 想得到什麼結果？ |
| Context | 相關檔案、背景、已知現象在哪裡？ |
| Constraints | 哪些行為、介面或資料不能改？ |
| Done when | 用什麼證據判定完成？ |

例如：

```text
目標：
修復 Safari 下結帳頁面重複送出訂單的問題。

上下文：
相關程式在 checkout/。
重現步驟與錯誤日誌在 docs/bugs/safari-submit.md。

限制：
維持既有支付 API 契約與其他瀏覽器的結帳行為。

完成條件：
原本的 Safari 重現步驟不再產生重複訂單。
相關測試通過，並說明如何確認沒有重複請求。
```

這樣能讓 Agent 根據實際情況決定讀哪些檔案、怎麼修正，也讓自己有具體的驗收依據。

如果流程本身有必要的順序，例如資料遷移必須先備份，那仍然要寫清楚，可以省下的是沒有特殊理由、每個任務都套用的微操作指令。

## AGENTS.md 與 Skills

這部分也延續之前的 [CLAUDE.md 與 AGENTS.md 設定筆記](../how_to_write_claude_md/how_to_write_claude_md.md)：保留重要規則，其他知識按情境讀取。

### AGENTS.md 留下路由與邊界

可以記錄：

- 哪種工作需要讀哪份文件
- 哪些限制不能違反
- 哪些可逆操作已經授權
- 哪些決策需要使用者確認

例如：把每次修改都要讀完整套架構文件，改成按 task 需要查閱：

```text
- 調整服務邊界時，讀取 docs/architecture.md
- 修改資料表或 migration 時，讀取 docs/database.md
- 準備部署時，讀取 docs/deployment.md
```

OpenAI 也建議重新檢視舊有規則，減少無關文件的預載與不必要的流程限制。[官方 AGENTS.md 與 Skills 建議](https://learn.chatgpt.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)

**AGENTS.md 無法自行把使用者指令提升到系統或平台安全規則之上**，它適合定義專案規範，不能用來繞過實際權限與安全限制。

### Skill 的觸發範圍要明確

Skill 的名稱與 description 會幫助模型判斷是否需要載入，描述過長或範圍重疊，可能讓模型選錯工作流程。

以資料庫 migration 為例：

```text
太廣：
處理任何與資料庫、查詢、資料模型有關的工作時使用。

更明確：
新增、修改或審查 Postgres migration 時使用。
```

大型 Skill 可以採用 Progressive Disclosure：入口先說明適用情境，再指向各流程需要的文件與腳本，等需要時才載入細節。[官方 Skills 建議](https://learn.chatgpt.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)

## Agent 的自主權與澄清問題

### 把可以直接做的事情說清楚

OpenAI 明確表示 Astra 更可能再「用戶答案會實質改變結果」的時候提出釐清問題，而以前的模型可能直接猜。<br>
[GPT-6 Astra is generally better than GPT-5.6 Sol and earlier models at staying coherent during long tasks. It is also more likely to ask for clarification where earlier models would make assumptions.](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra#gpt-6-astra-initiative-and-follow-through)

- 在 GPT-5.6 Sol：我大概知道你的意思，直接做
- Astra：這裡有 2 個合理的選擇，你希望哪一個？

如果 Agent 經常停下來問，可以先檢查舊指令裡是否寫了太多「每一步都要確認」，或者可以在 Prompt 裡寫類似的做法：
```text
在本次任務範圍內，讀取本地檔案、可逆的程式修改，以及使用隔離測試資料的定向測試，可以直接進行。

一般實作選擇請做合理假設並繼續，完成後說明。若缺少會實質影響正確性的重要資訊，請提出問題。

大量刪除、正式環境變更、付款、對外傳送訊息，以及權限與密鑰操作，需要另外確認授權。
```

授權實際上仍然要配合專案與工具的實際限制，也無法保證加上一段話就完全不再提問。

### Codex Async Clarification & Execution

在 Codex 中，當任務存在非關鍵歧異時，GPT-6 Astra 不會直接阻塞暫停，而是會自動將任務拆分：**一邊在後台向用戶提出澄清問題，同時繼續完成那些不依賴用戶答案的工作**。

這是自帶的功能，不需要設定任何參數，僅需要注意發送指令後，不要徹底放手不管，Codex 途中可能會異步向你問問題。

### Subagent 要有清楚的交付內容

GPT-6 Astra 有能力拆分 subagent，但可能沒有預期得這麼積極。

OpenAI [文件](https://developers.openai.com/api/docs/guides/latest-model#gpt-6-astra-behavior)明確說：
Subagent delegation: The model may delegate less often than desired for your workflow. Specify when and how much it should use subagents for parallel work.

如果今天適合平行處理的工作，可以明確在 Prompt 指定範圍，例如：

```text
可以使用 Subagent，分別檢查 API 相容性與測試涵蓋範圍。
各自回報問題、檔案位置與依據，由主 Agent 整合。
```

分工前先確認三件事：

- 子任務能不能獨立處理？
- 各自要回報什麼？
- 誰負責整合與最後驗證？

若多個 Agent 需要同時修改同一批檔案，通常要先劃清責任，否則整合成本可能比省下的時間更多。

## 測試與驗證

原文提到 OpenAI 明確指出 Astra 已經非常傾向測試和檢查，因此過去「Always run the full test suite after every change」可能導致簡單修改也運行大量無關測試。

Previous models needed encouragement to run tests and check their work. GPT-6 Astra does that on its own, so the same instructions can lead to unnecessary testing.
[Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)

如果賦予過度的測試指令，它會為了極小的改動陷入無休止的測試重寫循環。

正確做法：限定**測試範圍與風險相匹配**（例如：針對 UI 樣式修改僅運行局部視覺檢查，針對核心邏輯才執行深度自檢）

## 自己的調整清單

- 提示詞先寫清楚目標、上下文、限制、完成條件
- 檢查舊指令，移除已經不需要的微操作
- AGENTS.md 改用情境路由，避免每次預載全部文件
- Skills 縮小觸發範圍，大型流程按需載入
- 明確授權任務範圍內的低風險操作
- 測試依影響範圍與風險做對應選擇
- 長對話定期整理，階段切換時準備 Handoff

## References

- [Jason：4 個必須學習的 GPT-6 核心技巧](https://jasonai.me/blog/codex-core-tips/)
- [OpenAI：Using GPT-6](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI：Rethinking skills and prompts for GPT-6 Astra](https://learn.chatgpt.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
- [OpenAI：Mastering remote engineering work from your phone](https://developers.openai.com/blog/mastering-codex-remote-for-engineering)
