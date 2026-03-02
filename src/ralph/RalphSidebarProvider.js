// AutoAntigravity — Ralph Loop Sidebar Webview Provider
// Provides a rich sidebar UI for controlling Ralph Loop

const vscode = require('vscode');
const crypto = require('crypto');

class RalphSidebarProvider {
    static viewType = 'autoAntigravity.ralphSidebar';

    /**
     * @param {vscode.ExtensionContext} context
     * @param {Function} log
     */
    constructor(context, log) {
        this._context = context;
        this._log = log;
        this._view = null;

        // External references (set by extension.js)
        this.ralphLoop = null;
        this.autoAccept = null;
        this.onToggleAutoAccept = null;
        this.onStartRalph = null;
        this.onStopRalph = null;
        this.onEmergencyStop = null;
        this.onSelectTaskFile = null;
    }

    /**
     * Called by VS Code when the webview view first becomes visible.
     * @param {vscode.WebviewView} webviewView
     */
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'toggleAutoAccept':
                    if (this.onToggleAutoAccept) {
                        await this.onToggleAutoAccept();
                    }
                    this.updateState();
                    break;
                case 'startRalph':
                    if (this.onStartRalph) this.onStartRalph();
                    break;
                case 'stopRalph':
                    if (this.onStopRalph) this.onStopRalph();
                    break;
                case 'emergencyStop':
                    if (this.onEmergencyStop) this.onEmergencyStop();
                    break;
                case 'selectTaskFile':
                    if (this.onSelectTaskFile) this.onSelectTaskFile();
                    break;
                case 'setMaxIterations': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    await config.update('ralphLoop.maxIterations', message.value, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Max iterations set to ${message.value}`);
                    break;
                }
                case 'setIterationDelay': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    await config.update('ralphLoop.iterationDelayMs', message.value, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Iteration delay set to ${message.value}ms`);
                    break;
                }
                case 'toggleAutoCommit': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.autoCommit', true);
                    await config.update('ralphLoop.autoCommit', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Auto-commit: ${!current ? 'ON' : 'OFF'}`);
                    break;
                }
                case 'toggleAllowPrdMod': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.allowPrdModification', false);
                    await config.update('ralphLoop.allowPrdModification', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] PRD modification: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'ready':
                    this.updateState();
                    break;
            }
        });

        // When the view becomes visible, send the current state
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.updateState();
            }
        });
    }

    /**
     * Send the current state to the webview
     */
    updateState() {
        if (!this._view || !this._view.visible) return;

        const config = vscode.workspace.getConfiguration('autoAntigravity');

        const state = {
            version: this._context.extension.packageJSON.version || 'unknown',
            autoAcceptEnabled: this.autoAccept ? this.autoAccept.isEnabled : false,
            ralphState: this.ralphLoop ? this.ralphLoop.getState() : 'idle',
            currentIteration: this.ralphLoop ? this.ralphLoop.currentIteration : 0,
            maxIterations: config.get('ralphLoop.maxIterations', 50),
            iterationDelay: config.get('ralphLoop.iterationDelayMs', 3000),
            autoCommit: config.get('ralphLoop.autoCommit', true),
            allowPrdModification: config.get('ralphLoop.allowPrdModification', false),
            taskFile: this.ralphLoop && this.ralphLoop.taskManager
                ? this.ralphLoop.taskManager.getTaskFile()
                : null,
            progress: this.ralphLoop && this.ralphLoop.taskManager
                ? this.ralphLoop.taskManager.getProgress()
                : { total: 0, completed: 0, remaining: 0 },
            // 로그, 에러, PRD 변경 정보
            recentLogs: this.ralphLoop ? this.ralphLoop.getRecentLogs(30) : [],
            lastError: this.ralphLoop ? this.ralphLoop.lastError : null,
            consecutiveErrors: this.ralphLoop ? this.ralphLoop.consecutiveErrors : 0,
            prdChanges: this.ralphLoop ? this.ralphLoop.getPrdChanges() : []
        };

        this._view.webview.postMessage({ command: 'updateState', state });
    }

    /**
     * Generate the HTML for the sidebar webview
     */
    _getHtml(webview) {
        const nonce = crypto.randomBytes(16).toString('hex');

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
    :root {
        --bg: var(--vscode-sideBar-background);
        --fg: var(--vscode-sideBar-foreground, var(--vscode-foreground));
        --btn-bg: var(--vscode-button-background);
        --btn-fg: var(--vscode-button-foreground);
        --btn-hover: var(--vscode-button-hoverBackground);
        --btn-secondary-bg: var(--vscode-button-secondaryBackground);
        --btn-secondary-fg: var(--vscode-button-secondaryForeground);
        --input-bg: var(--vscode-input-background);
        --input-fg: var(--vscode-input-foreground);
        --input-border: var(--vscode-input-border, transparent);
        --border: var(--vscode-panel-border, rgba(128,128,128,0.2));
        --danger: var(--vscode-errorForeground, #f44);
        --warning: var(--vscode-editorWarning-foreground, #fa3);
        --success: #4caf50;
        --accent: var(--vscode-focusBorder, #007acc);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size, 13px);
        color: var(--fg);
        background: var(--bg);
        padding: 12px;
        line-height: 1.4;
    }

    .section {
        margin-bottom: 16px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--border);
    }
    .section:last-child { border-bottom: none; }

    .section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        margin-bottom: 10px;
        opacity: 0.7;
    }

    /* ─── Buttons ─── */
    .btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 7px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        transition: background 0.15s, opacity 0.15s;
    }
    .btn:hover { opacity: 0.9; }
    .btn:active { opacity: 0.7; }

    .btn-primary {
        background: var(--btn-bg);
        color: var(--btn-fg);
    }
    .btn-primary:hover { background: var(--btn-hover); }

    .btn-secondary {
        background: var(--btn-secondary-bg);
        color: var(--btn-secondary-fg);
    }

    .btn-danger {
        background: var(--danger);
        color: #fff;
    }

    .btn-success {
        background: var(--success);
        color: #fff;
    }

    .btn-toggle {
        position: relative;
        overflow: hidden;
    }
    .btn-toggle.active {
        background: var(--warning);
        color: #000;
    }

    .btn + .btn { margin-top: 6px; }

    /* ─── Indicator Pill ─── */
    .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
    }
    .status-pill .dot {
        width: 7px; height: 7px;
        border-radius: 50%;
    }
    .status-pill.idle   .dot { background: #888; }
    .status-pill.running .dot { background: var(--success); animation: pulse 1.2s infinite; }
    .status-pill.stopping .dot { background: var(--danger); animation: pulse 0.6s infinite; }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
    }

    /* ─── Progress ─── */
    .progress-bar-container {
        width: 100%;
        height: 6px;
        background: rgba(128,128,128,0.2);
        border-radius: 3px;
        overflow: hidden;
        margin: 8px 0;
    }
    .progress-bar-fill {
        height: 100%;
        background: var(--accent);
        border-radius: 3px;
        transition: width 0.4s ease;
    }

    .progress-text {
        font-size: 11px;
        opacity: 0.7;
    }

    /* ─── Inputs ─── */
    .form-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }
    .form-row label {
        font-size: 12px;
        flex-shrink: 0;
    }
    .form-row input[type="number"] {
        width: 70px;
        padding: 3px 6px;
        background: var(--input-bg);
        color: var(--input-fg);
        border: 1px solid var(--input-border);
        border-radius: 3px;
        font-family: inherit;
        font-size: 12px;
        text-align: right;
    }

    /* ─── Task File ─── */
    .task-file-name {
        font-size: 11px;
        padding: 4px 8px;
        background: var(--input-bg);
        border-radius: 3px;
        word-break: break-all;
        margin-bottom: 8px;
        opacity: 0.85;
    }

    /* ─── Checkbox Toggle ─── */
    .toggle-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        cursor: pointer;
        font-size: 12px;
    }
    .toggle-row input[type="checkbox"] {
        accent-color: var(--accent);
    }

    /* ─── Iteration Counter ─── */
    .iteration-display {
        font-size: 22px;
        font-weight: 700;
        text-align: center;
        margin: 6px 0;
    }
    .iteration-label { font-size: 11px; text-align: center; opacity: 0.6; }

    /* ─── Spinner ─── */
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .spinner {
        display: inline-block;
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    /* ─── Error Banner ─── */
    .error-banner {
        display: none;
        background: rgba(244, 67, 54, 0.15);
        border: 1px solid var(--danger);
        border-radius: 4px;
        padding: 8px 10px;
        margin-bottom: 10px;
        font-size: 11px;
    }
    .error-banner.visible { display: block; }
    .error-banner .error-title {
        font-weight: 600;
        color: var(--danger);
        margin-bottom: 4px;
    }
    .error-banner .error-msg {
        opacity: 0.85;
        word-break: break-word;
    }

    /* ─── Log Panel ─── */
    .log-panel {
        max-height: 200px;
        overflow-y: auto;
        background: var(--input-bg);
        border-radius: 4px;
        padding: 6px 8px;
        font-size: 10px;
        font-family: var(--vscode-editor-font-family, monospace);
        line-height: 1.5;
    }
    .log-panel::-webkit-scrollbar {
        width: 5px;
    }
    .log-panel::-webkit-scrollbar-thumb {
        background: rgba(128,128,128,0.4);
        border-radius: 3px;
    }
    .log-line {
        white-space: pre-wrap;
        word-break: break-word;
        padding: 1px 0;
    }
    .log-line .log-time {
        opacity: 0.5;
        margin-right: 4px;
    }
    .log-line.log-error { color: var(--danger); }
    .log-line.log-warn { color: var(--warning); }
    .log-line.log-info { opacity: 0.85; }

    .log-empty {
        opacity: 0.4;
        text-align: center;
        padding: 10px;
        font-size: 11px;
    }

    /* ─── Version Footer ─── */
    .version-footer {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 10px;
        opacity: 0.45;
        transition: opacity 0.2s;
    }
    .version-footer:hover { opacity: 0.75; }
    .version-footer .version-icon {
        font-size: 12px;
    }
</style>
</head>
<body>
    <!-- ═══ Error Banner ═══ -->
    <div id="errorBanner" class="error-banner">
        <div class="error-title">❌ 에러 발생</div>
        <div id="errorMsg" class="error-msg"></div>
    </div>

    <!-- ═══ Auto Accept Section ═══ -->
    <div class="section">
        <div class="section-title">⚡ Auto Accept</div>
        <button id="btnToggleAutoAccept" class="btn btn-toggle">
            <span id="autoAcceptIcon">$(circle-slash)</span>
            <span id="autoAcceptLabel">OFF</span>
        </button>
    </div>

    <!-- ═══ Ralph Loop Section ═══ -->
    <div class="section">
        <div class="section-title">🔄 Ralph Loop</div>

        <!-- Status -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span id="ralphStatus" class="status-pill idle">
                <span class="dot"></span>
                <span id="ralphStatusText">IDLE</span>
            </span>
        </div>

        <!-- Iteration Counter -->
        <div id="iterationArea" style="display:none;">
            <div class="iteration-label">현재 반복</div>
            <div id="iterationCount" class="iteration-display">0</div>
        </div>

        <!-- Progress -->
        <div id="progressArea" style="display:none;">
            <div class="progress-bar-container">
                <div id="progressFill" class="progress-bar-fill" style="width:0%"></div>
            </div>
            <div id="progressText" class="progress-text">0 / 0 tasks</div>
        </div>

        <!-- Controls -->
        <button id="btnStartRalph" class="btn btn-success">
            ▶ 시작
        </button>
        <button id="btnStopRalph" class="btn btn-secondary" style="display:none;">
            ⏹ 정지
        </button>
        <button id="btnEmergency" class="btn btn-danger" style="display:none;">
            🛑 긴급 정지
        </button>
    </div>

    <!-- ═══ Task File Section ═══ -->
    <div class="section">
        <div class="section-title">📋 작업 파일</div>
        <div id="taskFileName" class="task-file-name">선택되지 않음</div>
        <button id="btnSelectTaskFile" class="btn btn-secondary">
            📂 파일 선택
        </button>
    </div>

    <!-- ═══ PRD Changes Section ═══ -->
    <div id="prdChangesSection" class="section" style="display:none;">
        <div class="section-title">📝 PRD 변경 이력</div>
        <div id="prdChangesPanel" class="log-panel" style="max-height:140px;"></div>
    </div>

    <!-- ═══ Log Panel Section ═══ -->
    <div class="section">
        <div class="section-title">📜 실시간 로그</div>
        <div id="logPanel" class="log-panel">
            <div class="log-empty">아직 로그가 없습니다</div>
        </div>
    </div>

    <!-- ═══ Settings Section ═══ -->
    <div class="section">
        <div class="section-title">⚙ 설정</div>
        <div class="form-row">
            <label>최대 반복 횟수</label>
            <input id="inputMaxIter" type="number" min="1" max="999" value="50" />
        </div>
        <div class="form-row">
            <label>반복 간격 (ms)</label>
            <input id="inputDelay" type="number" min="500" max="60000" step="500" value="3000" />
        </div>
        <label id="labelAutoCommit" class="toggle-row">
            <input id="chkAutoCommit" type="checkbox" checked />
            자동 Git 커밋
        </label>
        <label id="labelAllowPrdMod" class="toggle-row">
            <input id="chkAllowPrdMod" type="checkbox" />
            PRD 수정 허용
        </label>
    </div>

    <!-- ═══ Version Footer ═══ -->
    <div class="version-footer">
        <span class="version-icon">🚀</span>
        <span>AutoAntigravity</span>
        <span id="versionText">v--</span>
    </div>

<script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();

    // ─── Event Bindings (CSP-safe, no inline onclick) ─────
    document.getElementById('btnToggleAutoAccept').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'toggleAutoAccept' });
    });
    document.getElementById('btnStartRalph').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'startRalph' });
    });
    document.getElementById('btnStopRalph').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'stopRalph' });
    });
    document.getElementById('btnEmergency').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'emergencyStop' });
    });
    document.getElementById('btnSelectTaskFile').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'selectTaskFile' });
    });
    document.getElementById('inputMaxIter').addEventListener('change', (e) => {
        vscodeApi.postMessage({ command: 'setMaxIterations', value: parseInt(e.target.value, 10) || 50 });
    });
    document.getElementById('inputDelay').addEventListener('change', (e) => {
        vscodeApi.postMessage({ command: 'setIterationDelay', value: parseInt(e.target.value, 10) || 3000 });
    });
    document.getElementById('labelAutoCommit').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoCommit' });
    });
    document.getElementById('labelAllowPrdMod').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAllowPrdMod' });
    });

    // ─── State Handling ────────────────────────────────────
    window.addEventListener('message', (event) => {
        const { command, state } = event.data;
        if (command === 'updateState') {
            applyState(state);
        }
    });

    function applyState(s) {
        // Auto Accept
        const btn = document.getElementById('btnToggleAutoAccept');
        const label = document.getElementById('autoAcceptLabel');
        if (s.autoAcceptEnabled) {
            btn.classList.add('active');
            label.textContent = 'ON — 자동 수락 활성';
        } else {
            btn.classList.remove('active');
            label.textContent = 'OFF';
        }

        // Error Banner
        const errorBanner = document.getElementById('errorBanner');
        const errorMsg = document.getElementById('errorMsg');
        if (s.lastError) {
            errorBanner.classList.add('visible');
            errorMsg.textContent = s.lastError + (s.consecutiveErrors > 1 ? ' (연속 ' + s.consecutiveErrors + '회)' : '');
        } else {
            errorBanner.classList.remove('visible');
        }

        // Ralph Status
        const pill = document.getElementById('ralphStatus');
        const statusText = document.getElementById('ralphStatusText');
        pill.className = 'status-pill ' + s.ralphState;

        const iterArea = document.getElementById('iterationArea');
        const progressArea = document.getElementById('progressArea');
        const btnStart = document.getElementById('btnStartRalph');
        const btnStop = document.getElementById('btnStopRalph');
        const btnEmergency = document.getElementById('btnEmergency');

        switch (s.ralphState) {
            case 'running':
                statusText.textContent = 'RUNNING';
                iterArea.style.display = 'block';
                progressArea.style.display = 'block';
                btnStart.style.display = 'none';
                btnStop.style.display = '';
                btnEmergency.style.display = '';
                break;
            case 'stopping':
                statusText.textContent = 'STOPPING...';
                btnStart.style.display = 'none';
                btnStop.style.display = 'none';
                btnEmergency.style.display = '';
                break;
            default:
                statusText.textContent = 'IDLE';
                iterArea.style.display = 'none';
                progressArea.style.display = s.progress && s.progress.total > 0 ? 'block' : 'none';
                btnStart.style.display = '';
                btnStop.style.display = 'none';
                btnEmergency.style.display = 'none';
        }

        // Iteration
        document.getElementById('iterationCount').textContent = s.currentIteration || 0;

        // Progress
        if (s.progress && s.progress.total > 0) {
            const pct = Math.round((s.progress.completed / s.progress.total) * 100);
            document.getElementById('progressFill').style.width = pct + '%';
            document.getElementById('progressText').textContent =
                s.progress.completed + ' / ' + s.progress.total + ' tasks (' + pct + '%)';
        }

        // Task file
        if (s.taskFile) {
            const parts = s.taskFile.replace(/\\\\/g, '/').split('/');
            document.getElementById('taskFileName').textContent = parts[parts.length - 1];
        } else {
            document.getElementById('taskFileName').textContent = '선택되지 않음';
        }

        // Settings
        document.getElementById('inputMaxIter').value = s.maxIterations;
        document.getElementById('inputDelay').value = s.iterationDelay;
        document.getElementById('chkAutoCommit').checked = s.autoCommit;
        document.getElementById('chkAllowPrdMod').checked = s.allowPrdModification || false;

        // Version
        if (s.version) {
            document.getElementById('versionText').textContent = 'v' + s.version;
        }

        // PRD Changes
        updatePrdChangesPanel(s.prdChanges || []);

        // Logs
        updateLogPanel(s.recentLogs || []);
    }

    function updatePrdChangesPanel(changes) {
        const section = document.getElementById('prdChangesSection');
        const panel = document.getElementById('prdChangesPanel');
        if (!changes || changes.length === 0) {
            section.style.display = 'none';
            return;
        }
        section.style.display = '';
        let html = '';
        for (const c of changes) {
            html += '<div class="log-line log-warn">';
            html += '<strong>반복 ' + c.iteration + '</strong> ';
            if (c.added && c.added.length > 0) {
                html += '<span style="color:var(--success)">+' + c.added.length + '</span> ';
            }
            if (c.removed && c.removed.length > 0) {
                html += '<span style="color:var(--danger)">-' + c.removed.length + '</span>';
            }
            html += '</div>';
            if (c.added) {
                for (const t of c.added) {
                    html += '<div class="log-line log-info" style="color:var(--success);padding-left:12px;">➕ ' + escapeHtml(t.substring(0, 50)) + '</div>';
                }
            }
            if (c.removed) {
                for (const t of c.removed) {
                    html += '<div class="log-line log-info" style="color:var(--danger);padding-left:12px;">➖ ' + escapeHtml(t.substring(0, 50)) + '</div>';
                }
            }
        }
        panel.innerHTML = html;
        panel.scrollTop = panel.scrollHeight;
    }

    function updateLogPanel(logs) {
        const panel = document.getElementById('logPanel');
        if (!logs || logs.length === 0) {
            panel.innerHTML = '<div class="log-empty">아직 로그가 없습니다</div>';
            return;
        }

        let html = '';
        for (const entry of logs) {
            const levelClass = 'log-' + (entry.level || 'info');
            const escapedMsg = escapeHtml(entry.msg);
            html += '<div class="log-line ' + levelClass + '">'
                + '<span class="log-time">' + escapeHtml(entry.time) + '</span>'
                + escapedMsg
                + '</div>';
        }
        panel.innerHTML = html;
        // Auto-scroll to bottom
        panel.scrollTop = panel.scrollHeight;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Request initial state
    vscodeApi.postMessage({ command: 'ready' });
</script>
</body>
</html>`;
    }
}

module.exports = { RalphSidebarProvider };
