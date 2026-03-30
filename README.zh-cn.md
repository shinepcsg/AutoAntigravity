[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-br.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

# AutoAntigravity

这是一个将 **Auto Accept** 和 **Ralph Loop** 功能集成为一体的 Antigravity 扩展插件。

---

## ✨ 主要功能

### ⚡ Auto Accept
自动接受由 Antigravity 代理建议的 **文件编辑、终端命令以及权限请求**。

- **CDP (Chrome DevTools Protocol) + MutationObserver**: 即时检测 DOM 更改 → 自动点击按钮
- **VS Code Commands API 轮询**: 自动执行 `acceptAgentStep`, `terminalCommand.run` 等命令
- **检测的按钮**: `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **支持添加自定义按钮文本** (支持多语言)

### 🔄 Ralph Loop
基于 `PRD.md` 的 **迭代式自主智能体执行** 系统。

- **基于任务文件**: 在 `PRD.md` 中以复选框格式 (`- [ ]`) 管理任务
- **并行任务支持**: 通过 `#parallel` 标签在独立的 git worktree 中并行执行任务并自动合并
- **进度追踪**: 在 `progress.txt` 中以仅追加（append-only）方式记录每次迭代的结果
- **自动提交**: 每次迭代后自动提交到 Git
- **上下文刷新**: 每次迭代都开启新会话，以克服上下文窗口的限制
- **安全保护**: 限制最大迭代次数，防止无限循环

### 📱 Telegram 机器人集成
通过 Telegram 机器人监控和管理工作流。

- **简易UI设置**: 直接在 AutoAntigravity 侧边栏设置面板中注册 Bot Token 和 Chat ID
- **安全存储**: 使用 `.env` 文件安全地保存和管理机器人设置
- **接收通知等**: 为诸如监控智能体任务等关键扩展功能奠定基础

---

## 🛠 安装方法

### 1. 启用调试模式 (必填)
启动 Antigravity 时，请添加以下标志：

```
--remote-debugging-port=9559
```

**Windows**: 快捷方式 → 属性 → 添加到目标路径末尾  
**Mac**: `open -a "Antigravity" --args --remote-debugging-port=9559`  
**Linux**: 添加到您的 `.desktop` 文件的 Exec 行中

> 💡 安装后，如首次运行时该端口未开启，系统将显示自动修补提示。

### 2. 安装扩展
在 Antigravity 的 **扩展 (Extensions) 面板** 中搜索 `AutoAntigravity` 并直接安装。
- [Open VSX Registry: AutoAntigravity 页面](https://open-vsx.org/extension/shinepcsg/AutoAntigravity)

---

## 📖 使用方法

### Auto Accept
- **切换开关**: 在状态栏上点击 `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF`
- **命令行**: `Ctrl+Shift+P` → `AutoAntigravity: Toggle Auto Accept`

### 📱 Telegram 机器人设置
您可以绑定一个 Telegram 机器人来监控工作任务并接收通知。

1. **创建机器人**: 在 Telegram 中通过 `@BotFather` 创建一个机器人，并获取 **Bot Token**。
2. **获取 Chat ID**: 向机器人发送一条消息，或使用诸如 `@msid_bot` 等工具来获取您的 **Chat ID**。
3. **注册设置**: 点击左侧活动栏的 **AutoAntigravity 图标** 开启侧边栏设置面板。
4. 在面板的 **Telegram 绑定管理** 菜单中输入 Token 和 Chat ID 后保存。
   > 💡 *所配置的信息将安全地保存在工作区根目录下的 `.env` 文件中。*

### 🔄 Ralph Loop
1. **准备任务文件**: 在工作区创建 `PRD.md` (使用复选框格式)
   ```markdown
   - [ ] 实现 API 接口
   - [ ] 设计数据库模式
   - [ ] 编写单元测试
   ```
2. **开始运行**: `Ctrl+Shift+P` → `AutoAntigravity: Start Ralph Loop`
3. **停止运行**: `Ctrl+Shift+P` → `AutoAntigravity: Stop Ralph Loop`

### `/write-prd` 工作流注册

使用 `/write-prd` 斜杠命令后，AI 代理会自动生成 PRD 并立即将其应用于 Ralph Loop。  
要使用此工作流，您需要将其注册为 **全局工作流** 或 **项目工作流**。

#### 方法 1: 项目工作流 (仅在当前项目中使用)

将 `.agent/workflows/write-prd.md` 文件放置在项目根目录中。  
AutoAntigravity 仓库中已包含该文件，只需将文件复制到您的项目中即可使用。

```
your-project/
├── .agent/
│   └── workflows/
│       └── write-prd.md    ← 放置于此
├── PRD.md
└── ...
```

> 💡 也支持以下路径: `.agents/workflows/`, `_agent/workflows/`, `_agents/workflows/`

#### 方法 2: 全局工作流 (在所有项目中使用)

将文件放置于用户主目录下的 `.agent/workflows/` 文件夹内，即可在任何项目中使用 `/write-prd` 命令。

**Windows** (在项目根目录执行):
```powershell
# 创建全局工作流目录
New-Item -ItemType Directory -Path "$env:USERPROFILE\.agent\workflows" -Force

# 复制 write-prd.md
Copy-Item ".\.agent\workflows\write-prd.md" "$env:USERPROFILE\.agent\workflows\write-prd.md"
```

**Mac / Linux** (在项目根目录执行):
```bash
# 创建全局工作流目录
mkdir -p ~/.agent/workflows

# 复制 write-prd.md
cp ./.agent/workflows/write-prd.md ~/.agent/workflows/write-prd.md
```

完成注册后，只需在 Antigravity 聊天窗口中输入 `/write-prd` 即可执行该工作流。

---

### 🔀 并行任务配置

Ralph Loop 可以在 **独立的 git worktree** 中同时执行标注有 `#parallel` 标签的任务。

#### 开启功能

并行执行功能默认处于开启状态。可以在设置中对其进行控制：

| 设置项 | 默认值 | 说明 |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | 启用/禁用并行执行 |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | 最大并发任务数量 (2~8) |

#### 在 PRD 中指定并行任务

在任务项中添加 `#parallel` 标签，即可并行执行这些任务：

```markdown
### Step 2: 实现独立的模块
- [ ] #parallel 任务 2-1: 实现用户模块 (src/user.js)
- [ ] #parallel 任务 2-2: 实现商品模块 (src/product.js)
- [ ] #parallel 任务 2-3: 实现订单模块 (src/order.js)
- [ ] 验证 2: 确保所有模块通过单元测试
```

#### 并行任务规则

- **连续出现的 `#parallel` 任务项**将组成一个常规并行组。
- 如果在中间插入了一个普通任务，它们将被分隔成 **不同的并行组**。
- 请仅将此用在**修改不同文件**的任务上 — 如果修改同一个文件将产生合并冲突。
- **请勿将此用于**依赖同一组内前序任务输出的任务。

#### 运行原理

1. 当 Ralph Loop 检测到一个并行组时，它会为每个任务创建一个 **独立的 git worktree**。
2. 独立的 Antigravity 代理会在各自的 worktree 中并行执行任务。
3. 一旦所有并行任务完成，便将结果 **自动合并到主分支**。
4. 如发生合并冲突，AI 将尝试自动解决。

---

## ⚙ 设置

| 设置项 | 默认值 | 说明 |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | 轮询间隔 (ms) |
| `autoAntigravity.autoAccept.cdpPort` | `9559` | CDP 调试端口 |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | 额外的自动点击按钮文本 |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | 最大迭代次数 |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | 任务文件名 |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | 进度记录文件名 |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | 在每次迭代后自动分支与提交 |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | 合并后自动删除任务分支 |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `1500` | 迭代之间的延迟时间 (ms) |
| `autoAntigravity.ralphLoop.allowPrdModification` | `false` | 允许代理修改 PRD 文件 |
| `autoAntigravity.ralphLoop.autoStart` | `true` | 当PRD文件改变时自动启动 Ralph Loop |
| `autoAntigravity.ralphLoop.enableParallel` | `true` | 允许标注 `#parallel` 标签的任务并行执行 |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | 最大并发并行任务数 (2~8) |

---

## 🔒 安全性

- Auto Accept 仅在 **Antigravity 代理面板内** 运行 (Webview Guard 防止误触)
- 它不会在外部网页上进行任何点击操作
- CDP **仅限本地回环地址 (localhost)** — 无外部网络访问权限
- Ralph Loop 通过限制最大迭代次数防止出现死循环

---

## 📝 许可协议

MIT License — [LICENSE](LICENSE)

## 🙏 鸣谢
Chansun Park (shinepcs@gmail.com)
