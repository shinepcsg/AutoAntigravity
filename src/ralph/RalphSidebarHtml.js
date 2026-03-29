const crypto = require('crypto');

function getSidebarHtml(webview) {
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
    .status-pill.quota_paused .dot { background: var(--warning); animation: pulse 1.8s infinite; }

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
        margin-bottom: 6px;
    }
    .quota-model-row1 {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        margin-bottom: 3px;
    }
    .quota-model-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
    }
    .quota-pct {
        font-weight: 600;
        font-size: 11px;
        flex-shrink: 0;
    }
    .quota-model-row2 {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .quota-bar {
        flex: 1;
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

    /* ─── Telegram Section ─── */
    .telegram-section .telegram-status {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 12px;
    }
    .telegram-section .telegram-status-text {
        opacity: 0.85;
    }
    .telegram-form {
        margin-top: 10px;
        padding: 10px;
        background: var(--input-bg);
        border-radius: 6px;
        border: 1px solid var(--border);
    }
    .telegram-form label {
        display: block;
        font-size: 11px;
        margin-bottom: 3px;
        opacity: 0.7;
    }
    .telegram-input {
        width: 100%;
        padding: 5px 8px;
        margin-bottom: 8px;
        background: var(--bg);
        color: var(--input-fg);
        border: 1px solid var(--input-border);
        border-radius: 4px;
        font-family: inherit;
        font-size: 12px;
    }
    .telegram-input:focus {
        outline: 1px solid var(--accent);
    }

    /* ─── Task Queue Section ─── */
    .task-queue-textarea {
        width: 100%;
        padding: 6px 8px;
        margin-bottom: 8px;
        background: var(--input-bg);
        color: var(--input-fg);
        border: 1px solid var(--input-border);
        border-radius: 4px;
        font-family: inherit;
        font-size: 12px;
        resize: vertical;
        line-height: 1.4;
    }
    .task-queue-textarea:focus {
        outline: 1px solid var(--accent);
    }
    .task-queue-list {
        margin-top: 10px;
    }
    .task-queue-item {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 6px 8px;
        margin-bottom: 4px;
        background: var(--input-bg);
        border-radius: 4px;
        font-size: 11px;
        line-height: 1.4;
    }
    .task-queue-item-text {
        flex: 1;
        word-break: break-word;
        white-space: pre-wrap;
    }
    .task-queue-item-index {
        flex-shrink: 0;
        font-weight: 600;
        opacity: 0.5;
        min-width: 18px;
    }
    .task-queue-delete-btn {
        flex-shrink: 0;
        background: none;
        border: none;
        color: var(--danger);
        cursor: pointer;
        font-size: 12px;
        padding: 0 2px;
        opacity: 0.6;
        transition: opacity 0.15s;
    }
    .task-queue-delete-btn:hover {
        opacity: 1;
    }
    .task-queue-empty {
        opacity: 0.4;
        text-align: center;
        padding: 8px;
        font-size: 11px;
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

    <!-- ═══ Task Queue Section ═══ -->
    <div class="section">
        <div class="section-title">📬 작업 큐</div>
        <textarea id="inputTaskQueue" class="task-queue-textarea" rows="3" placeholder="다음 작업 내용을 입력하세요..."></textarea>
        <button id="btnEnqueueTask" class="btn btn-primary">📥 작업 예약</button>
        <div id="taskQueueList" class="task-queue-list"></div>
    </div>

    <!-- ═══ Task File Section ═══ -->
    <div class="section">
        <div class="section-title">📋 작업 파일</div>
        <div style="display:flex; align-items:center; gap:4px; margin-bottom:6px;">
            <div id="taskFileName" class="task-file-name" style="flex:1; margin-bottom:0;">선택되지 않음</div>
            <button id="btnSelectTaskFile" class="btn btn-secondary" style="width:auto; flex-shrink:0; padding:4px 8px;">📂</button>
        </div>
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
    <div id="quotaSection" class="section">
        <div class="quota-header">
            <div class="section-title">🔋 AI 사용량</div>
            <button id="btnRefreshQuota" class="quota-refresh-btn" title="새로고침">🔄</button>
        </div>
        <div id="quotaStatus" class="quota-status">연결 중...</div>
        <div id="quotaList" class="quota-list">
            <div class="quota-empty">데이터 로딩 중...</div>
        </div>
    </div>

    <!-- ═══ Telegram Section ═══ -->
    <div class="section telegram-section">
        <button id="btnToggleTelegram" class="btn btn-toggle">
            📡 텔레그램 연결
        </button>
        <div id="telegramCredForm" class="telegram-form" style="display:none;">
            <label for="inputTelegramToken">Bot Token</label>
            <input id="inputTelegramToken" class="telegram-input" type="text" placeholder="123456:ABC-DEF..." />
            <label for="inputTelegramChatId">Chat ID</label>
            <input id="inputTelegramChatId" class="telegram-input" type="text" placeholder="-100xxxxxxxxxx" />
            <button id="btnSaveTelegramCred" class="btn btn-primary">💾 저장</button>
        </div>
        <label id="labelTelegramDetail" class="toggle-row" style="display:none;">
            <input id="chkTelegramDetail" type="checkbox" />
            📬 상세 알림 받기
        </label>
    </div>

    <!-- ═══ Settings Section ═══ -->
    <div class="section">
        <div class="section-title">⚙ 설정</div>
        <div class="form-row">
            <label>최대 반복 횟수</label>
            <input id="inputMaxIter" type="number" min="1" max="999" value="50" />
        </div>
        <div class="form-row">
            <label>작업간 반복 간격 (초)</label>
            <input id="inputDelay" type="number" min="0.5" max="120" step="0.5" value="1.5" />
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
        <label id="labelEnableCodeReview" class="toggle-row">
            <input id="chkEnableCodeReview" type="checkbox" />
            📝 코드 리뷰 (Gemini Flash)
        </label>

        <label id="labelAutoPush" class="toggle-row">
            <input id="chkAutoPush" type="checkbox" />
            🚀 자동 Push (세션 종료 시)
        </label>

        <div id="autoInstallRow" style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
            <label id="labelAutoInstall" class="toggle-row" style="flex:1; margin-bottom:0;">
                <input id="chkAutoInstall" type="checkbox" />
                ⬆ 자동 업데이트 설치
            </label>
            <button id="btnCheckForUpdates" class="btn btn-secondary" style="width:auto; flex-shrink:0; padding:4px 8px; font-size:11px;">🔍 업데이트 확인</button>
        </div>
        <div id="versionButtons" class="version-buttons"></div>
        <div id="noGitCredMsg" style="display:none; font-size:11px; opacity:0.7; padding:6px 8px; background:rgba(128,128,128,0.1); border-radius:4px; margin-top:6px;">⚠ Git 권한 없음 — 자동 업데이트가 비활성화되어 있습니다.</div>
        <button id="btnSetWritePrdWorkspace" class="btn btn-secondary">📋 write-prd (워크스페이스)</button>
        <button id="btnSetWritePrdGlobal" class="btn btn-secondary">📋 write-prd (글로벌)</button>
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
        vscodeApi.postMessage({ command: 'setIterationDelay', value: (parseInt(e.target.value, 10) || 3) * 1000 });
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
    document.getElementById('labelAutoPush').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoPush' });
    });
    document.getElementById('labelEnableCodeReview').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleEnableCodeReview' });
    });

    document.getElementById('labelAutoInstall').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoInstall' });
    });
    document.getElementById('btnCheckForUpdates').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'checkForUpdates' });
    });
    document.getElementById('btnToggleTelegram').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'toggleTelegram' });
    });
    document.getElementById('labelTelegramDetail').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleTelegramDetail' });
    });
    document.getElementById('btnSaveTelegramCred').addEventListener('click', () => {
        const botToken = document.getElementById('inputTelegramToken').value.trim();
        const chatId = document.getElementById('inputTelegramChatId').value.trim();
        vscodeApi.postMessage({ command: 'saveTelegramCred', botToken, chatId });
    });
    document.getElementById('btnSetWritePrdWorkspace').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'setWritePrdWorkspace' });
    });
    document.getElementById('btnSetWritePrdGlobal').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'setWritePrdGlobal' });
    });
    document.getElementById('btnEnqueueTask').addEventListener('click', () => {
        const text = document.getElementById('inputTaskQueue').value.trim();
        if (text) {
            vscodeApi.postMessage({ command: 'enqueueTask', text });
            document.getElementById('inputTaskQueue').value = '';
        }
    });
    document.getElementById('taskQueueList').addEventListener('click', (e) => {
        const btn = e.target.closest('.task-queue-delete-btn');
        if (btn && btn.dataset.index !== undefined) {
            vscodeApi.postMessage({ command: 'dequeueTask', index: parseInt(btn.dataset.index, 10) });
        }
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
                pill.style.display = '';
                statusText.textContent = 'RUNNING';
                iterArea.style.display = 'block';
                progressArea.style.display = 'block';
                btnStart.style.display = 'none';
                btnStop.style.display = '';
                break;
            case 'quota_paused':
                pill.style.display = '';
                statusText.textContent = 'QUOTA PAUSED';
                iterArea.style.display = 'block';
                progressArea.style.display = 'block';
                btnStart.style.display = 'none';
                btnStop.style.display = '';
                break;
            case 'stopping':
                pill.style.display = '';
                statusText.textContent = 'STOPPING...';
                progressArea.style.display = 'none';
                btnStart.style.display = 'none';
                btnStop.style.display = 'none';
                break;
            default:
                pill.style.display = 'none';
                statusText.textContent = 'IDLE';
                iterArea.style.display = 'none';
                progressArea.style.display = 'none';
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
        document.getElementById('inputDelay').value = s.iterationDelay / 1000;

        document.getElementById('chkAllowPrdMod').checked = s.allowPrdModification || false;
        document.getElementById('chkAutoStart').checked = s.autoStart || false;
        document.getElementById('chkAutoCommit').checked = !!s.autoCommit;
        document.getElementById('chkAutoDeleteBranch').checked = !!s.autoDeleteBranch;
        document.getElementById('chkAutoPush').checked = !!s.autoPush;
        document.getElementById('chkEnableCodeReview').checked = !!s.enableCodeReview;

        // Version
        if (s.version) {
            document.getElementById('versionText').textContent = 'v' + s.version;
        }

        // Updater Active — hide update UI if no Git credentials
        const updateBanner = document.getElementById('updateBanner');
        const updateVersionText = document.getElementById('updateVersionText');
        const versionBtnContainer = document.getElementById('versionButtons');
        const noGitCredMsg = document.getElementById('noGitCredMsg');
        const autoInstallRow = document.getElementById('autoInstallRow');

        if (!s.updaterActive) {
            // Git 권한 없음: 업데이트 관련 UI 숨기기
            updateBanner.classList.remove('visible');
            autoInstallRow.style.display = 'none';
            versionBtnContainer.style.display = 'none';
            noGitCredMsg.style.display = '';
        } else {
            // 업데이트 활성: UI 표시
            autoInstallRow.style.display = '';
            versionBtnContainer.style.display = '';
            noGitCredMsg.style.display = 'none';

            // Update Banner
            if (s.updateInfo && s.updateInfo.available && s.updateInfo.version) {
                updateBanner.classList.add('visible');
                updateVersionText.textContent = 'v' + s.version + ' → v' + s.updateInfo.version;
            } else {
                updateBanner.classList.remove('visible');
            }

            // Auto Install checkbox
            document.getElementById('chkAutoInstall').checked = !!s.autoInstall;

            // Version Buttons (available updates)
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
        }

        // ─── Telegram ───
        const tgBtn = document.getElementById('btnToggleTelegram');
        const tgCredForm = document.getElementById('telegramCredForm');

        if (s.telegramConnected) {
            tgBtn.classList.add('active');
            tgBtn.innerHTML = '📡 텔레그램 연결 해제';
            tgCredForm.style.display = 'none';
            document.getElementById('labelTelegramDetail').style.display = '';
            document.getElementById('chkTelegramDetail').checked = !!s.telegramDetailedNotification;
        } else {
            tgBtn.classList.remove('active');
            tgBtn.innerHTML = '📡 텔레그램 연결';
            tgCredForm.style.display = s.showTelegramCredForm ? '' : 'none';
            document.getElementById('labelTelegramDetail').style.display = 'none';
        }

        // write-prd 버튼 표시/숨김
        document.getElementById('btnSetWritePrdWorkspace').style.display = s.hasWritePrdWorkspace ? 'none' : '';
        document.getElementById('btnSetWritePrdGlobal').style.display = s.hasWritePrdGlobal ? 'none' : '';

        // ─── Task Queue ───
        const queueList = document.getElementById('taskQueueList');
        const queueArr = s.taskQueue || [];
        if (queueArr.length === 0) {
            queueList.innerHTML = '<div style="opacity:0.4;text-align:center;padding:8px;font-size:11px;">예약된 작업이 없습니다</div>';
        } else {
            let qhtml = '';
            for (let i = 0; i < queueArr.length; i++) {
                    const item = queueArr[i];
                    const itemText = typeof item === 'string' ? item : (item.text || '');
                    const mediaCount = (item.mediaPaths && item.mediaPaths.length) || 0;
                    const mediaTag = mediaCount > 0 ? ' <span style="opacity:0.6;" title="첨부 미디어 ' + mediaCount + '개">📎' + mediaCount + '</span>' : '';
                    qhtml += '<div style="display:flex;align-items:flex-start;gap:6px;padding:5px 6px;background:var(--input-bg);border-radius:3px;margin-bottom:4px;font-size:11px;">'
                    + '<span style="flex:1;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(itemText) + mediaTag + '</span>'
                    + '<button class="task-queue-delete-btn" data-index="' + i + '" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:13px;padding:0 2px;flex-shrink:0;" title="삭제">✕</button>'
                    + '</div>';
            }
            queueList.innerHTML = qhtml;
        }

        // ─── Task Queue Button Text (idle → 작업 시작, running → 작업 예약) ───
        const btnEnqueue = document.getElementById('btnEnqueueTask');
        if (s.ralphState === 'idle') {
            btnEnqueue.innerHTML = '🚀 작업 시작';
        } else {
            btnEnqueue.innerHTML = '📥 작업 예약';
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
        const sectionEl = document.getElementById('quotaSection');
        const statusEl = document.getElementById('quotaStatus');
        const listEl = document.getElementById('quotaList');

        if (!quota.connected) {
            sectionEl.style.display = 'none';
            return;
        }

        const allModels = quota.models || [];
        // 현재 사용 중인 모델만 필터 (remaining < 1.0 = 쿼타가 소비된 모델)
        const models = allModels.filter(m => m.remaining < 1.0);

        if (allModels.length === 0) {
            sectionEl.style.display = 'none';
            return;
        }

        sectionEl.style.display = '';
        lastQuotaModels = allModels;

        if (models.length === 0) {
            statusEl.textContent = '';
            listEl.innerHTML = '<div class="quota-empty">사용 중인 모델 없음</div>';
            return;
        }

        statusEl.textContent = '';

        let html = '';
        for (const m of models) {
            const pct = Math.round(m.remaining * 100);
            const level = pct > 40 ? 'ok' : pct > 20 ? 'caution' : pct > 5 ? 'warn' : pct > 0 ? 'critical' : 'empty';
            const colorVar = level === 'ok' ? 'success' : level === 'caution' ? 'warning' : 'danger';

            html += '<div class="quota-model">';
            // Row 1: 모델명 + 퍼센트
            html += '<div class="quota-model-row1">';
            if (m.isGroup && m.members && m.members.length > 0) {
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
            // Row 2: 프로그레스바
            html += '<div class="quota-model-row2">';
            html += '<div class="quota-bar"><div class="quota-bar-fill level-' + level + '" style="width:' + pct + '%"></div></div>';
            html += '</div>';

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
                    el.textContent = '⏱ 리셋까지 ' + h + '시간 ' + m + '분';
                }
            });
        }, 60000);
    }

    // Request initial state
    vscodeApi.postMessage({ command: 'ready' });
</script>
</body>
</html>`;
    }
module.exports = { getSidebarHtml };
