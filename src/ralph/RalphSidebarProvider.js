// AutoAntigravity — Ralph Loop Sidebar Webview Provider
// Provides a rich sidebar UI for controlling Ralph Loop

const vscode = require('vscode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
        this.telemetryService = null;
        this.autoUpdater = null;
        this.onToggleAutoAccept = null;
        this.onStartRalph = null;
        this.onStopRalph = null;
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
                case 'selectTaskFile':
                    if (this.onSelectTaskFile) this.onSelectTaskFile();
                    break;
                case 'openTaskFile': {
                    const filePath = message.filePath;
                    if (filePath) {
                        try {
                            const doc = await vscode.workspace.openTextDocument(filePath);
                            await vscode.window.showTextDocument(doc, { preview: false });
                        } catch (err) {
                            this._log(`[Sidebar] Failed to open task file: ${err.message}`);
                        }
                    }
                    break;
                }
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

                case 'toggleAllowPrdMod': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.allowPrdModification', false);
                    await config.update('ralphLoop.allowPrdModification', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] PRD modification: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'toggleAutoStart': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.autoStart', true);
                    await config.update('ralphLoop.autoStart', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Auto Start: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'toggleAutoCommit': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.autoCommit', true);
                    await config.update('ralphLoop.autoCommit', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Auto Commit: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'toggleAutoDeleteBranch': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.autoDeleteBranch', true);
                    await config.update('ralphLoop.autoDeleteBranch', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Auto Delete Branch: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'refreshQuota':
                    if (this.telemetryService) {
                        this.telemetryService.refresh();
                    }
                    break;
                case 'installUpdate':
                    if (this.autoUpdater) {
                        this.autoUpdater.installUpdate();
                    }
                    break;
                case 'installSpecificVersion':
                    if (this.autoUpdater && message.version) {
                        this.autoUpdater.installSpecificVersion(message.version);
                    }
                    break;
                case 'toggleAutoInstall': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('updater.autoInstall', false);
                    await config.update('updater.autoInstall', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Auto Install: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'generateSamplePrd': {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        vscode.window.showWarningMessage('워크스페이스가 열려있지 않습니다.');
                        break;
                    }
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const taskFileName = config.get('ralphLoop.taskFile', 'PRD.md');
                    const rootPath = workspaceFolders[0].uri.fsPath;
                    const prdPath = path.join(rootPath, taskFileName);

                    const sampleContent = [
                        '# 랄프루프 테스트용 임시 PRD',
                        '',
                        '> **목적**: Ralph Loop의 순차 실행, 병렬 실행, 검증 기능이 정상 동작하는지 테스트',
                        '',
                        '---',
                        '',
                        '## 작업 목록',
                        '',
                        '### Step 1: 순차 작업 테스트',
                        '- [ ] 작업 1-1: 워크스페이스 루트에 `test-output/` 디렉토리를 생성하고, `test-output/sequential-1.txt` 파일에 "Step 1-1 완료" 내용을 작성.',
                        '- [ ] 작업 1-2: `test-output/sequential-2.txt` 파일에 "Step 1-2 완료" 내용을 작성. (`test-output/sequential-1.txt`가 존재하는지 확인 후 진행)',
                        '- [ ] 검증 1: `test-output/sequential-1.txt`와 `test-output/sequential-2.txt` 파일이 모두 존재하고 올바른 내용을 담고 있는지 확인.',
                        '',
                        '### Step 2: 병렬 작업 테스트',
                        '- [ ] [병렬진행] 작업 2-1: `test-output/parallel-a.txt` 파일에 "병렬 작업 A 완료" 내용을 작성.',
                        '- [ ] [병렬진행] 작업 2-2: `test-output/parallel-b.txt` 파일에 "병렬 작업 B 완료" 내용을 작성.',
                        '- [ ] [병렬진행] 작업 2-3: `test-output/parallel-c.txt` 파일에 "병렬 작업 C 완료" 내용을 작성.',
                        '- [ ] 검증 2: `test-output/parallel-a.txt`, `test-output/parallel-b.txt`, `test-output/parallel-c.txt` 파일이 모두 존재하고 올바른 내용을 담고 있는지 확인.(파일이 없다면 에러이므로 파일을 임의로 생성하지 마라.)',
                        '',
                        '### Step 3: 정리',
                        '- [ ] 작업 3-1: `test-output/` 디렉토리와 그 안의 모든 파일을 삭제하여 테스트 흔적을 정리.',
                        '- [ ] 검증 3: `test-output/` 디렉토리가 더 이상 존재하지 않는지 확인.',
                        '',
                        '---',
                        '',
                        '## 각 단계별 작업 중 필요하다면 PRD에 내용을 추가하거나 변경해라.',
                        ''
                    ].join('\n');

                    const doWrite = async () => {
                        try {
                            fs.writeFileSync(prdPath, sampleContent, 'utf8');
                            const doc = await vscode.workspace.openTextDocument(prdPath);
                            await vscode.window.showTextDocument(doc, { preview: false });
                            this._log(`[Sidebar] Sample PRD created: ${taskFileName}`);
                            vscode.window.showInformationMessage(`샘플 PRD가 생성되었습니다: ${taskFileName}`);
                        } catch (err) {
                            this._log(`[Sidebar] Failed to create sample PRD: ${err.message}`);
                            vscode.window.showErrorMessage(`PRD 생성 실패: ${err.message}`);
                        }
                    };

                    if (fs.existsSync(prdPath)) {
                        const answer = await vscode.window.showWarningMessage(
                            `${taskFileName} 파일이 이미 존재합니다. 덮어쓰시겠습니까?`,
                            { modal: true },
                            '덮어쓰기'
                        );
                        if (answer === '덮어쓰기') {
                            await doWrite();
                        }
                    } else {
                        await doWrite();
                    }
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

            allowPrdModification: config.get('ralphLoop.allowPrdModification', false),
            autoStart: config.get('ralphLoop.autoStart', true),
            autoCommit: config.get('ralphLoop.autoCommit', true),
            autoDeleteBranch: config.get('ralphLoop.autoDeleteBranch', true),
            taskFile: this.ralphLoop && this.ralphLoop.taskManager
                ? this.ralphLoop.taskManager.getTaskFile()
                : null,
            taskFileExists: (() => {
                const tf = this.ralphLoop && this.ralphLoop.taskManager
                    ? this.ralphLoop.taskManager.getTaskFile()
                    : null;
                if (!tf) return false;
                return fs.existsSync(tf);
            })(),
            progress: this.ralphLoop && this.ralphLoop.taskManager
                ? this.ralphLoop.taskManager.getProgress()
                : { total: 0, completed: 0, remaining: 0 },
            // 로그, 에러, PRD 변경 정보
            recentLogs: this.ralphLoop ? this.ralphLoop.getRecentLogs(30) : [],
            lastError: this.ralphLoop ? this.ralphLoop.lastError : null,
            consecutiveErrors: this.ralphLoop ? this.ralphLoop.consecutiveErrors : 0,
            prdChanges: this.ralphLoop ? this.ralphLoop.getPrdChanges() : [],
            // 텔레메트리
            quota: this.telemetryService ? this.telemetryService.getData() : { connected: false, models: [] },
            // 업데이트 정보
            updateInfo: this.autoUpdater ? this.autoUpdater.getUpdateState() : { available: false, availableVersions: [] },
            autoInstall: config.get('updater.autoInstall', false)
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
        transition: background 0.15s, opacity 0.15s;
    }
    .task-file-name.clickable {
        cursor: pointer;
        text-decoration: underline;
        text-decoration-style: dotted;
        text-underline-offset: 2px;
    }
    .task-file-name.clickable:hover {
        opacity: 1;
        background: rgba(128,128,128,0.25);
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

    /* ─── Quota Section ─── */
    .quota-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .quota-refresh-btn {
        background: none;
        border: none;
        color: var(--fg);
        cursor: pointer;
        font-size: 13px;
        opacity: 0.5;
        transition: opacity 0.15s;
        padding: 2px 4px;
    }
    .quota-refresh-btn:hover { opacity: 1; }
    .quota-status {
        font-size: 10px;
        opacity: 0.5;
        margin-bottom: 8px;
    }
    .quota-model {
        margin-bottom: 8px;
    }
    .quota-model-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        margin-bottom: 3px;
    }
    .quota-model-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        margin-right: 6px;
    }
    .quota-pct {
        font-weight: 600;
        font-size: 11px;
        flex-shrink: 0;
    }
    .quota-bar {
        width: 100%;
        height: 5px;
        background: rgba(128,128,128,0.2);
        border-radius: 3px;
        overflow: hidden;
    }
    .quota-bar-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.5s ease, background 0.3s;
    }
    .quota-bar-fill.level-ok     { background: #4caf50; }
    .quota-bar-fill.level-caution { background: #ff9800; }
    .quota-bar-fill.level-warn   { background: #f57c00; }
    .quota-bar-fill.level-critical { background: #f44336; }
    .quota-bar-fill.level-empty  { background: #9e9e9e; }
    .quota-reset {
        font-size: 10px;
        opacity: 0.5;
        margin-top: 2px;
    }
    .quota-empty {
        opacity: 0.4;
        text-align: center;
        padding: 10px;
        font-size: 11px;
    }
    .quota-list {
        max-height: 240px;
        overflow-y: auto;
    }
    .quota-list::-webkit-scrollbar { width: 4px; }
    .quota-list::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 2px; }

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

    /* ─── Update Banner ─── */
    .update-banner {
        display: none;
        background: linear-gradient(135deg, rgba(76, 175, 80, 0.15), rgba(33, 150, 243, 0.15));
        border: 1px solid var(--success);
        border-radius: 6px;
        padding: 10px 12px;
        margin-bottom: 12px;
        animation: updatePulse 2s ease-in-out infinite;
    }
    .update-banner.visible { display: block; }
    @keyframes updatePulse {
        0%, 100% { border-color: var(--success); }
        50% { border-color: var(--accent); }
    }
    .update-banner-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--success);
        margin-bottom: 6px;
    }
    .update-banner-version {
        font-size: 11px;
        margin-bottom: 8px;
        opacity: 0.85;
    }
    .update-banner .btn {
        font-size: 11px;
        padding: 5px 10px;
    }

    /* ─── Version Buttons ─── */
    .version-buttons {
        margin-top: 8px;
    }
    .version-buttons:empty {
        display: none;
    }
    .version-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 5px 10px;
        border: 1px solid rgba(76, 175, 80, 0.3);
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 11px;
        font-weight: 500;
        background: rgba(76, 175, 80, 0.08);
        color: var(--fg);
        transition: background 0.15s, border-color 0.15s;
    }
    .version-btn:hover {
        background: rgba(76, 175, 80, 0.2);
        border-color: var(--success);
    }
    .version-btn:active {
        opacity: 0.7;
    }
    .version-btn + .version-btn {
        margin-top: 4px;
    }
</style>
</head>
<body>
    <!-- ═══ Update Banner ═══ -->
    <div id="updateBanner" class="update-banner">
        <div class="update-banner-title">🆕 업데이트 가능</div>
        <div id="updateVersionText" class="update-banner-version"></div>
        <button id="btnInstallUpdate" class="btn btn-success">⬆ 지금 업데이트</button>
    </div>

    <!-- ═══ Error Banner ═══ -->
    <div id="errorBanner" class="error-banner">
        <div class="error-title">❌ 에러 발생</div>
        <div id="errorMsg" class="error-msg"></div>
    </div>

    <!-- ═══ Auto Accept Section ═══ -->
    <div class="section">
        <div class="section-title">⚡ Auto Accept</div>
        <button id="btnToggleAutoAccept" class="btn btn-toggle">
            <span id="autoAcceptIcon">🚫</span>
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
    </div>

    <!-- ═══ Task File Section ═══ -->
    <div class="section">
        <div class="section-title">📋 작업 파일</div>
        <div id="taskFileName" class="task-file-name">선택되지 않음</div>
        <button id="btnSelectTaskFile" class="btn btn-secondary">
            📂 파일 선택
        </button>
        <button id="btnGenerateSamplePrd" class="btn btn-secondary">
            📝 PRD샘플 생성
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

    <!-- ═══ AI Quota Section ═══ -->
    <div class="section">
        <div class="quota-header">
            <div class="section-title">🔋 AI 사용량</div>
            <button id="btnRefreshQuota" class="quota-refresh-btn" title="새로고침">🔄</button>
        </div>
        <div id="quotaStatus" class="quota-status">연결 중...</div>
        <div id="quotaList" class="quota-list">
            <div class="quota-empty">데이터 로딩 중...</div>
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

        <label id="labelAllowPrdMod" class="toggle-row">
            <input id="chkAllowPrdMod" type="checkbox" />
            PRD 수정 허용
        </label>

        <label id="labelAutoStart" class="toggle-row">
            <input id="chkAutoStart" type="checkbox" />
            🚀 PRD 변경 시 자동 시작
        </label>
        <label id="labelAutoCommit" class="toggle-row">
            <input id="chkAutoCommit" type="checkbox" />
            🌿 Git Auto Commit (작업별 브랜치 & 머지)
        </label>
        <label id="labelAutoDeleteBranch" class="toggle-row">
            <input id="chkAutoDeleteBranch" type="checkbox" />
            🗑 자동 브랜치 폐기 (머지 후 삭제)
        </label>
        <label id="labelAutoInstall" class="toggle-row">
            <input id="chkAutoInstall" type="checkbox" />
            ⬆ 자동 업데이트 설치
        </label>
        <div id="versionButtons" class="version-buttons"></div>
    </div>

    <!-- ═══ Version Footer ═══ -->
    <div class="version-footer">
        <span class="version-icon">🚀</span>
        <span>AutoAntigravity</span>
        <span id="versionText">v--</span>
    </div>

<script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    let currentTaskFilePath = null;

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
    document.getElementById('btnSelectTaskFile').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'selectTaskFile' });
    });
    document.getElementById('btnGenerateSamplePrd').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'generateSamplePrd' });
    });
    document.getElementById('btnRefreshQuota').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'refreshQuota' });
    });
    document.getElementById('btnInstallUpdate').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'installUpdate' });
    });
    document.getElementById('taskFileName').addEventListener('click', () => {
        if (currentTaskFilePath) {
            vscodeApi.postMessage({ command: 'openTaskFile', filePath: currentTaskFilePath });
        }
    });
    document.getElementById('inputMaxIter').addEventListener('change', (e) => {
        vscodeApi.postMessage({ command: 'setMaxIterations', value: parseInt(e.target.value, 10) || 50 });
    });
    document.getElementById('inputDelay').addEventListener('change', (e) => {
        vscodeApi.postMessage({ command: 'setIterationDelay', value: parseInt(e.target.value, 10) || 3000 });
    });

    document.getElementById('labelAllowPrdMod').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAllowPrdMod' });
    });
    document.getElementById('labelAutoStart').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoStart' });
    });
    document.getElementById('labelAutoCommit').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoCommit' });
    });
    document.getElementById('labelAutoDeleteBranch').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoDeleteBranch' });
    });
    document.getElementById('labelAutoInstall').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoInstall' });
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

        switch (s.ralphState) {
            case 'running':
                statusText.textContent = 'RUNNING';
                iterArea.style.display = 'block';
                progressArea.style.display = 'block';
                btnStart.style.display = 'none';
                btnStop.style.display = '';
                break;
            case 'stopping':
                statusText.textContent = 'STOPPING...';
                btnStart.style.display = 'none';
                btnStop.style.display = 'none';
                break;
            default:
                statusText.textContent = 'IDLE';
                iterArea.style.display = 'none';
                progressArea.style.display = s.progress && s.progress.total > 0 ? 'block' : 'none';
                btnStart.style.display = '';
                btnStop.style.display = 'none';
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
        const taskFileEl = document.getElementById('taskFileName');
        if (s.taskFile) {
            currentTaskFilePath = s.taskFile;
            const parts = s.taskFile.replace(/\\\\/g, '/').split('/');
            taskFileEl.textContent = parts[parts.length - 1];
            taskFileEl.classList.add('clickable');
            taskFileEl.title = s.taskFile;
        } else {
            currentTaskFilePath = null;
            taskFileEl.textContent = '선택되지 않음';
            taskFileEl.classList.remove('clickable');
            taskFileEl.title = '';
        }

        // Generate Sample PRD button visibility
        const btnPrd = document.getElementById('btnGenerateSamplePrd');
        btnPrd.style.display = (s.taskFile && s.taskFileExists) ? 'none' : '';

        // Settings
        document.getElementById('inputMaxIter').value = s.maxIterations;
        document.getElementById('inputDelay').value = s.iterationDelay;

        document.getElementById('chkAllowPrdMod').checked = s.allowPrdModification || false;
        document.getElementById('chkAutoStart').checked = s.autoStart || false;
        document.getElementById('chkAutoCommit').checked = !!s.autoCommit;
        document.getElementById('chkAutoDeleteBranch').checked = !!s.autoDeleteBranch;

        // Version
        if (s.version) {
            document.getElementById('versionText').textContent = 'v' + s.version;
        }

        // Update Banner
        const updateBanner = document.getElementById('updateBanner');
        const updateVersionText = document.getElementById('updateVersionText');
        if (s.updateInfo && s.updateInfo.available && s.updateInfo.version) {
            updateBanner.classList.add('visible');
            updateVersionText.textContent = 'v' + s.version + ' → v' + s.updateInfo.version;
        } else {
            updateBanner.classList.remove('visible');
        }

        // Auto Install checkbox
        document.getElementById('chkAutoInstall').checked = !!s.autoInstall;

        // Version Buttons (available updates)
        const versionBtnContainer = document.getElementById('versionButtons');
        const versions = (s.updateInfo && s.updateInfo.availableVersions) || [];
        if (versions.length > 0) {
            let vhtml = '';
            for (const v of versions) {
                vhtml += '<button class="version-btn" data-version="' + escapeHtml(v.version) + '"'
                    + ' data-asset="' + escapeHtml(v.assetName || '') + '"'
                    + ' data-tag="' + escapeHtml(v.tagName || '') + '"'
                    + '>⬆ v' + escapeHtml(v.version) + ' 업데이트</button>';
            }
            versionBtnContainer.innerHTML = vhtml;
            // Attach click handlers
            versionBtnContainer.querySelectorAll('.version-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    vscodeApi.postMessage({
                        command: 'installSpecificVersion',
                        version: btn.getAttribute('data-version'),
                        assetName: btn.getAttribute('data-asset'),
                        tagName: btn.getAttribute('data-tag')
                    });
                });
            });
        } else {
            versionBtnContainer.innerHTML = '';
        }

        // PRD Changes
        updatePrdChangesPanel(s.prdChanges || []);

        // Logs
        updateLogPanel(s.recentLogs || []);

        // Quota
        updateQuotaPanel(s.quota || { connected: false, models: [] });
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

    // ─── Quota Panel ──────────────────────────────────────
    let quotaCountdownTimer = null;
    let lastQuotaModels = [];

    function updateQuotaPanel(quota) {
        const statusEl = document.getElementById('quotaStatus');
        const listEl = document.getElementById('quotaList');

        if (!quota.connected) {
            statusEl.textContent = '⚠ 연결 안 됨 — language_server를 찾을 수 없습니다';
            listEl.innerHTML = '<div class="quota-empty">Antigravity가 실행 중인지 확인하세요</div>';
            return;
        }

        const models = quota.models || [];
        lastQuotaModels = models;

        // Count total individual models (expand groups)
        let totalCount = 0;
        for (const m of models) {
            totalCount += (m.isGroup && m.members) ? m.members.length : 1;
        }
        statusEl.textContent = '';

        if (models.length === 0) {
            listEl.innerHTML = '<div class="quota-empty">모델 정보 없음</div>';
            return;
        }

        let html = '';
        for (const m of models) {
            const pct = Math.round(m.remaining * 100);
            const level = pct > 40 ? 'ok' : pct > 20 ? 'caution' : pct > 5 ? 'warn' : pct > 0 ? 'critical' : 'empty';
            const colorVar = level === 'ok' ? 'success' : level === 'caution' ? 'warning' : 'danger';

            html += '<div class="quota-model">';
            html += '<div class="quota-model-header">';

            if (m.isGroup && m.members && m.members.length > 0) {
                // Group label with member count badge
                const memberTooltip = m.members.map(n => escapeHtml(n)).join('&#10;');
                html += '<span class="quota-model-name" title="' + memberTooltip + '">'
                    + escapeHtml(m.label)
                    + ' <span style="opacity:0.5;font-size:10px;">(' + m.members.length + ')</span>'
                    + '</span>';
            } else {
                html += '<span class="quota-model-name" title="' + escapeHtml(m.label) + '">' + escapeHtml(m.label) + '</span>';
            }

            html += '<span class="quota-pct" style="color:var(--' + colorVar + ')">' + pct + '%</span>';
            html += '</div>';
            html += '<div class="quota-bar"><div class="quota-bar-fill level-' + level + '" style="width:' + pct + '%"></div></div>';



            if (m.resetTime) {
                html += '<div class="quota-reset" data-reset="' + escapeHtml(m.resetTime) + '">⏱ 리셋: 계산 중...</div>';
            }
            html += '</div>';
        }
        listEl.innerHTML = html;

        // Start countdown updates
        updateResetCountdowns();
    }

    function updateResetCountdowns() {
        if (quotaCountdownTimer) clearInterval(quotaCountdownTimer);
        quotaCountdownTimer = setInterval(() => {
            const els = document.querySelectorAll('.quota-reset[data-reset]');
            if (els.length === 0) { clearInterval(quotaCountdownTimer); return; }
            const now = Date.now();
            els.forEach(el => {
                const resetStr = el.getAttribute('data-reset');
                const resetMs = new Date(resetStr).getTime();
                const diff = resetMs - now;
                if (diff <= 0) {
                    el.textContent = '⏱ 리셋 완료 (갱신 대기)';
                } else {
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    el.textContent = '⏱ 리셋까지 ' + h + '시간 ' + m + '분 ' + s + '초';
                }
            });
        }, 1000);
    }

    // Request initial state
    vscodeApi.postMessage({ command: 'ready' });
</script>
</body>
</html>`;
    }
}

module.exports = { RalphSidebarProvider };
