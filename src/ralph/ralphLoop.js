// AutoAntigravity — Ralph Loop Main Logic
// Iterative AI agent execution with persistent memory
// Uses CDP (Chrome DevTools Protocol) to inject prompts into Antigravity chat

const vscode = require('vscode');
const http = require('http');
const path = require('path');
const { TaskFileManager } = require('./TaskFileManager');
const { ProgressTracker } = require('./ProgressTracker');
const { GitManager } = require('./GitManager');
const { AgentSessionLock } = require('./AgentSessionLock');
const { ParallelTaskRunner } = require('./ParallelTaskRunner');

/**
 * Ralph Loop states
 */
const LoopState = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    STOPPING: 'stopping'
};

class RalphLoopManager {
    /**
     * @param {Function} log - Logging function
     */
    constructor(log) {
        this.log = log;
        this.taskManager = new TaskFileManager(log);
        this.progressTracker = new ProgressTracker(log);
        this.gitManager = new GitManager(log);
        this._sessionLock = new AgentSessionLock(log);
        this._parallelRunner = null; // initialized lazily

        this.state = LoopState.IDLE;
        this.currentIteration = 0;
        this.loopTimer = null;
        this.onStateChange = null; // callback for UI updates
        this.onLogCallback = null; // callback for log forwarding (e.g. Telegram)
        this.onTaskCompleteCallback = null; // callback for individual task completion (e.g. Telegram)
        this.onAllTasksCompleteCallback = null; // callback for all tasks completion (e.g. Telegram)

        // 로그 버퍼 — 사이드바에 표시
        this._logBuffer = [];
        this._maxLogLines = 100;

        // 에러 추적
        this.lastError = null;
        this.consecutiveErrors = 0;

        // PRD 변경 추적
        this._prdChanges = [];  // { iteration, added, removed, modified, timestamp }
        this._maxPrdChanges = 50;

        // CDP 관련
        this._connectionManager = null; // shared from AutoAccept
        this._lastAgentTargetWsUrl = null; // 마지막으로 프롬프트를 보낸 타겟의 WS URL

        // ExtensionContext — workspaceState 영속 저장용 (워크스페이스별)
        this._context = null;

        // Auto Start — FileSystemWatcher
        this._autoStartWatcher = null;
        this._autoStartDebounceTimer = null;

        // 작업 큐 — 실행 중 새 작업 요청을 순차 대기
        this._pendingTaskQueue = [];

        // 큐 작업에 의한 강제 autoStart 플래그
        this._forceNextAutoStart = false;
    }

    /**
     * Set shared ConnectionManager from AutoAccept
     * @param {Object} connectionManager
     */
    setConnectionManager(connectionManager) {
        this._connectionManager = connectionManager;
    }

    /**
     * Get current loop state
     * @returns {string}
     */
    getState() {
        return this.state;
    }

    /**
     * Get recent log lines for sidebar display
     * @param {number} [count=20] - Number of lines to return
     * @returns {Array<{time: string, msg: string, level: string}>}
     */
    getRecentLogs(count = 20) {
        return this._logBuffer.slice(-count);
    }

    /**
     * Add a log entry to the internal buffer and output channel
     * @param {string} msg - Message
     * @param {'info'|'warn'|'error'} [level='info']
     */
    _addLog(msg, level = 'info') {
        const time = new Date().toLocaleTimeString();
        this._logBuffer.push({ time, msg, level });
        if (this._logBuffer.length > this._maxLogLines) {
            this._logBuffer.shift();
        }
        this.log(msg);
        // 텔레그램 등 외부 로그 수신자에게 알림
        if (this.onLogCallback) {
            try { this.onLogCallback({ time, msg, level }); } catch (e) { /* ignore */ }
        }
        this._notifyStateChange();
    }

    /**
     * Set the ExtensionContext for workspaceState persistence
     * @param {vscode.ExtensionContext} context
     */
    setContext(context) {
        this._context = context;
    }

    /**
     * Restore task file from workspaceState (call on activation)
     */
    restoreTaskFile() {
        if (!this._context) return;
        const savedPath = this._context.workspaceState.get('autoAntigravity.lastTaskFilePath');
        if (savedPath) {
            const fs = require('fs');
            if (fs.existsSync(savedPath)) {
                this.taskManager.setTaskFile(savedPath);
                this.log(`[Ralph] Restored task file: ${savedPath}`);
            } else {
                this.log(`[Ralph] Saved task file no longer exists: ${savedPath}`);
            }
        }
    }

    /**
     * Select task file via file picker
     */
    async selectTaskFile() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open. Open a folder first.');
            return;
        }

        const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFiles: true,
            canSelectFolders: false,
            defaultUri: workspaceFolders[0].uri,
            filters: {
                'Task Files': ['md', 'txt'],
                'All Files': ['*']
            },
            title: 'Select Ralph Loop Task File'
        });

        if (files && files.length > 0) {
            const filePath = files[0].fsPath;
            this.taskManager.setTaskFile(filePath);

            // workspaceState에 경로 영속 저장 (워크스페이스별)
            if (this._context) {
                this._context.workspaceState.update('autoAntigravity.lastTaskFilePath', filePath);
            }

            const progress = this.taskManager.getProgress();
            const msg = `📋 Task file loaded: ${progress.total} tasks (${progress.completed} done, ${progress.remaining} remaining)`;
            vscode.window.showInformationMessage(msg);
            this._addLog(`[Ralph] ${msg}`);
        }
    }

    /**
     * Start the Ralph Loop
     */
    async start() {
        if (this.state === LoopState.RUNNING) {
            vscode.window.showWarningMessage('Ralph Loop is already running.');
            return;
        }

        // Ensure workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open.');
            this._addLog('[Ralph] ❌ 워크스페이스 폴더가 열려있지 않습니다.', 'error');
            return;
        }

        // Auto-resolve task file if not selected
        if (!this.taskManager.getTaskFile()) {
            const resolved = this.taskManager.resolveFromWorkspace();
            if (!resolved) {
                const action = await vscode.window.showErrorMessage(
                    'No task file selected or found. Please select a task file.',
                    'Select File'
                );
                if (action === 'Select File') {
                    await this.selectTaskFile();
                }
                if (!this.taskManager.getTaskFile()) {
                    this._addLog('[Ralph] ❌ 작업 파일이 선택되지 않았습니다.', 'error');
                    return;
                }
            }
        }

        // Check if there are tasks to do
        if (this.taskManager.allTasksCompleted()) {
            vscode.window.showInformationMessage('🎉 All tasks are already completed!');
            this._addLog('[Ralph] ✅ 모든 작업이 이미 완료되었습니다!');
            return;
        }

        // Verify CDP connectivity before starting
        const cdpPort = this._getCdpPort();
        const cdpOk = await this._pingPort(cdpPort);
        if (!cdpOk) {
            const msg = `CDP 포트 ${cdpPort}에 연결할 수 없습니다. Antigravity를 --remote-debugging-port=${cdpPort} 옵션과 함께 시작해야 합니다.`;
            this._addLog(`[Ralph] ❌ ${msg}`, 'error');
            vscode.window.showErrorMessage(`Ralph Loop: ${msg}`);
            return;
        }

        // ── Stale 락 파일 자동 정리 ──
        const lockClean = this._sessionLock.forceClean();
        if (lockClean.cleaned) {
            this._addLog(`[Ralph] 🧹 이전 세션 잔존 락 파일 정리: ${lockClean.reason}`, 'warn');
        }

        // ── 첫 번째 작업부터 시작하는 경우 progress.txt 초기화 ──
        const allTasks = this.taskManager.parseTasks();
        const isStartingFromFirst = allTasks.length > 0 && !allTasks[0].completed;
        if (isStartingFromFirst) {
            this.progressTracker.resetProgressFile();
        }

        this.state = LoopState.RUNNING;
        this.consecutiveErrors = 0;
        this.lastError = null;
        this.progressTracker.initializeProgressFile();
        this.currentIteration = this.progressTracker.getLastIteration();

        // ── Git Session Init (per-task branching) ──
        const autoCommit = vscode.workspace.getConfiguration('autoAntigravity')
            .get('ralphLoop.autoCommit', true);
        if (autoCommit) {
            // 이미 활성 세션이 있으면 건너뜀 (텔레그램/큐에서 미리 생성된 경우)
            const existingSession = this.gitManager.getSessionInfo();
            if (existingSession.active) {
                this._addLog(`[Ralph] 📌 기존 세션 사용: ${existingSession.sessionBranch || existingSession.originalBranch}`);
            } else {
                const wsRoot = workspaceFolders[0].uri.fsPath;

                // ── 작업 파일 기반 세션 라벨 추출 ──
                let sessionLabel = '';
                try {
                    const fs = require('fs');
                    const taskFilePath = this.taskManager.getTaskFile();
                    if (taskFilePath && fs.existsSync(taskFilePath)) {
                        const content = fs.readFileSync(taskFilePath, 'utf-8');
                        const lines = content.split('\n');

                        // 1) 첫 번째 # 제목 헤더 추출
                        for (const line of lines) {
                            const headerMatch = line.trim().match(/^#\s+(.+)$/);
                            if (headerMatch) {
                                sessionLabel = headerMatch[1].trim();
                                break;
                            }
                        }

                        // 2) # 제목이 없으면 첫 번째 미완료 작업 텍스트 사용
                        if (!sessionLabel) {
                            for (const line of lines) {
                                const taskMatch = line.trim().match(/^[-*]\s*\[\s*\]\s+(.+)$/);
                                if (taskMatch) {
                                    sessionLabel = taskMatch[1].trim();
                                    break;
                                }
                            }
                        }

                        if (sessionLabel) {
                            this._addLog(`[Ralph] 🏷 세션 라벨 추출: "${sessionLabel}"`);
                        }
                    }
                } catch (e) {
                    this._addLog(`[Ralph] ⚠ 세션 라벨 추출 실패: ${e.message}`, 'warn');
                }

                const gitResult = this.gitManager.initSession(wsRoot, sessionLabel);
                if (gitResult.success) {
                    this._addLog(`[Ralph] 📌 Git 원본 브랜치: ${gitResult.originalBranch}`);
                    if (gitResult.sessionBranch) {
                        this._addLog(`[Ralph] 🌿 Git 세션 브랜치: ${gitResult.sessionBranch} (작업별 브랜치 → 세션 → 원본 모드)`);
                    }
                } else {
                    this._addLog(`[Ralph] ⚠ Git 브랜치 관리 비활성 — ${gitResult.error || '알 수 없는 오류'}`, 'warn');
                }
            }
        }

        const progress = this.taskManager.getProgress();
        const startMsg = `🔄 Ralph Loop started — ${progress.remaining} tasks remaining`;
        this._addLog(`[Ralph] ${startMsg}`);
        vscode.window.showInformationMessage(startMsg);

        this._notifyStateChange();
        this._runNextIteration();
    }

    /**
     * Stop the Ralph Loop gracefully
     */
    stop() {
        if (this.state === LoopState.IDLE) return;

        this._sessionLock.release();
        this.state = LoopState.STOPPING;
        this._addLog('[Ralph] ⏹ 루프 정지 요청 — 현재 반복 마무리 중...');
        this._notifyStateChange();

        if (this.loopTimer) {
            clearTimeout(this.loopTimer);
            this.loopTimer = null;
        }

        // ── 대기 큐 클리어 ──
        this._pendingTaskQueue = [];

        // ── Git: End session & merge ──
        this._endGitSession();

        this.state = LoopState.IDLE;
        vscode.window.showInformationMessage('⏹ Ralph Loop stopped.');
        this._addLog('[Ralph] ⏹ 루프가 정지되었습니다.');
        this._notifyStateChange();
    }


    /**
     * Dispose / cleanup
     */
    dispose() {
        this.disableAutoStart();
        this.stop();
    }

    // ─── Auto Start (FileSystemWatcher) ───────────────────────────────

    /**
     * Enable auto-start: watch for task file changes and auto-start Ralph Loop
     * PRD.md가 변경/생성되면 미완료 작업이 있을 때 자동으로 Ralph Loop 시작
     */
    enableAutoStart() {
        this.disableAutoStart(); // 기존 watcher 정리

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this._addLog('[Ralph] ⚠ autoStart: 워크스페이스 없음 — 감시 불가', 'warn');
            return;
        }

        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const taskFileName = config.get('ralphLoop.taskFile', 'PRD.md');
        const wsRoot = workspaceFolders[0].uri.fsPath;

        // FileSystemWatcher: 워크스페이스 루트의 작업 파일만 감시
        const pattern = new vscode.RelativePattern(wsRoot, taskFileName);
        this._autoStartWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        const handleFileChange = (uri) => {
            // Debounce: 연속 저장 시 2초 대기 후 한 번만 실행
            if (this._autoStartDebounceTimer) {
                clearTimeout(this._autoStartDebounceTimer);
            }
            this._autoStartDebounceTimer = setTimeout(() => {
                this._onTaskFileChanged(uri);
            }, 2000);
        };

        this._autoStartWatcher.onDidChange(handleFileChange);
        this._autoStartWatcher.onDidCreate(handleFileChange);

        this._addLog(`[Ralph] 👁 autoStart 활성화 — ${taskFileName} 감시 시작`);
    }

    /**
     * Enable auto-start once: identical to enableAutoStart but sets _forceNextAutoStart flag.
     * After the forced start, if autoStart config is false, the watcher is automatically disabled.
     */
    enableAutoStartOnce() {
        this._forceNextAutoStart = true;
        // watcher가 이미 있으면 재설정 불필요
        if (this._autoStartWatcher) {
            this._addLog('[Ralph] 👁 enableAutoStartOnce: 기존 watcher 활용, _forceNextAutoStart 설정');
            return;
        }
        // watcher가 없으면 새로 생성
        this.enableAutoStart();
        this._addLog('[Ralph] 👁 enableAutoStartOnce: 일회성 watcher 생성 완료');
    }

    /**
     * Disable auto-start: stop watching for file changes
     */
    disableAutoStart() {
        if (this._autoStartDebounceTimer) {
            clearTimeout(this._autoStartDebounceTimer);
            this._autoStartDebounceTimer = null;
        }
        if (this._autoStartWatcher) {
            this._autoStartWatcher.dispose();
            this._autoStartWatcher = null;
            this._addLog('[Ralph] 👁 autoStart 비활성화 — 감시 중지');
        }
    }

    /**
     * Handle task file change event — auto-start Ralph Loop if conditions met
     * @param {vscode.Uri} uri - Changed file URI
     */
    async _onTaskFileChanged(uri) {
        const filePath = uri.fsPath;
        this._addLog(`[Ralph] 📄 작업 파일 변경 감지: ${path.basename(filePath)}`);

        // _forceNextAutoStart 플래그 확인 및 소비
        const forced = this._forceNextAutoStart;
        if (forced) {
            this._forceNextAutoStart = false;
            this._addLog('[Ralph] 🔓 _forceNextAutoStart 플래그 활성 — autoStart 설정 무시하고 시작');
        }

        // 이미 실행 중이면 큐에 추가 (단, 현재 작업 파일과 동일한 파일은 무시)
        if (this.state === LoopState.RUNNING) {
            // 현재 작업 중인 파일과 동일한 파일의 변경은 무시
            // (markTaskComplete 등 자체 수정에 의한 변경 재감지 방지)
            const currentTaskFile = this.taskManager.getTaskFile();
            if (currentTaskFile && path.resolve(filePath) === path.resolve(currentTaskFile)) {
                this._addLog(`[Ralph] 📄 현재 작업 파일 자체 변경 무시 (실행 중): ${path.basename(filePath)}`);
                return;
            }
            this._enqueueTaskRequest(filePath);
            // forced였지만 이미 실행 중이므로 일회성 watcher 정리
            if (forced) {
                const autoStartEnabled = vscode.workspace.getConfiguration('autoAntigravity')
                    .get('ralphLoop.autoStart', false);
                if (!autoStartEnabled) {
                    this.disableAutoStart();
                }
            }
            return;
        }

        // 작업 파일 세팅
        this.taskManager.setTaskFile(filePath);

        // workspaceState에 경로 영속 저장
        if (this._context) {
            this._context.workspaceState.update('autoAntigravity.lastTaskFilePath', filePath);
        }

        // 미완료 작업이 있는지 확인
        if (this.taskManager.allTasksCompleted()) {
            this._addLog('[Ralph] ✅ 모든 작업이 이미 완료 — autoStart 건너뜀');
            // forced였으면 일회성 watcher 정리
            if (forced) {
                const autoStartEnabled = vscode.workspace.getConfiguration('autoAntigravity')
                    .get('ralphLoop.autoStart', false);
                if (!autoStartEnabled) {
                    this.disableAutoStart();
                }
            }
            return;
        }

        const progress = this.taskManager.getProgress();
        this._addLog(`[Ralph] 🚀 autoStart: ${progress.remaining}개 미완료 작업 감지 — Ralph Loop 자동 시작!`);
        vscode.window.showInformationMessage(
            `🚀 AutoAntigravity: PRD 변경 감지 — ${progress.remaining}개 작업으로 Ralph Loop 자동 시작`
        );

        // forced + autoStart 설정 false이면 일회성 watcher 정리 (start() 전에 정리하여 원복)
        if (forced) {
            const autoStartEnabled = vscode.workspace.getConfiguration('autoAntigravity')
                .get('ralphLoop.autoStart', false);
            if (!autoStartEnabled) {
                this.disableAutoStart();
            }
        }

        // Ralph Loop 시작
        await this.start();
    }

    /**
     * Enqueue a task request for sequential processing after the current task completes.
     * Prevents duplicate entries for the same file path.
     * @param {string} filePath - Absolute path to the task file
     */
    _enqueueTaskRequest(filePath) {
        // 동일 경로 중복 방지
        const alreadyQueued = this._pendingTaskQueue.some(
            (queuedPath) => queuedPath === filePath
        );

        if (alreadyQueued) {
            this._addLog(`[Ralph] 📋 큐 중복 무시 — 이미 대기 중: ${path.basename(filePath)}`);
            return;
        }

        this._pendingTaskQueue.push(filePath);
        this._addLog(`[Ralph] 📋 작업 큐에 추가 (${this._pendingTaskQueue.length}개 대기): ${path.basename(filePath)}`);
    }

    /**
     * Process the next queued task request.
     * Dequeues one task from _pendingTaskQueue, sets up the task file, and calls start().
     * Called after the current task completes to chain queued work.
     * @returns {boolean} true if a queued task was started, false if queue was empty
     */
    async _processNextQueuedTask() {
        if (this._pendingTaskQueue.length === 0) {
            this._addLog('[Ralph] 📋 대기 큐 비어 있음 — 추가 작업 없음');
            return false;
        }

        const filePath = this._pendingTaskQueue.shift();
        this._addLog(`[Ralph] 📋 큐에서 다음 작업 꺼냄 (남은 대기: ${this._pendingTaskQueue.length}): ${path.basename(filePath)}`);

        // 작업 파일 세팅
        this.taskManager.setTaskFile(filePath);

        // workspaceState에 경로 영속 저장
        if (this._context) {
            this._context.workspaceState.update('autoAntigravity.lastTaskFilePath', filePath);
        }

        // 미완료 작업이 있는지 확인
        if (this.taskManager.allTasksCompleted()) {
            this._addLog(`[Ralph] ✅ 큐 작업 파일의 모든 작업이 이미 완료: ${path.basename(filePath)}`);
            // 아직 큐에 남은 항목이 있으면 재귀적으로 다음 처리
            return this._processNextQueuedTask();
        }

        const progress = this.taskManager.getProgress();
        this._addLog(`[Ralph] 🚀 큐 작업 시작: ${progress.remaining}개 미완료 작업 — ${path.basename(filePath)}`);

        // 현재 상태를 IDLE로 전환하여 start()가 정상 동작하도록 함
        this.state = LoopState.IDLE;
        await this.start();
        return true;
    }

    /**
     * Get the list of queued task requests for sidebar display.
     * Returns a shallow copy to prevent external mutation.
     * @returns {Array<{filePath: string, fileName: string}>} Queued task entries
     */
    getQueuedTasks() {
        return this._pendingTaskQueue.map((filePath) => ({
            filePath,
            fileName: path.basename(filePath)
        }));
    }

    // ─── CDP Helpers ──────────────────────────────────────────────────

    /**
     * Get configured CDP port
     */
    _getCdpPort() {
        return vscode.workspace.getConfiguration('autoAntigravity').get('autoAccept.cdpPort', 9333);
    }

    /**
     * Ping a port to check if CDP is running
     */
    _pingPort(port) {
        return new Promise((resolve) => {
            const req = http.get({ hostname: '127.0.0.1', port, path: '/json/version', timeout: 800 }, (res) => {
                res.on('data', () => { });
                res.on('end', () => resolve(true));
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
        });
    }

    /**
     * Get list of CDP targets (pages)
     */
    _getTargets(port) {
        return new Promise((resolve, reject) => {
            const req = http.get({ hostname: '127.0.0.1', port, path: '/json', timeout: 3000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
    }

    /**
     * Send a CDP command to a target via WebSocket (one-shot connection)
     * General-purpose: supports any CDP method (Runtime.evaluate, Input.insertText, etc.)
     * @param {string} targetWsUrl - WebSocket debugger URL
     * @param {string} method - CDP method name (e.g. 'Runtime.evaluate', 'Input.insertText')
     * @param {object} params - CDP method parameters
     * @param {number} timeout - Timeout in ms
     */
    async _cdpSendCommand(targetWsUrl, method, params, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const net = require('net');
            const crypto = require('crypto');
            const parsed = new URL(targetWsUrl);
            const port = parsed.port || 80;
            const key = crypto.randomBytes(16).toString('base64');

            const socket = net.createConnection({ host: parsed.hostname, port }, () => {
                const path = parsed.pathname + parsed.search;
                const req = [
                    `GET ${path} HTTP/1.1`,
                    `Host: ${parsed.hostname}:${port}`,
                    `Upgrade: websocket`,
                    `Connection: Upgrade`,
                    `Sec-WebSocket-Key: ${key}`,
                    `Sec-WebSocket-Version: 13`,
                    '', ''
                ].join('\r\n');
                socket.write(req);
            });

            let upgraded = false;
            let buffer = Buffer.alloc(0);
            let msgId = 1;
            const timer = setTimeout(() => {
                try { socket.destroy(); } catch (e) { }
                reject(new Error(`CDP ${method} timeout`));
            }, timeout);

            const sendWsFrame = (data) => {
                const crypto2 = require('crypto');
                const payload = Buffer.from(data, 'utf-8');
                const maskKey = crypto2.randomBytes(4);
                let header;
                if (payload.length < 126) {
                    header = Buffer.alloc(2);
                    header[0] = 0x81;
                    header[1] = 0x80 | payload.length;
                } else if (payload.length < 65536) {
                    header = Buffer.alloc(4);
                    header[0] = 0x81;
                    header[1] = 0x80 | 126;
                    header.writeUInt16BE(payload.length, 2);
                } else {
                    header = Buffer.alloc(10);
                    header[0] = 0x81;
                    header[1] = 0x80 | 127;
                    header.writeBigUInt64BE(BigInt(payload.length), 2);
                }
                const masked = Buffer.alloc(payload.length);
                for (let i = 0; i < payload.length; i++) {
                    masked[i] = payload[i] ^ maskKey[i & 3];
                }
                socket.write(Buffer.concat([header, maskKey, masked]));
            };

            socket.on('data', (data) => {
                buffer = Buffer.concat([buffer, data]);

                if (!upgraded) {
                    const headerEnd = buffer.indexOf('\r\n\r\n');
                    if (headerEnd === -1) return;
                    const header = buffer.slice(0, headerEnd).toString();
                    if (!header.includes('101')) {
                        clearTimeout(timer);
                        socket.destroy();
                        reject(new Error('WebSocket upgrade failed'));
                        return;
                    }
                    upgraded = true;
                    buffer = buffer.slice(headerEnd + 4);

                    // Send the CDP command
                    const cmd = JSON.stringify({ id: msgId, method, params });
                    sendWsFrame(cmd);

                    if (buffer.length > 0) {
                        tryParseResponse();
                    }
                    return;
                }

                tryParseResponse();
            });

            function tryParseResponse() {
                while (buffer.length >= 2) {
                    const secondByte = buffer[1];
                    const isMasked = (secondByte & 0x80) !== 0;
                    let payloadLen = secondByte & 0x7f;
                    let offset = 2;

                    if (payloadLen === 126) {
                        if (buffer.length < 4) return;
                        payloadLen = buffer.readUInt16BE(2);
                        offset = 4;
                    } else if (payloadLen === 127) {
                        if (buffer.length < 10) return;
                        payloadLen = Number(buffer.readBigUInt64BE(2));
                        offset = 10;
                    }

                    if (isMasked) offset += 4;
                    if (buffer.length < offset + payloadLen) return;

                    let payload = buffer.slice(offset, offset + payloadLen);
                    if (isMasked) {
                        const mask = buffer.slice(offset - 4, offset);
                        for (let i = 0; i < payload.length; i++) {
                            payload[i] ^= mask[i & 3];
                        }
                    }
                    buffer = buffer.slice(offset + payloadLen);

                    try {
                        const msg = JSON.parse(payload.toString());
                        if (msg.id === msgId) {
                            clearTimeout(timer);
                            try { socket.destroy(); } catch (e) { }
                            if (msg.error) {
                                reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                            } else {
                                resolve(msg.result);
                            }
                            return;
                        }
                    } catch (e) { /* ignore non-JSON frames */ }
                }
            }

            socket.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });

            socket.on('close', () => {
                clearTimeout(timer);
                reject(new Error('Connection closed before response'));
            });
        });
    }

    /**
     * Shorthand: evaluate JS expression on a CDP target
     */
    async _cdpEvaluateOnTarget(targetWsUrl, expression, timeout = 10000) {
        return this._cdpSendCommand(targetWsUrl, 'Runtime.evaluate', {
            expression,
            returnByValue: true
        }, timeout);
    }

    /**
     * Find the main CDP target matching the current workspace
     * @param {boolean} [verbose=false] - Log detailed target information
     * @returns {Promise<Object>} CDP target object with webSocketDebuggerUrl
     */
    async _findMainTarget(verbose = false) {
        const cdpPort = this._getCdpPort();
        let targets;
        try {
            targets = await this._getTargets(cdpPort);
        } catch (e) {
            throw new Error('CDP 타겟 조회 실패 (port ' + cdpPort + '): ' + e.message);
        }

        const workspaceName = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
            ? vscode.workspace.workspaceFolders[0].name : '';

        if (verbose) {
            this._addLog('[Ralph] 워크스페이스: "' + workspaceName + '", CDP 타겟 수: ' + targets.length);
        }

        const pageTargets = targets.filter(function (t) { return t.type === 'page'; });
        if (verbose) {
            for (const t of pageTargets) {
                this._addLog('[Ralph]   타겟: ' + (t.title || 'no-title').substring(0, 70));
            }
        }

        let mainTarget = null;
        if (workspaceName) {
            mainTarget = pageTargets.find(function (t) {
                return t.url && t.url.includes('workbench.html') &&
                    !t.url.includes('jetski-agent') &&
                    t.title && t.title.includes(workspaceName);
            });
        }

        if (!mainTarget) {
            mainTarget = pageTargets.find(function (t) {
                return t.url && t.url.includes('workbench.html') &&
                    !t.url.includes('jetski-agent');
            });
            if (mainTarget && verbose) {
                this._addLog('[Ralph] ⚠ 워크스페이스 매칭 실패 — 첫 번째 workbench 타겟 사용', 'warn');
            }
        }

        if (!mainTarget) {
            mainTarget = pageTargets.find(function (t) { return t.webSocketDebuggerUrl; });
        }

        if (!mainTarget || !mainTarget.webSocketDebuggerUrl) {
            throw new Error('CDP 타겟 없음 (' + targets.length + '개 중 page 없음)');
        }

        if (verbose) {
            this._addLog('[Ralph] ✅ 선택된 타겟: ' + (mainTarget.title || '').substring(0, 60));
        }

        return mainTarget;
    }

    /**
     * Find workbench CDP targets matching the CURRENT workspace only
     * 현재 워크스페이스에 해당하는 Antigravity 윈도우만 반환
     * @returns {Promise<Object[]>} Array of CDP target objects
     */
    async _findAllWorkbenchTargets() {
        const cdpPort = this._getCdpPort();
        let targets;
        try {
            targets = await this._getTargets(cdpPort);
        } catch (e) {
            return [];
        }

        const workspaceName = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
            ? vscode.workspace.workspaceFolders[0].name : '';

        let filtered = targets.filter(function (t) {
            return t.type === 'page' &&
                t.url && t.url.includes('workbench.html') &&
                !t.url.includes('jetski-agent') &&
                t.webSocketDebuggerUrl;
        });

        // 현재 워크스페이스 이름이 있으면 해당 타겟만 필터링
        if (workspaceName) {
            const wsFiltered = filtered.filter(function (t) {
                return t.title && t.title.includes(workspaceName);
            });
            if (wsFiltered.length > 0) {
                filtered = wsFiltered;
            }
        }

        return filtered;
    }

    /**
     * Check if the Antigravity agent is currently busy via CDP DOM inspection
     * Send button approach: when Send button is disabled, agent is busy; when enabled, agent is done
     * @param {string} targetWsUrl - WebSocket debugger URL
     * @param {boolean} [diagnostic=false] - If true, log all visible buttons for debugging
     * @returns {Promise<{busy: boolean, reason?: string, detail?: string}>}
     */
    async _isAgentBusy(targetWsUrl, diagnostic = false) {
        try {
            const expr = diagnostic
                ? [
                    '(function() {',
                    '  var btns = document.querySelectorAll("button");',
                    '  var all = [];',
                    '  for (var i = 0; i < btns.length; i++) {',
                    '    var b = btns[i];',
                    '    var rect = b.getBoundingClientRect();',
                    '    if (rect.width === 0 || rect.height === 0) continue;',
                    '    var label = b.getAttribute("aria-label") || "";',
                    '    var title = b.getAttribute("title") || "";',
                    '    var text = (b.textContent || "").trim().substring(0, 20);',
                    '    var cls = (b.className || "").substring(0, 40);',
                    '    var info = label || title || text || cls || "(empty)";',
                    '    if (!label && !title && !text && b.querySelector("svg")) {',
                    '      var svg = b.querySelector("svg");',
                    '      var pc = svg.querySelectorAll("path").length;',
                    '      var rc = svg.querySelectorAll("rect").length;',
                    '      var sz = Math.round(rect.width) + "x" + Math.round(rect.height);',
                    '      info += " [SVG:p=" + pc + ",r=" + rc + ",sz=" + sz + "," + (b.innerHTML || "").replace(/\\s+/g," ").substring(0,60) + "]";',
                    '    }',
                    '    all.push(info);',
                    '  }',
                    '  // 채팅 입력창 상태 진단',
                    '  var inputInfo = {};',
                    '  var chatInput = document.querySelector(".cursor-text[contenteditable]");',
                    '  if (chatInput) {',
                    '    var ir = chatInput.getBoundingClientRect();',
                    '    inputInfo.found = true;',
                    '    inputInfo.visible = ir.width > 0 && ir.height > 0;',
                    '    inputInfo.disabled = chatInput.getAttribute("aria-disabled") === "true";',
                    '    inputInfo.readonly = chatInput.getAttribute("aria-readonly") === "true" || chatInput.getAttribute("contenteditable") === "false";',
                    '    inputInfo.hasContent = (chatInput.textContent || "").trim().length > 0;',
                    '    inputInfo.cls = (chatInput.className || "").substring(0, 60);',
                    '  } else {',
                    '    inputInfo.found = false;',
                    '    // contenteditable 요소 전체 탐색',
                    '    var ces = document.querySelectorAll("[contenteditable]");',
                    '    inputInfo.totalContentEditable = ces.length;',
                    '  }',
                    '  return JSON.stringify({ buttons: all, inputState: inputInfo });',
                    '})()',
                ].join('\n')
                : [
                    '(function() {',
                    '  var bodyText = document.body.innerText || "";',
                    '',
                    '  // ── 0. Quota 감지 (최우선) ──',
                    '  if (bodyText.includes("Model quota reached") && bodyText.includes("refresh on")) {',
                    '    var match = bodyText.match(/refresh on (.*?)\\./);',
                    '    if (match) {',
                    '      return JSON.stringify({ busy: true, reason: "quota", refreshTime: match[1] });',
                    '    }',
                    '  }',
                    '',
                    '  // ── 1. 정지(Cancel) 버튼 존재 여부 확인 ──',
                    '  // 에이전트 작업 중이면 보내기 버튼이 사라지고 정지용 div가 나타남',
                    '  var cancelDiv = document.querySelector("[data-tooltip-id=input-send-button-cancel-tooltip]");',
                    '  if (cancelDiv) {',
                    '    return JSON.stringify({ busy: true, reason: "cancel_btn_present", detail: "Cancel/Stop div found" });',
                    '  }',
                    '',
                    '  // ── 2. 보내기(Send) 버튼 상태로 작업 완료 여부 판단 ──',
                    '  // 정지 버튼이 없고 보내기 버튼이 있으면 작업 완료',
                    '  var sendBtn = document.querySelector("button[data-tooltip-id=input-send-button-send-tooltip]");',
                    '  if (sendBtn) {',
                    '    var isDisabled = sendBtn.disabled || sendBtn.hasAttribute("disabled");',
                    '    if (isDisabled) {',
                    '      // 입력창 텍스트 확인 — 비어있으면 텍스트 미입력 때문에 disabled (에이전트는 idle)',
                    '      var chatInput = document.querySelector(".cursor-text[contenteditable]");',
                    '      var hasText = chatInput && (chatInput.textContent || "").trim().length > 0;',
                    '      if (!hasText) {',
                    '        return JSON.stringify({ busy: false, reason: "send_btn_disabled_no_text", detail: "Send button disabled due to empty input — agent is idle" });',
                    '      }',
                    '      return JSON.stringify({ busy: true, reason: "send_btn_disabled", detail: "Send button is disabled" });',
                    '    } else {',
                    '      return JSON.stringify({ busy: false, detail: "send_btn_enabled" });',
                    '    }',
                    '  }',
                    '',
                    '  // ── 3. 둘 다 찾지 못한 경우 — busy로 간주 (안전 측) ──',
                    '  return JSON.stringify({ busy: true, reason: "no_btn_found", detail: "Neither send nor cancel button found" });',
                    '})()',
                ].join('\n');

            const result = await this._cdpSendCommand(targetWsUrl, 'Runtime.evaluate', {
                expression: expr,
                returnByValue: true
            }, 5000);

            var val = result && result.result && result.result.value;
            if (!val) return diagnostic ? { buttons: [] } : { busy: true, reason: 'no_result' };
            try {
                return JSON.parse(val);
            } catch (e) {
                return diagnostic ? { buttons: [] } : { busy: true, reason: 'parse_error' };
            }
        } catch (e) {
            return diagnostic ? { buttons: [] } : { busy: true, reason: 'cdp_error', detail: e.message };
        }
    }

    // ─── Internal Loop Logic ──────────────────────────────────────────

    async _runNextIteration() {
        if (this.state !== LoopState.RUNNING) return;

        // Check max iterations
        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const maxIterations = config.get('ralphLoop.maxIterations', 50);

        if (this.currentIteration >= maxIterations) {
            const msg = `🏁 Ralph Loop reached max iterations (${maxIterations}). Stopping.`;
            this._addLog(`[Ralph] ${msg}`, 'warn');
            vscode.window.showInformationMessage(msg);
            this._endGitSession();
            this.state = LoopState.IDLE;
            this._notifyStateChange();
            return;
        }

        // Check consecutive errors — stop after 3
        if (this.consecutiveErrors >= 3) {
            const msg = `❌ 연속 ${this.consecutiveErrors}회 에러 발생 — 루프를 자동 정지합니다.`;
            this._addLog(`[Ralph] ${msg}`, 'error');
            vscode.window.showErrorMessage(`Ralph Loop: ${msg}\n마지막 에러: ${this.lastError}`);
            this._endGitSession();
            this.state = LoopState.IDLE;
            this._notifyStateChange();
            return;
        }

        // Get next task group (may be parallel)
        const enableParallel = config.get('ralphLoop.enableParallel', true);
        const taskGroup = this.taskManager.getNextTaskGroup();

        if (taskGroup.tasks.length === 0) {
            // ── 큐에 대기 중인 작업이 있으면 먼저 처리 ──
            if (this._pendingTaskQueue.length > 0) {
                this._addLog('[Ralph] 📋 현재 PRD 작업 완료 — 대기 큐에서 다음 작업 시작');
                this._endGitSession();
                await this._processNextQueuedTask();
                return;
            }

            // ── Git: End session & merge on completion ──
            this._endGitSession();

            this._addLog('[Ralph] ✅ 모든 작업이 완료되었습니다!');

            // 전체 작업 완료 콜백 호출
            if (this.onAllTasksCompleteCallback) {
                try {
                    const sessionLabel = this.taskManager.getSessionLabel();
                    const tasks = this.taskManager.parseTasks();
                    this.onAllTasksCompleteCallback(sessionLabel, tasks, this.currentIteration);
                } catch (cbErr) {
                    this._addLog(`[Ralph] ⚠ onAllTasksCompleteCallback 에러: ${cbErr.message}`, 'warn');
                }
            }

            vscode.window.showInformationMessage('🎉 Ralph Loop: All tasks completed!');
            this.state = LoopState.IDLE;
            this._notifyStateChange();
            return;
        }

        // ── Parallel group execution ──
        if (taskGroup.parallel && enableParallel && taskGroup.tasks.length > 1) {
            this.currentIteration++;
            const progress = this.taskManager.getProgress();
            this._addLog(`[Ralph] ═══ 반복 ${this.currentIteration} (병렬 ${taskGroup.tasks.length}개) ═══`);
            this._addLog(`[Ralph] 진행: ${progress.completed}/${progress.total}`);
            this._notifyStateChange();

            try {
                // Lazy-init parallel runner
                if (!this._parallelRunner) {
                    this._parallelRunner = new ParallelTaskRunner(this);
                }

                this._sessionLock.acquire(this.currentIteration, `병렬 그룹: ${taskGroup.tasks.length}개`);

                const result = await this._parallelRunner.runParallelGroup(taskGroup.tasks, this.currentIteration);

                this._sessionLock.release();

                if (result.success) {
                    this.consecutiveErrors = 0;
                    this.lastError = null;
                    this._addLog(`[Ralph] ✅ 병렬 그룹 완료: ${result.completed}개 작업`);

                    // 병렬 그룹 완료 콜백 호출
                    if (this.onTaskCompleteCallback) {
                        try {
                            this.onTaskCompleteCallback('병렬 그룹', this.currentIteration, progress);
                        } catch (cbErr) {
                            this._addLog(`[Ralph] ⚠ onTaskCompleteCallback 에러: ${cbErr.message}`, 'warn');
                        }
                    }

                    this.progressTracker.appendProgress(
                        this.currentIteration,
                        `병렬 그룹 (${result.completed}개)`,
                        'completed'
                    );
                } else {
                    this.consecutiveErrors++;
                    this.lastError = result.errors.join('; ');
                    this._addLog(`[Ralph] ⚠ 병렬 그룹 부분 완료: ${result.completed}개 성공, ${result.errors.length}개 에러`, 'warn');
                    this.progressTracker.appendProgress(
                        this.currentIteration,
                        `병렬 그룹 (부분 완료: ${result.completed}개)`,
                        'partial',
                        result.errors.join('; ')
                    );
                }
            } catch (e) {
                this._sessionLock.release();
                this.consecutiveErrors++;
                this.lastError = e.message;
                this._addLog(`[Ralph] ❌ 병렬 그룹 에러: ${e.message}`, 'error');
                vscode.window.showErrorMessage(`Ralph Loop 병렬 에러: ${e.message}`);
            }
        } else {
            // ── Sequential single-task execution (existing logic) ──
            const task = taskGroup.tasks[0];

            this.currentIteration++;
            const progress = this.taskManager.getProgress();
            this._addLog(`[Ralph] ═══ 반복 ${this.currentIteration} ═══`);
            this._addLog(`[Ralph] 작업: ${task.text}`);
            this._addLog(`[Ralph] 진행: ${progress.completed}/${progress.total}`);
            this._notifyStateChange();

            // ── Git: Create per-task branch ──
            const autoCommit = config.get('ralphLoop.autoCommit', true);
            if (autoCommit) {
                const branchResult = this.gitManager.startTaskBranch(task.text, this.currentIteration);
                if (branchResult.success) {
                    this._addLog(`[Ralph] 🌿 작업 브랜치: ${branchResult.workBranch}`);
                } else if (branchResult.error) {
                    this._addLog(`[Ralph] ⚠ 작업 브랜치 생성 실패: ${branchResult.error}`, 'warn');
                }
            }

            try {
                // Snapshot PRD tasks BEFORE agent execution (for change detection)
                const tasksBeforeSnapshot = this.taskManager.parseTasks();
                const taskCountBefore = tasksBeforeSnapshot.length;
                const taskTextsBefore = new Set(tasksBeforeSnapshot.map(t => t.text));

                // Build the prompt for the agent
                const prompt = this._buildAgentPrompt(task, this.currentIteration, progress);

                // ── 세션 락 획득 ──
                this._sessionLock.acquire(this.currentIteration, task.text);

                // Send to Antigravity agent via CDP
                this._addLog('[Ralph] 📤 에이전트에 프롬프트 전송 중...');
                await this._sendToAgent(prompt);
                this._addLog('[Ralph] ✅ 에이전트에 프롬프트 전송 완료');

                // Wait for the agent to complete
                this._addLog('[Ralph] ⏳ 에이전트 작업 완료 대기 중...');
                await this._waitForAgentCompletion();
                this._addLog('[Ralph] ✅ 에이전트 작업 완료 감지');

                // Mark task as complete and record progress
                this.taskManager.markTaskComplete(task.line);
                this.progressTracker.appendProgress(
                    this.currentIteration,
                    task.text,
                    'completed'
                );

                // ── 세션 락 해제 (성공) ──
                this._sessionLock.release();
                this._addLog(`[Ralph] ✅ 작업 완료: ${task.text}`);

                // 개별 작업 완료 콜백 호출
                if (this.onTaskCompleteCallback) {
                    try {
                        this.onTaskCompleteCallback(task.text, this.currentIteration, progress);
                    } catch (cbErr) {
                        this._addLog(`[Ralph] ⚠ onTaskCompleteCallback 에러: ${cbErr.message}`, 'warn');
                    }
                }

                // ── PRD 변경 감지 ──
                this._detectPrdChanges(tasksBeforeSnapshot, taskCountBefore, taskTextsBefore, this.currentIteration);

                // ── Git: Commit changes and merge task branch back ──
                if (autoCommit) {
                    this.gitManager.commitIteration(this.currentIteration, task.text);
                    const autoDeleteBranch = config.get('ralphLoop.autoDeleteBranch', true);
                    const mergeResult = this.gitManager.endTaskBranch(autoDeleteBranch);
                    if (mergeResult.success && mergeResult.merged) {
                        this._addLog(`[Git] ✅ 작업 브랜치 → 원본 브랜치 머지 완료`);
                    } else if (!mergeResult.success) {
                        this._addLog(`[Git] ⚠ 머지 중 문제: ${mergeResult.error}`, 'warn');
                    }
                }

                // Reset consecutive errors on success
                this.consecutiveErrors = 0;
                this.lastError = null;

            } catch (e) {
                // ── 세션 락 해제 (실패) ──
                this._sessionLock.release();

                if (e.message === 'QUOTA_REACHED') {
                    // Quota 제한으로 인해 대기한 경우
                    this._addLog(`[Ralph] 🔄 동일한 작업을 다시 시도하기 위해 반복 횟수를 되돌립니다 (${task.text})`);
                    this.currentIteration--;
                    this.lastError = null;
                    this.consecutiveErrors = 0;
                } else {
                    this.consecutiveErrors++;
                    this.lastError = e.message;
                    const errMsg = `반복 ${this.currentIteration} 에러: ${e.message}`;
                    this._addLog(`[Ralph] ❌ ${errMsg}`, 'error');
                    vscode.window.showErrorMessage(`Ralph Loop 에러: ${errMsg}`);
                    this.progressTracker.appendProgress(
                        this.currentIteration,
                        task.text,
                        'failed',
                        e.message
                    );
                }
            }
        }

        this._notifyStateChange();

        // Schedule next iteration
        if (this.state === LoopState.RUNNING) {
            const delay = config.get('ralphLoop.iterationDelayMs', 1500);
            this._addLog(`[Ralph] ⏱ 다음 반복까지 ${delay}ms 대기...`);
            this.loopTimer = setTimeout(() => this._runNextIteration(), delay);
        }
    }

    /**
     * Build the prompt to send to the agent
     */
    _buildAgentPrompt(task, iteration, progress) {
        const progressFilePath = this.progressTracker.getProgressFilePath();
        const taskFilePath = this.taskManager.getTaskFile();
        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const allowPrdMod = config.get('ralphLoop.allowPrdModification', false);

        let prompt = `# Ralph Loop — Iteration ${iteration}\n\n`;
        prompt += `## Current Task\n${task.text}\n\n`;
        prompt += `## Progress\n- Completed: ${progress.completed}/${progress.total}\n- Remaining: ${progress.remaining}\n\n`;
        prompt += `## Instructions\n`;
        prompt += `1. Read the task file at \`${taskFilePath}\` for full context\n`;
        prompt += `2. Check progress at \`${progressFilePath}\` for what's been done\n`;
        prompt += `3. Complete EXACTLY ONE task: "${task.text}"\n`;
        prompt += `4. Do NOT modify the progress file — it is managed automatically\n`;
        prompt += `5. When done, verify your changes work correctly\n`;

        if (allowPrdMod) {
            prompt += `6. PRD 수정 허용: 작업 수행 중 PRD에 새로운 태스크 추가/변경이 필요하면 \`${taskFilePath}\`를 직접 수정하세요\n`;
            prompt += `   - 새 태스크 추가: \`- [ ] 태스크 설명\` 형식으로 추가\n`;
            prompt += `   - 기존 미완료 태스크 수정: 체크박스 형식(\`- [ ]\`)을 유지하되 내용을 변경\n`;
            prompt += `   - ⚠ \`- [x]\`로 마킹하지 마세요 — 완료 처리는 자동 관리됩니다\n`;
            prompt += `   - ⚠ 이미 완료된 태스크(\`- [x]\`)는 수정하지 마세요\n`;
        }

        // Convert literal \n sequences to actual newline characters
        // (template literals with \\n produce literal backslash+n, not real newlines)
        prompt = prompt.replace(/\\n/g, '\n');

        return prompt;
    }

    /**
     * Send prompt to Antigravity agent — FULLY CDP-BASED
     * 1. Get CDP target matching CURRENT workspace name
     * 2. CDP Ctrl+L → new chat session
     * 2.5. (optional) Insert @<media file path> references for each mediaPaths entry
     * 3. Runtime.evaluate → find chat textarea + focus + insert text (all in one call)
     * 4. CDP Enter → submit
     * @param {string} prompt - The prompt text to send
     * @param {string[]} [mediaPaths=[]] - Optional array of absolute media file paths to attach via @reference
     */
    async _sendToAgent(prompt, mediaPaths = []) {
        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        // ─── Step 1: Get CDP target matching CURRENT workspace ───
        const mainTarget = await this._findMainTarget(true);
        const targetWsUrl = mainTarget.webSocketDebuggerUrl;
        this._lastAgentTargetWsUrl = targetWsUrl; // 완료 대기 시 이 타겟에서 확인

        const sendKey = async (type, params) => {
            await this._cdpSendCommand(targetWsUrl, 'Input.dispatchKeyEvent', { type, ...params }, 5000);
        };

        // --- Step 2: Create new conversation ---

        // Use discovered Antigravity-specific commands

        const newChatCmds = [

            'antigravity.startNewConversation',

            'antigravity.prioritized.chat.openNewConversation',

            'welcome.newWorkspaceChat',

        ];

        let newChatOk = false;

        for (const cmd of newChatCmds) {

            try {

                await vscode.commands.executeCommand(cmd);

                this._addLog('[Ralph] 🆕 새 대화 시작: ' + cmd);

                newChatOk = true;

                break;

            } catch (e) {

                // try next

            }

        }

        if (!newChatOk) {

            this._addLog('[Ralph] ⚠ 새 대화 생성 실패', 'warn');

        }



        await delay(2000);

        // ─── Step 2.5: Insert @media references if mediaPaths provided ───
        if (mediaPaths && mediaPaths.length > 0) {
            this._addLog(`[Ralph] 📎 미디어 파일 ${mediaPaths.length}개 첨부 중...`);

            // Compute workspace-relative paths
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const workspaceRoot = (workspaceFolders && workspaceFolders.length > 0)
                ? workspaceFolders[0].uri.fsPath
                : null;

            for (const mediaPath of mediaPaths) {
                let refPath = mediaPath;
                if (workspaceRoot && mediaPath.startsWith(workspaceRoot)) {
                    // Convert to workspace-relative path
                    refPath = mediaPath.substring(workspaceRoot.length);
                    // Normalize separators and remove leading separator
                    refPath = refPath.replace(/\\/g, '/');
                    if (refPath.startsWith('/')) refPath = refPath.substring(1);
                }

                const atRef = `@${refPath} `;
                try {
                    await this._cdpSendCommand(targetWsUrl, 'Input.insertText', {
                        text: atRef
                    }, 5000);
                    this._addLog(`[Ralph]   📎 미디어 참조 삽입: ${atRef.trim()}`);
                } catch (e) {
                    this._addLog(`[Ralph]   ⚠ 미디어 참조 삽입 실패: ${refPath} — ${e.message}`, 'warn');
                }
                await delay(500);
            }

            this._addLog('[Ralph] ✅ 미디어 참조 삽입 완료');
        }

        // ─── Step 3: Find chat input → focus → insert text with line breaks ───
        // Strategy: CDP Input.insertText for text + Shift+Enter for line breaks
        // This is the most reliable way to insert multi-line text into contenteditable

        // 3a: Focus the chat input via Runtime.evaluate
        try {
            const focusResult = await this._cdpSendCommand(targetWsUrl, 'Runtime.evaluate', {
                expression: [
                    '(function() {',
                    '  var ceSelectors = [',
                    '    ".cursor-text[contenteditable]",',
                    '    ".cursor-text[role]",',
                    '    "[contenteditable].rounded",',
                    '    "[contenteditable]:not(.xterm-helper-textarea)",',
                    '  ];',
                    '  for (var i = 0; i < ceSelectors.length; i++) {',
                    '    var ce = document.querySelector(ceSelectors[i]);',
                    '    if (ce) {',
                    '      ce.focus();',
                    '      return "FOCUSED:" + ceSelectors[i];',
                    '    }',
                    '  }',
                    '  var taSelectors = [',
                    '    ".interactive-input-part .monaco-editor textarea",',
                    '    ".chat-input-part .monaco-editor textarea",',
                    '    ".chat-editor-input textarea",',
                    '  ];',
                    '  for (var j = 0; j < taSelectors.length; j++) {',
                    '    var el = document.querySelector(taSelectors[j]);',
                    '    if (el) {',
                    '      el.focus();',
                    '      return "FOCUSED:" + taSelectors[j];',
                    '    }',
                    '  }',
                    '  var ta = document.querySelectorAll("textarea").length;',
                    '  var ce2 = document.querySelectorAll("[contenteditable]").length;',
                    '  return "NOT_FOUND|ta=" + ta + "|ce=" + ce2;',
                    '})()',
                ].join('\n'),
                returnByValue: true
            }, 10000);

            const focusVal = (focusResult && focusResult.result) ? focusResult.result.value : '';
            this._addLog('[Ralph] 입력창 포커스: ' + focusVal);

            if (typeof focusVal === 'string' && focusVal.startsWith('NOT_FOUND')) {
                throw new Error(focusVal);
            }
        } catch (e) {
            throw new Error('채팅 입력창 포커스 실패: ' + e.message);
        }

        await delay(200);

        // 3b: Insert text line by line using CDP Input commands
        // Split prompt into lines and insert with Shift+Enter between them
        // trimEnd to avoid unnecessary trailing blank lines
        const lines = prompt.trimEnd().split('\n');
        this._addLog(`[Ralph] 📝 ${lines.length}줄 프롬프트 삽입 중 (CDP Input 방식)...`);

        try {
            for (let i = 0; i < lines.length; i++) {
                // Insert the line text (even if empty, we still need Shift+Enter for blank lines)
                if (lines[i].length > 0) {
                    await this._cdpSendCommand(targetWsUrl, 'Input.insertText', {
                        text: lines[i]
                    }, 5000);
                }

                // Insert line break between lines (not after the last line)
                if (i < lines.length - 1) {
                    // Shift+Enter = new line without submitting
                    await this._cdpSendCommand(targetWsUrl, 'Input.dispatchKeyEvent', {
                        type: 'keyDown',
                        key: 'Enter',
                        code: 'Enter',
                        windowsVirtualKeyCode: 13,
                        nativeVirtualKeyCode: 13,
                        modifiers: 8, // Shift modifier
                    }, 5000);
                    await this._cdpSendCommand(targetWsUrl, 'Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        key: 'Enter',
                        code: 'Enter',
                        windowsVirtualKeyCode: 13,
                        nativeVirtualKeyCode: 13,
                        modifiers: 8,
                    }, 5000);
                }
            }
            this._addLog('[Ralph] ✅ 프롬프트 텍스트 삽입 완료');
        } catch (e) {
            throw new Error('텍스트 삽입 실패: ' + e.message);
        }

        await delay(500);

        // ─── Step 4: Submit via Enter ───
        try {
            await sendKey('keyDown', {
                key: 'Enter', code: 'Enter',
                windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
                modifiers: 0,
            });
            await sendKey('keyUp', {
                key: 'Enter', code: 'Enter',
                windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
                modifiers: 0,
            });
            this._addLog('[Ralph] ✅ Enter 전송 완료');
        } catch (e) {
            throw new Error('Enter 전송 실패: ' + e.message);
        }
    }


    /**
     * Wait for the agent to finish working
     * Uses CDP to check Send button disabled state — when Send button is enabled, agent is done
     */
    async _waitForAgentCompletion() {
        const MAX_WAIT_MS = 3600000;      // 1시간 최대
        const POLL_INTERVAL_MS = 1000;    // 1초마다 폴링
        const INITIAL_WAIT_MS = 3000;     // 에이전트 시작 대기 3초
        const IDLE_CONFIRMS_NEEDED = 1;   // 보내기 버튼 enabled 1회 확인이면 충분

        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        // CDP 타겟 찾기 — 프롬프트를 보낸 타겟을 우선 사용
        let targetWsUrl = this._lastAgentTargetWsUrl;
        if (!targetWsUrl) {
            try {
                const target = await this._findMainTarget(false);
                targetWsUrl = target.webSocketDebuggerUrl;
            } catch (e) {
                this._addLog('[Ralph] ⚠ CDP 타겟 찾기 실패 — 시간 기반 대기(60초)로 대체: ' + e.message, 'warn');
                await delay(60000);
                return;
            }
        }
        this._addLog('[Ralph] 📡 CDP 에이전트 활동 모니터링 시작 (타겟: ' + targetWsUrl.substring(targetWsUrl.lastIndexOf('/') + 1, targetWsUrl.lastIndexOf('/') + 13) + '...)');

        // 에이전트가 시작할 시간 확보
        this._addLog('[Ralph] ⏳ 에이전트 시작 대기 (' + (INITIAL_WAIT_MS / 1000) + '초)...');
        await delay(INITIAL_WAIT_MS);

        // ── 첫 폴링: 진단 모드로 DOM 버튼 + 입력창 상태 로그 ──
        const diag = await this._isAgentBusy(targetWsUrl, true);
        if (diag.buttons && diag.buttons.length > 0) {
            this._addLog('[Ralph] 🔍 DOM 버튼 진단 (' + diag.buttons.length + '개):');
            diag.buttons.forEach((btn, idx) => {
                this._addLog('[Ralph]   [' + idx + '] ' + btn);
            });
        } else {
            this._addLog('[Ralph] 🔍 DOM 버튼 진단: 버튼 없음');
        }
        if (diag.inputState) {
            this._addLog('[Ralph] 🔍 입력창 상태: ' + JSON.stringify(diag.inputState));
        }

        let elapsed = INITIAL_WAIT_MS;
        let consecutiveIdleCount = 0;
        let everSeenBusy = false;
        let previousReason = null; // 이전 폴링의 reason 추적

        while (elapsed < MAX_WAIT_MS) {
            // 루프 상태 확인
            if (this.state !== LoopState.RUNNING) {
                this._addLog('[Ralph] ⚠ 루프 상태 변경 — 대기 취소');
                return;
            }

            // CDP로 에이전트 활동 상태 확인 (현재 워크스페이스 타겟만 스캔)
            let status = await this._isAgentBusy(targetWsUrl);

            // 저장된 타겟에서 감지 실패 시, 현재 워크스페이스의 다른 workbench 타겟도 스캔
            if (!status.busy) {
                try {
                    const allTargets = await this._findAllWorkbenchTargets();
                    for (const t of allTargets) {
                        if (t.webSocketDebuggerUrl === targetWsUrl) continue;
                        const altStatus = await this._isAgentBusy(t.webSocketDebuggerUrl);
                        if (altStatus.busy) {
                            status = altStatus;
                            // 다음부터 이 타겟을 직접 사용
                            targetWsUrl = t.webSocketDebuggerUrl;
                            this._addLog('[Ralph] 🔀 에이전트 활동 감지: 같은 워크스페이스 다른 윈도우 (' + (t.title || '').substring(0, 40) + ')');
                            break;
                        }
                    }
                } catch (e) { /* ignore scan errors */ }
            }

            // ── 상태 전환 감지: cancel → send_btn_disabled = 작업 중단/완료 ──
            // Cancel 버튼이 있다가 Send 버튼(disabled)으로 바뀌면 에이전트가 멈춘 것
            if (status.busy && status.reason === 'send_btn_disabled' &&
                previousReason === 'cancel_btn_present') {
                this._addLog('[Ralph] ✅ 에이전트 중단/완료 감지 — Cancel→Send(disabled) 전환 (' +
                    Math.round(elapsed / 1000) + '초 경과)');
                return;
            }

            if (status.busy) {
                // Quota reached 처리
                if (status.reason === 'quota' && status.refreshTime) {
                    const parsedDate = new Date(status.refreshTime);
                    const now = new Date();
                    let waitMs = parsedDate.getTime() - now.getTime();

                    if (isNaN(waitMs)) {
                        this._addLog(`[Ralph] ⚠ 할당량(Quota) 시간 파싱 실패: ${status.refreshTime} - 기본 5분 대기합니다.`, 'warn');
                        waitMs = 5 * 60 * 1000;
                    } else if (waitMs < 0) {
                        waitMs = 60 * 1000; // 이미 시간이 지났다면 1분 뒤 재시도
                    } else {
                        // 실제 갱신이 반영될 수 있도록 10초(10000ms) 여유를 추가
                        waitMs += 10000;
                    }

                    const waitMinutes = (waitMs / 60000).toFixed(1);
                    this._addLog(`[Ralph] ⏳ 모델 할당량 초과(Model quota reached). ${status.refreshTime} 까지 약 ${waitMinutes}분 대기합니다...`, 'warn');
                    vscode.window.showWarningMessage(`Ralph Loop: 모델 할당량 초과. 약 ${waitMinutes}분 대기합니다.`);

                    // 해당 시간만큼 대기
                    await delay(waitMs);

                    this._addLog(`[Ralph] 🔄 할당량 갱신 대기 완료. 대화창을 초기화하고 작업을 재시도합니다.`);

                    // Dismiss 버튼 클릭 시도 (UI 정리)
                    try {
                        await this._cdpEvaluateOnTarget(targetWsUrl, `
                            var btns = document.querySelectorAll('button');
                            for (var i=0; i<btns.length; i++) {
                                if (btns[i].textContent.includes('Dismiss')) {
                                    btns[i].click();
                                }
                            }
                        `);
                    } catch (e) { }

                    // 에러를 던져서 _runNextIteration에서 재시도하도록 함
                    throw new Error('QUOTA_REACHED');
                }

                // 에이전트 활동 감지 (Stop 버튼, Thinking 등)
                consecutiveIdleCount = 0;
                everSeenBusy = true;
                previousReason = status.reason; // 이전 상태 기록

                if (elapsed % 15000 < POLL_INTERVAL_MS) {
                    this._addLog('[Ralph] 🔄 에이전트 작업 중 — ' + (status.reason || 'unknown') + ' (' +

                        (status.detail || '') + ', ' + Math.round(elapsed / 1000) + '초 경과)');
                }
            } else {
                // 에이전트 유휴 상태
                consecutiveIdleCount++;
                previousReason = null; // idle 상태이므로 전환 추적 리셋

                if (consecutiveIdleCount >= IDLE_CONFIRMS_NEEDED) {
                    this._addLog('[Ralph] ✅ 에이전트 완료 감지 — 활동 지표 ' +
                        consecutiveIdleCount + '회 연속 미발견 (' +
                        Math.round(elapsed / 1000) + '초 경과, everBusy=' + everSeenBusy +
                        (status.detail ? ', signal=' + status.detail : '') + ')');
                    return;
                }

                this._addLog('[Ralph] ⏳ 에이전트 활동 미감지 (' +
                    consecutiveIdleCount + '/' + IDLE_CONFIRMS_NEEDED + ')');
            }

            await delay(POLL_INTERVAL_MS);
            elapsed += POLL_INTERVAL_MS;
        }

        this._addLog('[Ralph] ⚠ 최대 대기 시간 초과 (' + (MAX_WAIT_MS / 1000) + '초) — 다음 반복으로 이동', 'warn');
    }

    /**
     * Detect PRD file changes by comparing task snapshots (before vs after agent execution)
     * @param {Array} tasksBefore - Tasks snapshot before agent ran
     * @param {number} countBefore - Task count before
     * @param {Set<string>} textsBefore - Set of task texts before
     * @param {number} iteration - Current iteration number
     */
    _detectPrdChanges(tasksBefore, countBefore, textsBefore, iteration) {
        const tasksAfter = this.taskManager.parseTasks();
        const countAfter = tasksAfter.length;
        const textsAfter = new Set(tasksAfter.map(t => t.text));

        // Find added tasks (in after but not in before)
        const added = [];
        for (const text of textsAfter) {
            if (!textsBefore.has(text)) {
                added.push(text);
            }
        }

        // Find removed tasks (in before but not in after, excluding just-completed task)
        const removed = [];
        for (const text of textsBefore) {
            if (!textsAfter.has(text)) {
                // Check if this was the just-completed task (it got [x] marked, text stays same)
                const afterTask = tasksAfter.find(t => t.text === text);
                if (!afterTask) {
                    removed.push(text);
                }
            }
        }

        // Detect if any change occurred
        if (added.length > 0 || removed.length > 0) {
            const change = {
                iteration,
                added,
                removed,
                countBefore,
                countAfter,
                timestamp: new Date().toISOString()
            };

            this._prdChanges.push(change);
            if (this._prdChanges.length > this._maxPrdChanges) {
                this._prdChanges.shift();
            }

            // Log the changes
            this._addLog(`[Ralph] 📝 PRD 변경 감지! (반복 ${iteration})`, 'warn');
            if (added.length > 0) {
                this._addLog(`[Ralph]   ➕ 추가된 태스크 (${added.length}개):`);
                for (const t of added) {
                    this._addLog(`[Ralph]      • ${t.substring(0, 60)}`);
                }
            }
            if (removed.length > 0) {
                this._addLog(`[Ralph]   ➖ 제거된 태스크 (${removed.length}개):`);
                for (const t of removed) {
                    this._addLog(`[Ralph]      • ${t.substring(0, 60)}`);
                }
            }

            // Updated progress
            const newProgress = this.taskManager.getProgress();
            this._addLog(`[Ralph]   📊 현재 진행: ${newProgress.completed}/${newProgress.total} (남은: ${newProgress.remaining})`);

            // Show VS Code notification
            vscode.window.showInformationMessage(
                `📝 PRD 변경: +${added.length} / -${removed.length} 태스크 (반복 ${iteration})`
            );
        }
    }

    /**
     * Get PRD change history for sidebar display
     * @returns {Array<{iteration: number, added: string[], removed: string[], timestamp: string}>}
     */
    getPrdChanges() {
        return this._prdChanges.slice(-20);
    }

    /**
     * End git session — merge current task branch (if any) and clean up.
     * Branch deletion is controlled by the autoDeleteBranch setting.
     */
    _endGitSession() {
        // Clean up any remaining worktrees from parallel execution
        this.gitManager.cleanupWorktrees();

        const session = this.gitManager.getSessionInfo();
        if (!session.active) return;

        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const autoDeleteBranch = config.get('ralphLoop.autoDeleteBranch', true);
        const autoPush = config.get('ralphLoop.autoPush', false);

        if (session.workBranch) {
            this._addLog(`[Git] 🔀 세션 종료 — ${session.workBranch} → ${session.sessionBranch || session.originalBranch} 머지...`);
        }
        if (session.sessionBranch) {
            this._addLog(`[Git] 🔀 세션 브랜치 ${session.sessionBranch} → ${session.originalBranch} 머지 예정...`);
        }

        const result = this.gitManager.endSession({ autoDeleteBranch, autoPush });

        if (result.success && result.sessionMerged) {
            this._addLog(`[Git] ✅ 세션 브랜치가 원본 브랜치(${session.originalBranch})에 머지되었습니다.`);
            vscode.window.showInformationMessage(
                `✅ Git: ${session.sessionBranch} → ${session.originalBranch} 세션 머지 완료`
            );
        } else if (result.success && result.merged) {
            this._addLog('[Git] ✅ 작업이 머지되었습니다.');
        } else if (result.success && !result.merged) {
            this._addLog('[Git] ℹ 머지할 커밋이 없어 세션만 종료했습니다.');
        } else {
            this._addLog(`[Git] ⚠ 세션 종료 중 문제: ${result.error}`, 'warn');
            vscode.window.showWarningMessage(
                `⚠ Git 머지 문제: ${result.error}\n수동으로 해결이 필요할 수 있습니다.`
            );
        }
    }

    /**
     * Push current branch to remote immediately.
     * Can be invoked from command palette (autoAntigravity.pushNow).
     */
    async pushNow() {
        // Ensure workspace root is set on the git manager
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            const msg = '❌ 워크스페이스가 열려 있지 않습니다.';
            this._addLog(`[Git] ${msg}`, 'error');
            vscode.window.showErrorMessage(msg);
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        this.gitManager._workspaceRoot = workspaceRoot;

        this._addLog('[Git] 🚀 수동 Push 실행 중...');
        const result = this.gitManager.pushToRemote();

        if (result.success) {
            const msg = '🚀 Git Push 성공!';
            this._addLog(`[Git] ${msg}`);
            vscode.window.showInformationMessage(msg);
        } else {
            const msg = `❌ Git Push 실패: ${result.error}`;
            this._addLog(`[Git] ${msg}`, 'error');
            vscode.window.showErrorMessage(msg);
        }
    }

    /**
     * Notify state change for UI updates
     */
    _notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange(this.state, this.currentIteration);
        }
    }
}

module.exports = { RalphLoopManager, LoopState };
