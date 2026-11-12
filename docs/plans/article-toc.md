# 文章本頁目錄：可行性評估

日期：2026-11-07

狀態：需求已確認；尚未實作。

## 目標與已確認行為

- 僅文章頁提供本頁目錄，首頁與文章列表維持原樣。
- 目錄包含 H2 與 H3，以縮排表達層級，不重複列出文章標題。
- 寬螢幕使用右側獨立欄位，目錄以 sticky 停在頂部導覽列下方；長目錄可獨立捲動。
- 窄螢幕改為文章頂部的可收合目錄。
- 文章頁不顯示左側章節側欄，頂部導覽維持原樣。
- 沒有 H2／H3 時隱藏目錄並收回右欄空間；只有一個章節仍顯示。
- 捲動時高亮目前章節，但不改變網址。
- 點擊目錄時跳至對應章節並更新網址 hash，支援複製章節連結。

用語見 [GLOSSARY.md](../../GLOSSARY.md)。

## 現況與可行性

網站使用 VuePress 2.0.0-rc.30 與 default theme 2.0.0-rc.130，而非 VitePress。
`.vuepress/client.js` 已註冊 `.vuepress/layouts/Layout.vue`，後者包裝預設 Layout，目前透過 `page-content-top` 插槽顯示文章標題與日期。
可延伸現有 Layout，無須更換網站框架。

安裝版本提供 `page-top`、`page-bottom`、`page` 等插槽。`page-content-top` 位於主文內容容器內，直接加入右欄會受主文寬度限制；需要一個能容納主文與右欄的版面容器。
主題預設主文最大寬度為 740px、導覽列高度為 3.6rem。斷點應依主文、目錄與邊距總寬度決定，不能只沿用手機斷點。

`.vuepress/config.js` 的 `sidebar: 'auto'` 是舊設定值。安裝版本使用 `'heading'` 表示自動章節目錄，不能假設現有左側目錄正常運作，也不能只用 CSS 把它移到右邊。

主題內部的 `useHeaders()` 沒有透過公開 client 入口匯出。內建 active-header-links 預設只追蹤 `a.vp-sidebar-item`，且會隨捲動更新 hash，與本次確認行為不符。

## 方案比較

| 方案 | 成本與限制 | 評估 |
| --- | --- | --- |
| 保留主題，透過自訂 Layout 與 TOC 元件擴充 | 需實作雙欄、RWD 與高亮；影響範圍可集中在閱讀介面 | 推薦 |
| 直接把原生 sidebar 搬到右邊 | 與手機選單、主題 sidebar 留白及 hash 更新耦合 | 不採用 |
| 更換 VitePress 或其他主題 | 需重新驗證既有文章、首頁、RSS、搜尋及版型 | 為此功能遷移的成本過高 |

## 推薦實作方向

1. 保留預設主題與既有標題／日期呈現，新增文章 TOC 元件與包裝版面；優先利用插槽，只有插槽不足時才覆寫 page 區塊，避免複製整套 Layout。
2. 文章頁判斷沿用既有文章路徑規則，檢查實際路由格式，不以「不是首頁」代替文章頁判斷。
3. 優先評估官方 `@vuepress/plugin-toc` 的公開元件與標題選項。實作前確認其版本與目前 VuePress RC 組合相容；本次評估未安裝外掛或驗證該組合。若不適配，再採用自訂薄元件，不依賴主題私有 `@theme/useHeaders`。
4. 標題連結必須沿用實際渲染出的 heading id，不自行從文字另造 slug，以涵蓋中文、重複標題與行內程式碼。
5. 桌機版預留右欄並使用 sticky，設定導覽列偏移與最大高度；窄版呈現同一份資料的可收合目錄。隱藏的版型不應繼續提供鍵盤焦點。
6. 自行管理 TOC 的捲動高亮，例如以 IntersectionObserver 配合捲動位置判斷；與主題原本的 hash 更新追蹤分離。路由切換時清理舊觀察器與重新取得標題。
7. 保留可直接使用的錨點連結，處理固定導覽列的跳轉偏移，並支援鍵盤操作、目前位置的無障礙標示與減少動態效果偏好。

## 驗收條件

- `pnpm build` 通過，靜態預渲染與客戶端載入無 hydration 錯誤。
- 長文章的 H2／H3 順序與縮排正確，文章 H1 不列入。
- 中文、重複文字及含行內程式碼的標題均能跳到正確位置，標題不被導覽列遮住。
- 點擊後 hash 正確；直接開啟含 hash 的文章、重新整理與瀏覽器上一頁／下一頁可用。
- 手動捲動只更新高亮，不改變網址；文章尾端與最後章節仍能正確標示。
- 桌機欄位不重疊、不擠壓既有程式碼區塊；長目錄可捲動到最後一項。
- 窄螢幕可收合、可點擊，選擇章節後閱讀位置正確，鍵盤可操作。
- 沒有章節時目錄與右欄留白皆消失；單一章節仍顯示。
- 文章之間切換、由文章切回首頁／列表時，沒有殘留標題或重複觀察器。
- 明暗模式與現有文章標題、日期、底部導覽顯示正常。

## 參考資料

- [VuePress 預設主題 Layout 擴充](https://ecosystem.vuejs.press/themes/default/extending.html)
- [VuePress 官方 TOC 外掛](https://ecosystem.vuejs.press/plugins/development/toc.html)
- [VuePress 預設主題設定](https://ecosystem.vuejs.press/themes/default/config.html)
- [VitePress aside 與 outline 設定](https://vitepress.dev/reference/default-theme-config)

本功能屬可逆的介面擴充，目前不需要 ADR；本文件保留評估與已確認需求供實作使用。
