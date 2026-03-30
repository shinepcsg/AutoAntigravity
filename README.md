[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-br.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

# AutoAntigravity

An Antigravity extension that integrates **Auto Accept** and **Ralph Loop** functions into one unified plugin.

---

## ✨ Key Features

### ⚡ Auto Accept
Automatically accepts **file edits, terminal commands, and permission requests** suggested by the Antigravity agent.

- **CDP (Chrome DevTools Protocol) + MutationObserver**: Detects DOM changes immediately → Clicks buttons automatically
- **VS Code Commands API Polling**: Automatically executes `acceptAgentStep`, `terminalCommand.run`, etc.
- **Detected Buttons**: `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **Custom Button Texts Supported** (Multi-language support)

### 🔄 Ralph Loop
An **iterative autonomous agent execution** system based on `PRD.md`.

- **Task File Based**: Manages tasks in a checkbox format (`- [ ]`) in `PRD.md`
- **Parallel Task Support**: Executes tasks independently in parallel using git worktrees via the `#parallel` tag and merges them automatically
- **Progress Tracking**: Records the result of each iteration using an append-only method in `progress.txt`
- **Auto Commit**: Automatically commits to Git after each iteration
- **Context Refresh**: Overcomes context window limits by starting a new session for each iteration
- **Safety Guards**: Limits the maximum number of iterations

### 📱 Telegram Bot Integration
Monitor and manage workflows through a Telegram bot.

- **Easy UI Setup**: Register Bot Token and Chat ID directly from the AutoAntigravity sidebar settings panel
- **Secure Storage**: Maintains and manages bot settings securely using the `.env` file
- **Notifications & More**: Lays the foundation for key extensions like monitoring agent tasks

---

## 🛠 Installation

### 1. Enable Debug Mode (Required)
Add the following flag when launching Antigravity:

```
--remote-debugging-port=9559
```

**Windows**: Add to Target in Shortcut → Properties  
**Mac**: `open -a "Antigravity" --args --remote-debugging-port=9559`  
**Linux**: Add to the Exec line in your `.desktop` file

> 💡 After installation, if the port is closed on the first run, an auto-patch prompt will be displayed.

### 2. Install Extension
Search for `AutoAntigravity` in the **Extensions Panel** of Antigravity to install it directly.
- [Open VSX Registry: AutoAntigravity Page](https://open-vsx.org/extension/shinepcsg/AutoAntigravity)

---

## 📖 Usage

### Auto Accept
- **Toggle**: Click `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF` on the status bar
- **Command**: `Ctrl+Shift+P` → `AutoAntigravity: Toggle Auto Accept`

### 📱 Telegram Bot Setup
You can link a Telegram bot to monitor tasks and receive notifications.

1. **Create Bot**: Create a bot via `@BotFather` on Telegram and obtain a **Bot Token**.
2. **Get Chat ID**: Send a message to the bot or use tools like `@msid_bot` to get your **Chat ID**.
3. **Register Settings**: Open the sidebar panel by clicking the **AutoAntigravity icon** on the left activity bar.
4. Enter your token and Chat ID in the **Telegram Integration Management** menu of the panel and save.
   > 💡 *The configured information is securely saved in the `.env` file at the workspace root.*

### 🔄 Ralph Loop
1. **Prepare Task File**: Create `PRD.md` in your workspace (using checkbox format)
   ```markdown
   - [ ] Implement API endpoint
   - [ ] Design database schema
   - [ ] Write unit tests
   ```
2. **Start**: `Ctrl+Shift+P` → `AutoAntigravity: Start Ralph Loop`
3. **Stop**: `Ctrl+Shift+P` → `AutoAntigravity: Stop Ralph Loop`

### `/write-prd` Workflow Registration

Using the `/write-prd` slash command, the AI agent automatically writes a PRD and applies it to the Ralph Loop immediately.  
To use this workflow, you need to register it as a **Global Workflow** or a **Project Workflow**.

#### Method 1: Project Workflow (Use only in the current project)

Place the `.agent/workflows/write-prd.md` file in your project root.  
Since it is already included in the AutoAntigravity repository, simply copy the file to use it in other projects.

```
your-project/
├── .agent/
│   └── workflows/
│       └── write-prd.md    ← Place it here
├── PRD.md
└── ...
```

> 💡 The paths `.agents/workflows/`, `_agent/workflows/`, and `_agents/workflows/` are also supported.

#### Method 2: Global Workflow (Use in all projects)

By placing the file in the `.agent/workflows/` folder of your home directory, you can use the `/write-prd` command in all projects.

**Windows** (Run in project root):
```powershell
# Create global workflow directory
New-Item -ItemType Directory -Path "$env:USERPROFILE\.agent\workflows" -Force

# Copy write-prd.md
Copy-Item ".\.agent\workflows\write-prd.md" "$env:USERPROFILE\.agent\workflows\write-prd.md"
```

**Mac / Linux** (Run in project root):
```bash
# Create global workflow directory
mkdir -p ~/.agent/workflows

# Copy write-prd.md
cp ./.agent/workflows/write-prd.md ~/.agent/workflows/write-prd.md
```

After registration, typing `/write-prd` in the Antigravity chat will execute the workflow.

---

### 🔀 Parallel Task Configuration

Ralph Loop can execute tasks tagged with `#parallel` simultaneously in **independent git worktrees**.

#### Activation

Parallel execution is enabled by default. It can be controlled in the settings:

| Setting | Default | Description |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | Enable/disable parallel execution |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | Maximum number of concurrent tasks (2~8) |

#### Specifying Parallel Tasks in PRD

Add the `#parallel` tag to task items to execute them in parallel:

```markdown
### Step 2: Implement independent modules
- [ ] #parallel Task 2-1: Implement user module (src/user.js)
- [ ] #parallel Task 2-2: Implement product module (src/product.js)
- [ ] #parallel Task 2-3: Implement order module (src/order.js)
- [ ] Validation 2: Ensure unit tests pass for all modules
```

#### Parallel Task Rules

- **Consecutive `#parallel` items** form a single parallel group.
- If a regular task is placed in between, they are separated into **distinct parallel groups**.
- Use only for tasks that **modify different files** — modifying the same file will result in merge conflicts.
- **Do not use** for tasks that depend on the output of previous tasks in the same group.

#### How It Works

1. When Ralph Loop detects a parallel group, it creates an **independent git worktree** for each task.
2. A separate Antigravity agent executes the task in parallel within each worktree.
3. Once all parallel tasks are complete, the results are **automatically merged into the main branch**.
4. If a merge conflict occurs, the AI will try to resolve it automatically.

---

## ⚙ Settings

| Setting | Default | Description |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | Polling interval (ms) |
| `autoAntigravity.autoAccept.cdpPort` | `9559` | CDP debug port |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | Additional button texts |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | Maximum iterations |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | Task file name |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | Progress file name |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | Auto branch & git commit per task |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | Auto delete task branch after merge |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `1500` | Delay between iterations (ms) |
| `autoAntigravity.ralphLoop.allowPrdModification` | `false` | Allow agent to modify PRD |
| `autoAntigravity.ralphLoop.autoStart` | `true` | Auto start Ralph Loop when PRD changes |
| `autoAntigravity.ralphLoop.enableParallel` | `true` | Enable parallel execution for `#parallel` tasks |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | Maximum concurrent parallel tasks (2~8) |

---

## 🔒 Safety

- Auto Accept operates **only inside the Antigravity agent panel** (Webview Guard)
- It does not click on external web pages
- CDP is **localhost only** — no external network access
- Ralph Loop prevents infinite loops by limiting the maximum number of iterations

---

## 📝 License

MIT License — [LICENSE](LICENSE)

## 🙏 Credits
Chansun Park (shinepcs@gmail.com)