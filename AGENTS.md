禁止批量刪除文件或目錄。
不要使用：
- `del /s`
- `rd /s`
- `rmdir /s`
- `Remove-Item -Recursive`
- `rm -rf`

需要刪除文件時，只能一次刪除一個明確的路徑的文件。
如需批量刪除文件，應停止操作，並向用戶請求，讓用戶手動刪除。

## Agent skills

### Issue tracker

工作票與規格使用 GitHub Issues；操作前讀取 `docs/agents/issue-tracker.md`。

### Triage labels

使用五個預設 triage 標籤；分流前讀取 `docs/agents/triage-labels.md`。

### Domain docs

採單一領域結構；探索程式碼前讀取 `docs/agents/domain.md`。
