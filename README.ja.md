[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-br.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

# AutoAntigravity

**Auto Accept** と **Ralph Loop** の機能を一つに統合した Antigravity 拡張プラグインです。

---

## ✨ 主な機能

### ⚡ Auto Accept
Antigravity エージェントが提案する **ファイルの編集、ターミナルコマンド、権限リクエスト** を自動で受け入れます。

- **CDP (Chrome DevTools Protocol) + MutationObserver**: DOM の変更を即座に検知し、ボタンを自動クリック
- **VS Code Commands API ポーリング**: `acceptAgentStep`, `terminalCommand.run` などを自動実行
- **検知ボタン**: `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **カスタムボタンテキストの追加可能** (多言語対応)

### 📱 Telegram ボット連携
Telegram ボットを通じて作業フローを監視・管理できます。

- **簡単な UI 設定**: AutoAntigravity サイドバーの拡張設定パネルからボットトークンと Chat ID を登録
- **安全な保管**: `.env` ファイルを利用してボット設定を安全に維持・管理
- **通知送信など**: エージェント作業の監視など、主要な拡張機能の基盤を提供

### 🔄 Ralph Loop
`PRD.md` に基づいた **AI エージェントの反復的な自律実行** システムです。

- **タスクファイルベース**: `PRD.md` にてチェックボックス形式 (`- [ ]`) で作業を管理
- **並列処理対応**: `#parallel` タグにより、独立した git worktree で並列実行および自動マージ
- **進捗の記録**: 各反復の結果を `progress.txt` に追記（append-only）
- **自動コミット**: 各反復ごとに Git の自動コミット
- **コンテキストの更新**: 反復ごとに新しいセッションを使用することで、コンテキストウィンドウの制限を克服
- **安全装置**: 最大反復回数の制限

---

## 🛠 インストール方法

### 1. デバッグモードの有効化 (必須)
Antigravity 起動時に以下のフラグを追加してください：

```
--remote-debugging-port=9559
```

**Windows**: ショートカット → プロパティ → リンク先（対象）に追加  
**Mac**: `open -a "Antigravity" --args --remote-debugging-port=9559`  
**Linux**: `.desktop` ファイルの Exec 行に追加

> 💡 インストール後の初回起動時にポートが閉じている場合、自動パッチの案内が表示されます。

### 2. 拡張のインストール
Antigravity の **拡張機能 (Extensions) パネル** で `AutoAntigravity` を検索し、直接インストールできます。
- [Open VSX Registry: AutoAntigravity ページ](https://open-vsx.org/extension/shinepcsg/AutoAntigravity)

---

## 📖 使い方

### Auto Accept
- **切り替え**: ステータスバーの `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF` をクリック
- **コマンド**: `Ctrl+Shift+P` → `AutoAntigravity: Toggle Auto Accept`

### 📱 Telegram ボット設定
作業の監視や通知を受け取るために、Telegram ボットを連携させることができます。

1. **ボットの作成**: Telegram で `@BotFather` を通じてボットを作成し、**Bot Token** を発行します。
2. **Chat ID の確認**: ボットにメッセージを送るか、`@msid_bot` などを使用して自身の **Chat ID** を確認します。
3. **設定の登録**: Antigravity 左側のアクティビティバーにある **AutoAntigravity アイコン** をクリックしてサイドバーパネルを開きます。
4. パネルの **Telegram 連携管理** メニューにトークンと Chat ID を入力して保存します。
   > 💡 *設定された情報はワークスペースルートの `.env` ファイルに安全に保存されます。*

### 🔄 Ralph Loop
1. **タスクファイルの準備**: ワークスペースに `PRD.md` を作成 (チェックボックス形式)
   ```markdown
   - [ ] API エンドポイントの実装
   - [ ] データベーススキーマの設計
   - [ ] 単体テストの作成
   ```
2. **開始**: `Ctrl+Shift+P` → `AutoAntigravity: Start Ralph Loop`
3. **停止**: `Ctrl+Shift+P` → `AutoAntigravity: Stop Ralph Loop`

### `/write-prd` ワークフローの登録

`/write-prd` スラッシュコマンドを使用すると、AI エージェントが自動的に PRD を作成し、Ralph Loop に即座に適用します。  
このワークフローを使用するには、**グローバルワークフロー** または **プロジェクトワークフロー** として登録する必要があります。

#### 方法 1: プロジェクトワークフロー (現在のプロジェクトでのみ使用)

プロジェクトルートに `.agent/workflows/write-prd.md` ファイルを配置します。  
AutoAntigravity リポジトリにすでに含まれているため、他のプロジェクトで使用する場合はファイルをコピーしてください。

```
your-project/
├── .agent/
│   └── workflows/
│       └── write-prd.md    ← ここに配置
├── PRD.md
└── ...
```

> 💡 `.agents/workflows/`, `_agent/workflows/`, `_agents/workflows/` のパスもサポートされています。

#### 方法 2: グローバルワークフロー (すべてのプロジェクトで使用)

ホームディレクトリの `.agent/workflows/` フォルダにファイルを配置すると、すべてのプロジェクトで `/write-prd` コマンドが使用できるようになります。

**Windows** (プロジェクトルートで実行):
```powershell
# グローバルワークフローディレクトリの作成
New-Item -ItemType Directory -Path "$env:USERPROFILE\.agent\workflows" -Force

# write-prd.md のコピー
Copy-Item ".\.agent\workflows\write-prd.md" "$env:USERPROFILE\.agent\workflows\write-prd.md"
```

**Mac / Linux** (プロジェクトルートで実行):
```bash
# グローバルワークフローディレクトリの作成
mkdir -p ~/.agent/workflows

# write-prd.md のコピー
cp ./.agent/workflows/write-prd.md ~/.agent/workflows/write-prd.md
```

登録後、Antigravity のチャットで `/write-prd` と入力するとワークフローが実行されます。

---

### 🔀 並列タスク設定

Ralph Loop は `#parallel` タグが付いたタスクを **独立した git worktree** で同時に実行できます。

#### 有効化

並列実行はデフォルトで有効になっています。設定で制御できます：

| 設定 | デフォルト値 | 説明 |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | 並列実行の有効化 / 無効化 |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | 同時実行可能な最大タスク数 (2~8) |

#### PRDでの並列タスクの指定

タスク項目に `#parallel` タグを追加すると、そのタスクは並列で実行されます：

```markdown
### Step 2: 独立したモジュールの実装
- [ ] #parallel タスク 2-1: ユーザーモジュールの実装 (src/user.js)
- [ ] #parallel タスク 2-2: 製品モジュールの実装 (src/product.js)
- [ ] #parallel タスク 2-3: 注文モジュールの実装 (src/order.js)
- [ ] 検証 2: すべてのモジュールの単体テストの合格を確認
```

#### 並列タスクのルール

- **連続した `#parallel` 項目**が 1 つの並列グループを形成します。
- 間に通常のタスクが挟まった場合、**別々の並列グループ**に分割されます。
- **異なるファイルを修正するタスク**にのみ使用してください — 同じファイルを修正するとマージの競合が発生します。
- 同じグループの以前のタスクの結果に依存するタスクには**使用しないでください**。

#### 動作の仕組み

1. Ralph Loop が並列グループを検知すると、各タスクごとに **独立した git worktree** を作成します。
2. 各 worktree において、別々の Antigravity エージェントがタスクを並列で実行します。
3. すべての並列タスクが完了すると、結果が **メインブランチに自動マージ** されます。
4. マージの競合が発生した場合、AI が自動で解決を試みます。

---

## ⚙ 設定

| 設定 | デフォルト値 | 説明 |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | ポーリング間隔 (ms) |
| `autoAntigravity.autoAccept.cdpPort` | `9559` | CDP デバッグポート |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | 追加のボタンテキスト |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | 最大反復回数 |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | タスクファイル名 |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | 進捗記録ファイル名 |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | タスクごとの分岐および自動コミット |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | マージ後にタスクのブランチを自動削除 |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `1500` | 反復間の待機時間 (ms) |
| `autoAntigravity.ralphLoop.allowPrdModification` | `false` | エージェントによる PRD の修正を許可 |
| `autoAntigravity.ralphLoop.autoStart` | `true` | PRD ファイルの変更時に Ralph Loop を自動開始 |
| `autoAntigravity.ralphLoop.enableParallel` | `true` | `#parallel` タスクの並列実行の有効化 |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | 最大同時並列タスク数 (2~8) |

---

## 🔒 安全性

- Auto Accept は **Antigravity エージェントパネル内** でのみ動作します (Webview Guard)
- 外部のウェブページではクリックされません
- CDP は **localhost 専用** であり、外部ネットワークへのアクセスはありません
- Ralph Loop は最大反復回数を制限することで無限ループを防ぎます

---

## 📝 ライセンス

MIT License — [LICENSE](LICENSE)

## 🙏 クレジット
パク・チャンソン (shinepcs@gmail.com)
