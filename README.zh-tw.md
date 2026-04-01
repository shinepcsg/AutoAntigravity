[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-br.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

# AutoAntigravity

這是一個將 **Auto Accept**, **Telegram** And **Ralph Loop** 功能整合為一體的 Antigravity 擴充套件。

---

## ✨ 主要功能

### ⚡ Auto Accept
自動接受由 Antigravity 代理建議的 **檔案編輯、終端機命令以及權限請求**。

- **CDP (Chrome DevTools Protocol) + MutationObserver**: 即時偵測 DOM 變更 → 自動點擊按鈕
- **VS Code Commands API 輪詢**: 自動執行 `acceptAgentStep`, `terminalCommand.run` 等命令
- **偵測的按鈕**: `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **支援新增自訂按鈕文字** (支援多國語言)

### 📱 Telegram 機器人整合
透過 Telegram 機器人監控和管理工作流程。

- **簡易UI設定**: 直接在 AutoAntigravity 側邊欄設定面板中註冊 Bot Token 和 Chat ID
- **安全儲存**: 使用 `.env` 檔案安全地保存和管理機器人設定
- **接收通知等**: 為諸如監控代理任務等關鍵擴充功能奠定基礎

### 🔄 Ralph Loop
基於 `PRD.md` 的 **迭代式自主代理執行** 系統。

- **基於任務檔案**: 在 `PRD.md` 中以核取方塊格式 (`- [ ]`) 管理任務
- **並行任務支援**: 透過 `#parallel` 標籤在獨立的 git worktree 中並行執行任務並自動合併
- **進度追蹤**: 在 `progress.txt` 中以僅附加（append-only）方式記錄每次迭代的結果
- **自動提交**: 每次迭代後自動提交到 Git
- **上下文刷新**: 每次迭代都開啟新會話，以克服上下文視窗的限制
- **安全保護**: 限制最大迭代次數，防止無限迴圈

---

## 🛠 安裝方法

### 1. 啟用偵錯模式 (必填)
啟動 Antigravity 時，請新增以下旗標：

```
--remote-debugging-port=9559
```

**Windows**: 捷徑 → 內容 → 新增至目標路徑末端  
**Mac**: `open -a "Antigravity" --args --remote-debugging-port=9559`  
**Linux**: 新增至您的 `.desktop` 檔案的 Exec 行中

> 💡 安裝後，如首次執行時該連接埠未開啟，系統將顯示自動修補提示。

### 2. 安裝擴充套件
在 Antigravity 的 **擴充功能 (Extensions) 面板** 中搜尋 `AutoAntigravity` 並直接安裝。
- [Open VSX Registry: AutoAntigravity 頁面](https://open-vsx.org/extension/shinepcsg/AutoAntigravity)

---

## 📖 使用方法

### Auto Accept
- **切換開關**: 在狀態列上點擊 `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF`
- **命令列**: `Ctrl+Shift+P` → `AutoAntigravity: Toggle Auto Accept`

### 📱 Telegram 機器人設定
您可以綁定一個 Telegram 機器人來監控工作任務並接收通知。

1. **建立機器人**: 在 Telegram 中透過 `@BotFather` 建立一個機器人，並獲取 **Bot Token**。
2. **獲取 Chat ID**: 向機器人發送一條訊息，或使用諸如 `@msid_bot` 等工具來獲取您的 **Chat ID**。
3. **註冊設定**: 點擊左側活動列的 **AutoAntigravity 圖示** 開啟側邊欄設定面板。
4. 在面板的 **Telegram 綁定管理** 選單中輸入 Token 和 Chat ID 後儲存。
   > 💡 *所設定的資訊將安全地保存在工作區根目錄下的 `.env` 檔案中。*

### 🔄 Ralph Loop
1. **準備任務檔案**: 在工作區建立 `PRD.md` (使用核取方塊格式)
   ```markdown
   - [ ] 實作 API 介面
   - [ ] 設計資料庫結構
   - [ ] 撰寫單元測試
   ```
2. **開始執行**: `Ctrl+Shift+P` → `AutoAntigravity: Start Ralph Loop`
3. **停止執行**: `Ctrl+Shift+P` → `AutoAntigravity: Stop Ralph Loop`

### `/write-prd` 工作流註冊

使用 `/write-prd` 斜線指令後，AI 代理會自動產生 PRD 並立即將其應用於 Ralph Loop。

點擊 Antigravity 左側活動列的 **AutoAntigravity 圖示**開啟側邊欄面板，  
然後點擊設定區域的 **📋 write-prd (工作區)** 按鈕，即可在當前專案中自動安裝該工作流。

安裝完成後，在 Antigravity 聊天視窗中輸入 `/write-prd` 即可執行該工作流。


---

### 🔀 並行任務配置

Ralph Loop 可以在 **獨立的 git worktree** 中同時執行標註有 `#parallel` 標籤的任務。

#### 開啟功能

並行執行功能預設處於開啟狀態。可以在設定中對其進行控制：

| 設定項 | 預設值 | 說明 |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | 啟用/停用並行執行 |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | 最大並發任務數量 (2~8) |

#### 在 PRD 中指定並行任務

在任務項中新增 `#parallel` 標籤，即可並行執行這些任務：

```markdown
### Step 2: 實作獨立的模組
- [ ] #parallel 任務 2-1: 實作使用者模組 (src/user.js)
- [ ] #parallel 任務 2-2: 實作商品模組 (src/product.js)
- [ ] #parallel 任務 2-3: 實作訂單模組 (src/order.js)
- [ ] 驗證 2: 確保所有模組通過單元測試
```

#### 並行任務規則

- **連續出現的 `#parallel` 任務項**將組成一個常規並行群組。
- 如果在中間插入了一個普通任務，它們將被分隔成 **不同的並行群組**。
- 請僅將此用在**修改不同檔案**的任務上 — 如果修改同一個檔案將產生合併衝突。
- **請勿將此用於**依賴同一組內前序任務輸出的任務。

#### 執行原理

1. 當 Ralph Loop 偵測到一個並行群組時，它會為每個任務建立一個 **獨立的 git worktree**。
2. 獨立的 Antigravity 代理會在各自的 worktree 中並行執行任務。
3. 一旦所有並行任務完成，便將結果 **自動合併到主分支**。
4. 如發生合併衝突，AI 將嘗試自動解決。

---

## ⚙ 設定

| 設定項 | 預設值 | 說明 |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | 輪詢間隔 (ms) |
| `autoAntigravity.autoAccept.cdpPort` | `9559` | CDP 偵錯連接埠 |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | 額外的自動點擊按鈕文字 |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | 最大迭代次數 |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | 任務檔案名稱 |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | 進度記錄檔案名稱 |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | 每次迭代後自動分支與提交 |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | 合併後自動刪除任務分支 |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `1500` | 迭代之間的延遲時間 (ms) |
| `autoAntigravity.ralphLoop.allowPrdModification` | `false` | 允許代理修改 PRD 檔案 |
| `autoAntigravity.ralphLoop.autoStart` | `true` | 當 PRD 檔案改變時自動啟動 Ralph Loop |
| `autoAntigravity.ralphLoop.enableParallel` | `true` | 允許標註 `#parallel` 標籤的任務並行執行 |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | 最大並發並行任務數 (2~8) |

---

## 🔒 安全性

- Auto Accept 僅在 **Antigravity 代理面板內** 執行 (Webview Guard 防止誤觸)
- 它不會在外部網頁上進行任何點擊操作
- CDP **僅限本機迴圈位址 (localhost)** — 無外部網路存取權限
- Ralph Loop 透過限制最大迭代次數防止出現無窮迴圈

---

## 📝 授權條款

MIT License — [LICENSE](LICENSE)

## 🙏 鳴謝
Chansun Park (shinepcs@gmail.com)
