// AutoAntigravity — Ralph Loop Main Logic
// Iterative AI agent execution with persistent memory
// Uses CDP (Chrome DevTools Protocol) to inject prompts into Antigravity chat

const vscode = require('vscode');
const { CdpClient } = require('./CdpClient');
const http = require('http');
const path = require('path');
const { TaskFileManager } = require('./TaskFileManager');
const { ProgressTracker } = require('./ProgressTracker');
const { GitManager } = require('./GitManager');
const { AgentSessionLock } = require('./AgentSessionLock');
const { ParallelTaskRunner } = require('./ParallelTaskRunner');
const { t } = require('../i18n');

/**
 * Ralph Loop states
 */
const LoopState = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    STOPPING: 'stopping',
    QUOTA_PAUSED: 'quota_paused'
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
        this.cdpClient = new CdpClient((msg, level) => this._addLog(msg, level));
        this.currentIteration = 0;
        this.loopTimer = null;
        this.onStateChange = null; // callback for UI updates
        this.onLogCallback = null; // callback for log forwarding (e.g. Telegram)
        this.onTaskCompleteCallback = null; // callback for individual task completion (e.g. Telegram)
        this.onAllTasksCompleteCallback = null; // callback for all tasks completion (e.g. Telegram)
        this.onQuotaExhaustedCallback = null; // callback for quota exhaustion notification (e.g. Telegram)

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
        this.cdpClient.setLastAgentTargetWsUrl(null); // 마지막으로 프롬프트를 보낸 타겟의 WS URL

        // ExtensionContext — workspaceState 영속 저장용 (워크스페이스별)
        this._context = null;

        // Auto Start — FileSystemWatcher
        this._autoStartWatcher = null;
        this._autoStartDebounceTimer = null;

        // 작업 큐 — 실행 중 새 작업 요청을 순차 대기
        this._pendingTaskQueue = [];

        // 큐 작업에 의한 강제 autoStart 플래그
        this._forceNextAutoStart = false;

        // Quota 일시정지 자동 재개 타이머
        this._quotaResumeTimer = null;

        // 코드 리뷰 워처 — 기본 대화에서도 에이전트 완료 감지 후 자동 리뷰
        this._codeReviewWatcherTimer = null;
        this._codeReviewWatcherLastBusy = false; // 이전 폴링 상태
        this._codeReviewRunning = false; // 리뷰 실행 중 중복 방지
        this._standaloneRunning = false; // 단일 작업 등 에이전트 독립 실행 상태
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

    isBusy() {
        return this.state !== LoopState.IDLE || this._standaloneRunning || this._codeReviewRunning;
    }

    setStandaloneRunning(active) {
        this._standaloneRunning = active;
        this._notifyStateChange();
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
        if (this.state === LoopState.RUNNING || this.state === LoopState.QUOTA_PAUSED) {
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
        this._stopCodeReviewWatcher(); // 루프 시작 시 워처 중지 (루프 내 리뷰와 중복 방지)
        this.consecutiveErrors = 0;
        this.lastError = null;
        this.progressTracker.initializeProgressFile();
        this.currentIteration = this.progressTracker.getLastIteration();

        // ── Workspace root 설정 (병렬 워크트리에 필수) ──
        const wsRootForGit = workspaceFolders[0].uri.fsPath;
        if (!this.gitManager._workspaceRoot) {
            this.gitManager._workspaceRoot = wsRootForGit;
        }

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
    async stop() {
        if (this.state === LoopState.IDLE && !this._codeReviewRunning) return;

        // ── 코드 리뷰 실행 중이면 취소 ──
        if (this._codeReviewRunning) {
            this._codeReviewCancelled = true;
            this._addLog('[Ralph] ⏹ 코드 리뷰 취소 요청');
        }

        // ── 코드 리뷰 워처 중지 (재시작 방지) ──
        this._stopCodeReviewWatcher();

        if (this.state === LoopState.IDLE) {
            // IDLE이지만 코드 리뷰만 실행 중인 경우 — 루프 정지 로직 불필요
            this._addLog('[Ralph] ⏹ 코드 리뷰 취소 처리 완료');
            return;
        }

        this._sessionLock.release();
        this.state = LoopState.STOPPING;
        await this.cdpClient.cancelAllActiveConversations();
        this._addLog('[Ralph] ⏹ 루프 정지 요청 — 현재 반복 마무리 중...');
        this._notifyStateChange();

        if (this.loopTimer) {
            clearTimeout(this.loopTimer);
            this.loopTimer = null;
        }

        // ── Quota 재개 타이머 정리 ──
        if (this._quotaResumeTimer) {
            clearTimeout(this._quotaResumeTimer);
            this._quotaResumeTimer = null;
        }

        // ── 대기 큐 클리어 ──
        this._pendingTaskQueue = [];

        // ── Git: End session & merge ──
        this._endGitSession();

        this.state = LoopState.IDLE;
        this._startCodeReviewWatcherIfEnabled(); // 루프 정지 후 워처 재시작
        vscode.window.showInformationMessage('⏹ Ralph Loop stopped.');
        this._addLog('[Ralph] ⏹ 루프가 정지되었습니다.');
        this._notifyStateChange();
    }


    /**
     * Dispose / cleanup
     */
    dispose() {
        this.disableAutoStart();
        this._stopCodeReviewWatcher();
        this.stop().catch(() => {});
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
            this._startCodeReviewWatcherIfEnabled();
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
            this._startCodeReviewWatcherIfEnabled();
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
            this._startCodeReviewWatcherIfEnabled();
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
                if (e.message === 'QUOTA_REACHED') {
                    // Quota 제한으로 인해 대기한 경우 — 반복 되돌리고 재시도
                    this._addLog(`[Ralph] 🔄 병렬 그룹 작업을 다시 시도하기 위해 반복 횟수를 되돌립니다`);
                    this.currentIteration--;
                    this.lastError = null;
                    this.consecutiveErrors = 0;
                } else if (e.message === 'QUOTA_PAUSE_CANCELLED') {
                    // Quota 대기 중 stop() 호출됨
                    this._addLog('[Ralph] ⚠ 병렬 그룹: Quota 대기 중 루프 정지됨');
                    this.lastError = null;
                    this.consecutiveErrors = 0;
                } else {
                    this.consecutiveErrors++;
                    this.lastError = e.message;
                    this._addLog(`[Ralph] ❌ 병렬 그룹 에러: ${e.message}`, 'error');
                    vscode.window.showErrorMessage(`Ralph Loop 병렬 에러: ${e.message}`);
                }
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

                // ── 에이전트 응답에서 도구 쿼터 에러 감지 (generate_image 429 등) ──
                const quotaInfo = await this.cdpClient.checkResponseForToolQuota();
                if (quotaInfo) {
                    await this._enterQuotaPause(quotaInfo.waitMs, quotaInfo.refreshLabel, quotaInfo.wsUrl);
                }

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

                // 개별 작업 완료 콜백 호출 (ImageName 파싱 기반 이미지 감지)
                if (this.onTaskCompleteCallback) {
                    try {
                        const newImages = this._findImageByName(task.text);
                        this.onTaskCompleteCallback(task.text, this.currentIteration, progress, newImages);
                    } catch (cbErr) {
                        this._addLog(`[Ralph] ⚠ onTaskCompleteCallback 에러: ${cbErr.message}`, 'warn');
                    }
                }

                // ── PRD 변경 감지 ──
                this._detectPrdChanges(tasksBeforeSnapshot, taskCountBefore, taskTextsBefore, this.currentIteration);


                // ── 코드 리뷰 (Code Review) ──
                const enableCodeReview = config.get('ralphLoop.enableCodeReview', false);
                if (enableCodeReview && this.state === LoopState.RUNNING) {
                    await this.runCodeReview(task.text, this.currentIteration);
                }

                // ── Git: Commit changes and merge task branch back ──
                if (autoCommit) {
                    this.gitManager.commitIteration(this.currentIteration, task.text);
                    const autoDeleteBranch = config.get('ralphLoop.autoDeleteBranch', true);
                    const mergeResult = this.gitManager.endTaskBranch(autoDeleteBranch);
                    if (!mergeResult.success) {
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
                } else if (e.message === 'QUOTA_PAUSE_CANCELLED') {
                    // Quota 대기 중 stop() 호출됨
                    this._addLog('[Ralph] ⚠ Quota 대기 중 루프 정지됨');
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
        const mainTarget = await this.cdpClient.findMainTarget(true);
        const targetWsUrl = mainTarget.webSocketDebuggerUrl;
        this.cdpClient.setLastAgentTargetWsUrl(targetWsUrl); // 완료 대기 시 이 타겟에서 확인

        const sendKey = async (type, params) => {
            await this.cdpClient.sendCommand(targetWsUrl, 'Input.dispatchKeyEvent', { type, ...params }, 5000);
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
                    await this.cdpClient.sendCommand(targetWsUrl, 'Input.insertText', {
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
            const focusResult = await this.cdpClient.sendCommand(targetWsUrl, 'Runtime.evaluate', {
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
                    await this.cdpClient.sendCommand(targetWsUrl, 'Input.insertText', {
                        text: lines[i]
                    }, 5000);
                }

                // Insert line break between lines (not after the last line)
                if (i < lines.length - 1) {
                    // Shift+Enter = new line without submitting
                    await this.cdpClient.sendCommand(targetWsUrl, 'Input.dispatchKeyEvent', {
                        type: 'keyDown',
                        key: 'Enter',
                        code: 'Enter',
                        windowsVirtualKeyCode: 13,
                        nativeVirtualKeyCode: 13,
                        modifiers: 8, // Shift modifier
                    }, 5000);
                    await this.cdpClient.sendCommand(targetWsUrl, 'Input.dispatchKeyEvent', {
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
                text: '\r', unmodifiedText: '\r',
                modifiers: 0,
            });
            await sendKey('char', {
                key: 'Enter', code: 'Enter',
                windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
                text: '\r', unmodifiedText: '\r',
                modifiers: 0,
            });
            await sendKey('keyUp', {
                key: 'Enter', code: 'Enter',
                windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
                modifiers: 0,
            });

            // Fallback: Click the send button if it exists
            await this.cdpClient.evaluateOnTarget(targetWsUrl, `
                (function() {
                    var selectors = [
                        'button[data-tooltip-id="input-send-button-send-tooltip"]',
                        '.chat-execute-button',
                        'button[aria-label="Send"]',
                        'button[aria-label="보내기"]'
                    ];
                    for (var i = 0; i < selectors.length; i++) {
                        var btn = document.querySelector(selectors[i]);
                        if (btn && !btn.disabled) {
                            btn.click();
                            return;
                        }
                    }
                })();
            `);

            this._addLog('[Ralph] ✅ Enter 전송 완료');
        } catch (e) {
            throw new Error('Enter 전송 실패: ' + e.message);
        }
    }

    /**
     * CDP를 사용하여 채팅 UI에서 마지막 에이전트(assistant) 응답 텍스트를 추출합니다.
     * 텔레그램 일반 대화 기능에서 AI 응답을 가져와 전송하는 데 사용됩니다.
     * @returns {Promise<string|null>} 마지막 에이전트 응답 텍스트, 없으면 null
     */
    async _getLastAgentResponse() {
        let wsUrl = this.cdpClient.getLastAgentTargetWsUrl();
        if (!wsUrl) {
            // _lastAgentTargetWsUrl이 없는 경우 (사용자가 직접 채팅한 대화 등)
            // _findMainTarget으로 CDP 타겟을 동적으로 찾아서 사용
            try {
                const target = await this.cdpClient.findMainTarget(false);
                if (target && target.webSocketDebuggerUrl) {
                    wsUrl = target.webSocketDebuggerUrl;
                } else {
                    return null;
                }
            } catch (e) {
                this._addLog(`[Ralph] ⚠ _getLastAgentResponse: CDP 타겟 없음 — ${e.message}`, 'warn');
                return null;
            }
        }

        try {
            const result = await this.cdpClient.evaluateOnTarget(wsUrl, `
                (function() {
                    var MAX_LEN = 4000;
                    function truncate(text) {
                        text = (text || '').trim();
                        if (!text) return null;
                        return text.length > MAX_LEN ? text.substring(0, MAX_LEN) + '...' : text;
                    }

                    // ── Strategy 1: Antigravity-specific selectors ──
                    var selectors = [
                        // Antigravity/Cursor-style chat UI
                        '[data-role="assistant"]',
                        '[data-turn-role="assistant"]',
                        '.assistant-message',
                        '.ai-message',
                        '.response-markdown',
                        '.chat-response-content',
                        '.agent-response',
                        '.assistant-message .message-content',
                        '.chat-message-content',
                        // Generic chat patterns
                        '[class*="assistant"][class*="message"]',
                        '[class*="response"][class*="content"]',
                        '[class*="agent"][class*="message"]',
                    ];

                    for (var i = 0; i < selectors.length; i++) {
                        try {
                            var els = document.querySelectorAll(selectors[i]);
                            if (els.length > 0) {
                                var last = els[els.length - 1];
                                var text = truncate(last.innerText || last.textContent);
                                if (text && text.length > 10) return text;
                            }
                        } catch (e) { /* selector parse error — skip */ }
                    }

                    // ── Strategy 2: Turn-based containers ──
                    var turnSelectors = [
                        '[class*="turn"]',
                        '[class*="Turn"]',
                        '.chat-turn',
                        '.conversation-turn',
                        '.message-group',
                        '[class*="message-row"]',
                        '[class*="chat-row"]',
                    ];
                    for (var t = 0; t < turnSelectors.length; t++) {
                        try {
                            var turns = document.querySelectorAll(turnSelectors[t]);
                            if (turns.length > 1) {
                                // 역순으로 user가 아닌 마지막 턴 찾기
                                for (var j = turns.length - 1; j >= 0; j--) {
                                    var turn = turns[j];
                                    var attrs = (turn.getAttribute('data-role') || '') +
                                                (turn.getAttribute('data-turn-role') || '') +
                                                (turn.className || '');
                                    var lower = attrs.toLowerCase();
                                    if (lower.indexOf('user') !== -1 || lower.indexOf('human') !== -1) continue;
                                    var text = truncate(turn.innerText || turn.textContent);
                                    if (text && text.length > 30) return text;
                                }
                            }
                        } catch (e) { /* skip */ }
                    }

                    // ── Strategy 3: Broad heuristic — find large text blocks near chat input ──
                    // Antigravity chat input uses .cursor-text[contenteditable]
                    var chatInput = document.querySelector('.cursor-text[contenteditable]');
                    if (chatInput) {
                        // 채팅 입력창의 부모 컨테이너에서 큰 텍스트 블록들을 찾는다
                        var container = chatInput;
                        // 상위 5단계까지 올라감
                        for (var up = 0; up < 8 && container.parentElement; up++) {
                            container = container.parentElement;
                        }
                        // container 내에서 긴 텍스트를 가진 div들을 역순탐색
                        var blocks = container.querySelectorAll('div, section, article');
                        var candidates = [];
                        for (var b = 0; b < blocks.length; b++) {
                            var block = blocks[b];
                            // 입력창 자체 또는 하위 입력 영역은 제외
                            if (block.querySelector('.cursor-text[contenteditable]')) continue;
                            if (block.getAttribute('contenteditable')) continue;
                            var blockText = (block.innerText || '').trim();
                            if (blockText.length > 50 && block.children.length > 0) {
                                candidates.push({ el: block, len: blockText.length });
                            }
                        }
                        // 가장 마지막에 위치한 충분히 큰 블록을 선택
                        if (candidates.length > 0) {
                            var last = candidates[candidates.length - 1];
                            var text = truncate(last.el.innerText);
                            if (text && text.length > 30) return text;
                        }
                    }

                    return null;
                })()
            `, 10000);

            const val = (result && result.result) ? result.result.value : null;
            return val || null;
        } catch (e) {
            this._addLog(`[Ralph] ⚠ _getLastAgentResponse 에러: ${e.message}`, 'warn');
            return null;
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
        let targetWsUrl = this.cdpClient.getLastAgentTargetWsUrl();
        if (!targetWsUrl) {
            try {
                const target = await this.cdpClient.findMainTarget(false);
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
        const diag = await this.cdpClient.isAgentBusy(targetWsUrl, true);
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
            // 루프 상태 확인 (코드 리뷰 취소 포함)
            if (this.state !== LoopState.RUNNING && this.state !== LoopState.IDLE) {
                this._addLog('[Ralph] ⚠ 루프 상태 변경 — 대기 취소');
                return;
            }
            if (this._codeReviewCancelled) {
                this._addLog('[Ralph] ⚠ 코드 리뷰 취소됨 — 대기 중단');
                return;
            }

            // CDP로 에이전트 활동 상태 확인 (현재 워크스페이스 타겟만 스캔)
            let status = await this.cdpClient.isAgentBusy(targetWsUrl);

            // 저장된 타겟에서 감지 실패 시, 현재 워크스페이스의 다른 workbench 타겟도 스캔
            if (!status.busy) {
                try {
                    const allTargets = await this.cdpClient.findAllWorkbenchTargets();
                    for (const t of allTargets) {
                        if (t.webSocketDebuggerUrl === targetWsUrl) continue;
                        const altStatus = await this.cdpClient.isAgentBusy(t.webSocketDebuggerUrl);
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
                // Quota reached 처리 (채팅 모델 쿼터 — DOM 배너)
                if (status.reason === 'quota' && status.refreshTime) {
                    const parsedDate = new Date(status.refreshTime);
                    const now = new Date();
                    let waitMs = parsedDate.getTime() - now.getTime();

                    if (isNaN(waitMs)) {
                        this._addLog(`[Ralph] ⚠ 할당량(Quota) 시간 파싱 실패: ${status.refreshTime} - 기본 5분 대기합니다.`, 'warn');
                        waitMs = 5 * 60 * 1000;
                    } else if (waitMs < 0) {
                        waitMs = 60 * 1000;
                    } else {
                        waitMs += 10000;
                    }

                    // 공통 쿼터 일시정지 로직 호출 (항상 QUOTA_REACHED throw)
                    await this._enterQuotaPause(waitMs, status.refreshTime, targetWsUrl);
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
     * 공통 쿼터 일시정지 로직 — 루프를 QUOTA_PAUSED로 전환, 텔레그램 알림, 타이머 대기, RUNNING 복구.
     * 항상 QUOTA_REACHED 또는 QUOTA_PAUSE_CANCELLED 에러를 throw합니다.
     * @param {number} waitMs - 대기 시간 (밀리초)
     * @param {string} refreshTimeLabel - 사람이 읽을 수 있는 리셋 시간 라벨
     * @param {string} [targetWsUrl] - Dismiss 버튼 정리용 CDP 타겟 (선택)
     */
    async _enterQuotaPause(waitMs, refreshTimeLabel, targetWsUrl) {
        // 이미 다른 감지에 의해 QUOTA_PAUSED 상태이면 기존 타이머 대기
        if (this.state === LoopState.QUOTA_PAUSED) {
            this._addLog('[Ralph] ⏸ 이미 할당량 대기 중 — 기존 타이머 대기');
            while (this.state === LoopState.QUOTA_PAUSED) {
                await new Promise(r => setTimeout(r, 3000));
            }
            if (this.state === LoopState.RUNNING) {
                throw new Error('QUOTA_REACHED');
            }
            throw new Error('QUOTA_PAUSE_CANCELLED');
        }

        const waitMinutes = (waitMs / 60000).toFixed(1);
        const resumeTimeStr = new Date(Date.now() + waitMs).toLocaleTimeString();
        this._addLog(`[Ralph] ⏸ 할당량 초과 감지. 루프 일시정지 → ${resumeTimeStr} (약 ${waitMinutes}분 후) 자동 재개`, 'warn');
        vscode.window.showWarningMessage(t('ralph.quota_warn', { minutes: waitMinutes }));

        // 텔레그램 알림
        if (this.onQuotaExhaustedCallback) {
            try {
                this.onQuotaExhaustedCallback({
                    refreshTime: refreshTimeLabel,
                    waitMinutes: parseFloat(waitMinutes),
                    resumeTime: resumeTimeStr
                });
            } catch (cbErr) {
                this._addLog(`[Ralph] ⚠ onQuotaExhaustedCallback 에러: ${cbErr.message}`, 'warn');
            }
        }

        // QUOTA_PAUSED 전환
        this.state = LoopState.QUOTA_PAUSED;
        this._notifyStateChange();

        // 타이머 대기
        await new Promise((resolve) => {
            this._quotaResumeTimer = setTimeout(() => {
                this._quotaResumeTimer = null;
                resolve();
            }, waitMs);
        });

        // stop()으로 중지되었는지 확인
        if (this.state !== LoopState.QUOTA_PAUSED) {
            this._addLog('[Ralph] ⚠ Quota 대기 중 루프 상태 변경 — 재개 취소');
            throw new Error('QUOTA_PAUSE_CANCELLED');
        }

        // RUNNING 복구
        this.state = LoopState.RUNNING;
        this._notifyStateChange();
        this._addLog(`[Ralph] ▶ 할당량 갱신 대기 완료. 작업을 재시도합니다.`);

        // 텔레그램 재개 알림
        if (this.onQuotaExhaustedCallback) {
            try { this.onQuotaExhaustedCallback({ resumed: true }); } catch (cbErr) { /* ignore */ }
        }

        // Dismiss 버튼 정리
        if (targetWsUrl) {
            try {
                await this.cdpClient.evaluateOnTarget(targetWsUrl, `
                    var btns = document.querySelectorAll('button');
                    for (var i=0; i<btns.length; i++) {
                        if (btns[i].textContent.includes('Dismiss')) {
                            btns[i].click();
                        }
                    }
                `);
            } catch (e) { }
        }

        throw new Error('QUOTA_REACHED');
    }

    /**
     * 에이전트 응답에서 도구 수준 쿼터 에러를 감지합니다.
     * generate_image 등의 도구가 429 RESOURCE_EXHAUSTED를 반환한 경우,
     * 에이전트 응답 텍스트에 해당 에러 패턴이 포함되어 있습니다.
     * 감지 시 _enterQuotaPause를 호출하여 QUOTA_REACHED를 throw합니다.
     * @param {string} [targetWsUrl] - CDP 타겟 WebSocket URL
     */
    async _checkResponseForToolQuota(targetWsUrl) {
        const wsUrl = targetWsUrl || this.cdpClient.getLastAgentTargetWsUrl();
        if (!wsUrl) return;

        try {
            const result = await this.cdpClient.evaluateOnTarget(wsUrl, `
                (function() {
                    var text = document.body.innerText || '';
                    var chunk = text.substring(Math.max(0, text.length - 8000));

                    var patterns = [
                        'RESOURCE_EXHAUSTED',
                        'exhausted your capacity',
                        'quota will reset'
                    ];

                    var hit = false;
                    for (var i = 0; i < patterns.length; i++) {
                        if (chunk.indexOf(patterns[i]) !== -1) {
                            hit = true;
                            break;
                        }
                    }

                    if (!hit) return JSON.stringify({ quotaHit: false });

                    var tsMatch = chunk.match(/quotaResetTimeStamp[^0-9]*(\\d{4}-\\d{2}-\\d{2}T[\\d:]+Z)/);
                    var delayMatch = chunk.match(/reset after\\s+([\\dhms.]+)/i);

                    return JSON.stringify({
                        quotaHit: true,
                        resetTimestamp: tsMatch ? tsMatch[1] : null,
                        resetDelay: delayMatch ? delayMatch[1] : null
                    });
                })()
            `, 10000);

            const val = (result && result.result) ? result.result.value : '';
            let parsed;
            try { parsed = JSON.parse(val); } catch (e) { return; }

            if (!parsed.quotaHit) return;

            this._addLog(`[Ralph] 🔍 에이전트 응답에서 도구 쿼터 에러 감지 (RESOURCE_EXHAUSTED)`, 'warn');

            // 대기 시간 계산
            let waitMs = 30 * 60 * 1000; // 기본 30분
            let refreshLabel = '약 30분 후';

            if (parsed.resetTimestamp) {
                const resetDate = new Date(parsed.resetTimestamp);
                const now = new Date();
                const diff = resetDate.getTime() - now.getTime();
                if (!isNaN(diff) && diff > 0) {
                    waitMs = diff + 10000; // 10초 여유
                    refreshLabel = parsed.resetTimestamp;
                } else if (!isNaN(diff) && diff <= 0) {
                    waitMs = 60 * 1000; // 이미 지남 → 1분
                    refreshLabel = '리셋 시간 경과 (1분 후 재시도)';
                }
            } else if (parsed.resetDelay) {
                // "1h59m34s" 형식 파싱
                let ms = 0;
                const h = parsed.resetDelay.match(/(\d+)h/);
                const m = parsed.resetDelay.match(/(\d+)m/);
                const s = parsed.resetDelay.match(/([\d.]+)s/);
                if (h) ms += parseInt(h[1]) * 3600000;
                if (m) ms += parseInt(m[1]) * 60000;
                if (s) ms += parseFloat(s[1]) * 1000;
                if (ms > 0) {
                    waitMs = ms + 10000;
                    refreshLabel = parsed.resetDelay;
                }
            }

            // 공통 쿼터 일시정지 (QUOTA_REACHED throw)
            await this._enterQuotaPause(waitMs, refreshLabel, wsUrl);
        } catch (e) {
            // _enterQuotaPause에서 던진 에러는 그대로 전파
            if (e.message === 'QUOTA_REACHED' || e.message === 'QUOTA_PAUSE_CANCELLED') {
                throw e;
            }
            // CDP 에러 등은 무시
            this._addLog(`[Ralph] ⚠ 도구 쿼터 체크 중 에러 (무시): ${e.message}`, 'warn');
        }
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
     * Snapshot image files in the ResultImages/ directory.
     * Returns a Set of absolute file paths for comparison.
     * @param {string} [rootDir] - Root directory to scan (defaults to workspace root)
     * @returns {Set<string>} Set of absolute paths to image files
     */
    _snapshotImageFiles(rootDir) {
        try {
            const wsRoot = rootDir || this.gitManager._workspaceRoot;
            if (!wsRoot) return new Set();

            const pathMod = require('path');
            const fsMod = require('fs');
            const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
            const snapshot = new Set();

            const scanDir = (dir) => {
                if (!fsMod.existsSync(dir)) return;
                try {
                    const entries = fsMod.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = pathMod.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            scanDir(fullPath);
                        } else if (entry.isFile() && imageExts.has(pathMod.extname(entry.name).toLowerCase())) {
                            snapshot.add(fullPath);
                        }
                    }
                } catch (_) { /* ignore permission errors etc */ }
            };

            // Scan ResultImages/ directory
            scanDir(pathMod.join(wsRoot, 'ResultImages'));

            return snapshot;
        } catch (err) {
            return new Set();
        }
    }

    /**
     * Compare current image files against a previous snapshot to find newly created images.
     * @param {Set<string>} beforeSnapshot - Snapshot taken before task execution
     * @param {string} [rootDir] - Root directory to scan (defaults to workspace root)
     * @returns {string[]} Array of absolute paths to newly created image files
     */
    _getNewImagesSinceSnapshot(beforeSnapshot, rootDir) {
        try {
            const currentSnapshot = this._snapshotImageFiles(rootDir);
            const newImages = [...currentSnapshot].filter(f => !beforeSnapshot.has(f));

            if (newImages.length > 0) {
                const pathMod = require('path');
                this._addLog(`[Ralph] 🖼 생성된 이미지 ${newImages.length}개 감지: ${newImages.map(p => pathMod.basename(p)).join(', ')}`);
            }

            return newImages;
        } catch (err) {
            this._addLog(`[Ralph] ⚠ 이미지 감지 실패: ${err.message}`, 'warn');
            return [];
        }
    }

    /**
     * Parse ImageName from task text and find the corresponding image file in ResultImages/.
     * Task text format: ImageName: `이미지명`
     * @param {string} taskText - Task text containing ImageName
     * @returns {string[]} Array of absolute paths to matching image files
     */
    _findImageByName(taskText) {
        try {
            const match = taskText.match(/ImageName:\s*`([^`]+)`/);
            if (!match) return [];

            const imageName = match[1];
            const wsRoot = this.gitManager._workspaceRoot;
            if (!wsRoot) return [];

            const pathMod = require('path');
            const fsMod = require('fs');
            const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
            const resultDir = pathMod.join(wsRoot, 'ResultImages');

            if (!fsMod.existsSync(resultDir)) return [];

            const found = [];
            for (const ext of imageExts) {
                const filePath = pathMod.join(resultDir, imageName + ext);
                if (fsMod.existsSync(filePath)) {
                    found.push(filePath);
                }
            }

            if (found.length > 0) {
                this._addLog(`[Ralph] 🖼 ImageName '${imageName}' 이미지 ${found.length}개 감지: ${found.map(p => pathMod.basename(p)).join(', ')}`);
            }

            return found;
        } catch (err) {
            this._addLog(`[Ralph] ⚠ ImageName 기반 이미지 감지 실패: ${err.message}`, 'warn');
            return [];
        }
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

    // ─── Model Switching (CDP-based) ─────────────────────────────────

    /**
     * Get the currently selected AI model name from the Antigravity chat UI via CDP.
     * Reads the model selector button text in the chat panel header.
     * @returns {Promise<string|null>} Current model name (e.g. "Claude Opus 4.6") or null
     */
    async _getCurrentModel() {
        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        let targetWsUrl = this.cdpClient.getLastAgentTargetWsUrl();
        if (!targetWsUrl) {
            try {
                const target = await this.cdpClient.findMainTarget(false);
                targetWsUrl = target.webSocketDebuggerUrl;
            } catch (e) {
                this._addLog(`[Ralph] ⚠ _getCurrentModel: CDP 타겟 없음 — ${e.message}`, 'warn');
                return null;
            }
        }

        try {
            const result = await this.cdpClient.evaluateOnTarget(targetWsUrl, `
                (function() {
                    // Strategy 1: Model selector button with aria-haspopup
                    var selectors = [
                        'button[aria-haspopup="listbox"]',
                        'button[aria-haspopup="menu"]',
                        '.model-selector button',
                        '[class*="model"] button',
                        '[class*="ModelSelector"]',
                        '[data-testid*="model"]'
                    ];
                    for (var i = 0; i < selectors.length; i++) {
                        var els = document.querySelectorAll(selectors[i]);
                        for (var j = 0; j < els.length; j++) {
                            var el = els[j];
                            var text = (el.textContent || '').trim();
                            if (text && (text.toLowerCase().includes('claude') ||
                                         text.toLowerCase().includes('gemini') ||
                                         text.toLowerCase().includes('gpt') ||
                                         text.toLowerCase().includes('opus') ||
                                         text.toLowerCase().includes('sonnet') ||
                                         text.toLowerCase().includes('flash') ||
                                         text.toLowerCase().includes('pro'))) {
                                return JSON.stringify({ model: text, selector: selectors[i] });
                            }
                        }
                    }

                    // Strategy 2: Find any element with model-like text near chat input
                    var allBtns = document.querySelectorAll('button');
                    for (var k = 0; k < allBtns.length; k++) {
                        var btn = allBtns[k];
                        var rect = btn.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) continue;
                        var t = (btn.textContent || '').trim();
                        if (t.length > 3 && t.length < 60 &&
                            (t.toLowerCase().includes('claude') ||
                             t.toLowerCase().includes('gemini') ||
                             t.toLowerCase().includes('opus') ||
                             t.toLowerCase().includes('sonnet') ||
                             t.toLowerCase().includes('flash'))) {
                            return JSON.stringify({ model: t, selector: 'button-scan' });
                        }
                    }

                    return JSON.stringify({ model: null, selector: null });
                })()
            `, 10000);

            const val = (result && result.result) ? result.result.value : null;
            if (!val) return null;
            try {
                const parsed = JSON.parse(val);
                if (parsed.model) {
                    this._addLog(`[Ralph] 🤖 현재 모델: ${parsed.model} (via ${parsed.selector})`);
                }
                return parsed.model;
            } catch (e) {
                return null;
            }
        } catch (e) {
            this._addLog(`[Ralph] ⚠ _getCurrentModel 에러: ${e.message}`, 'warn');
            return null;
        }
    }

    /**
     * Switch the AI model in the Antigravity chat UI via CDP.
     * Opens the model selector dropdown and clicks the target model.
     * @param {string} targetModelKeyword - Keyword to match in model name (e.g. "Opus", "Gemini Pro", "Flash")
     * @returns {Promise<boolean>} true if switch succeeded
     */
    async _switchModel(targetModelKeyword) {
        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        let targetWsUrl = this.cdpClient.getLastAgentTargetWsUrl();
        if (!targetWsUrl) {
            try {
                const target = await this.cdpClient.findMainTarget(false);
                targetWsUrl = target.webSocketDebuggerUrl;
            } catch (e) {
                this._addLog(`[Ralph] ❌ _switchModel: CDP 타겟 없음 — ${e.message}`, 'error');
                return false;
            }
        }

        this._addLog(`[Ralph] 🔄 모델 전환 시도: "${targetModelKeyword}"`);

        try {
            // Step 1: Click the model selector to open dropdown
            const openResult = await this.cdpClient.evaluateOnTarget(targetWsUrl, `
                (function() {
                    var selectors = [
                        'button[aria-haspopup="listbox"]',
                        'button[aria-haspopup="menu"]',
                        '.model-selector button',
                        '[class*="model"] button',
                        '[class*="ModelSelector"]'
                    ];
                    for (var i = 0; i < selectors.length; i++) {
                        var els = document.querySelectorAll(selectors[i]);
                        for (var j = 0; j < els.length; j++) {
                            var el = els[j];
                            var text = (el.textContent || '').trim().toLowerCase();
                            if (text.includes('claude') || text.includes('gemini') ||
                                text.includes('opus') || text.includes('sonnet') ||
                                text.includes('flash') || text.includes('pro') || text.includes('gpt')) {
                                el.click();
                                return JSON.stringify({ clicked: true, text: el.textContent.trim() });
                            }
                        }
                    }
                    // Fallback: scan all buttons
                    var allBtns = document.querySelectorAll('button');
                    for (var k = 0; k < allBtns.length; k++) {
                        var btn = allBtns[k];
                        var rect = btn.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) continue;
                        var t = (btn.textContent || '').trim().toLowerCase();
                        if (t.length > 3 && t.length < 60 &&
                            (t.includes('claude') || t.includes('gemini') ||
                             t.includes('opus') || t.includes('sonnet') || t.includes('flash'))) {
                            btn.click();
                            return JSON.stringify({ clicked: true, text: btn.textContent.trim() });
                        }
                    }
                    return JSON.stringify({ clicked: false });
                })()
            `, 10000);

            const openVal = (openResult && openResult.result) ? openResult.result.value : null;
            let opened = false;
            if (openVal) {
                try {
                    const p = JSON.parse(openVal);
                    opened = p.clicked;
                    if (opened) {
                        this._addLog(`[Ralph] 🔽 모델 셀렉터 오픈: ${p.text}`);
                    }
                } catch (e) { /* ignore */ }
            }

            if (!opened) {
                this._addLog(`[Ralph] ❌ 모델 셀렉터를 찾을 수 없습니다`, 'error');
                return false;
            }

            // Wait for dropdown to appear
            await delay(1000);

            // Step 2: Find and click the target model in the dropdown
            const keyword = targetModelKeyword.toLowerCase();
            const selectResult = await this.cdpClient.evaluateOnTarget(targetWsUrl, `
                (function() {
                    var keyword = ${JSON.stringify(keyword)};
                    var keywords = keyword.split(' ').filter(Boolean);
                    function matchKeys(txt) {
                        for(var w=0; w<keywords.length; w++) {
                            if(!txt.includes(keywords[w])) return false;
                        }
                        return true;
                    }
                    // Search in dropdown/listbox options
                    var optionSelectors = [
                        '[role="option"]',
                        '[role="menuitem"]',
                        '[role="listbox"] > *',
                        '.dropdown-item',
                        '[class*="option"]',
                        '[class*="menu-item"]',
                        '[class*="MenuItem"]'
                    ];
                    for (var i = 0; i < optionSelectors.length; i++) {
                        var opts = document.querySelectorAll(optionSelectors[i]);
                        for (var j = 0; j < opts.length; j++) {
                            var opt = opts[j];
                            var text = (opt.textContent || '').trim().toLowerCase();
                            if (matchKeys(text)) {
                                opt.click();
                                return JSON.stringify({ selected: true, model: opt.textContent.trim(), selector: optionSelectors[i] });
                            }
                        }
                    }
                    // Broader scan: any visible element with matching text
                    var all = document.querySelectorAll('div, span, li, button, a');
                    for (var k = 0; k < all.length; k++) {
                        var el = all[k];
                        var rect = el.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) continue;
                        var t = (el.textContent || '').trim().toLowerCase();
                        // Match only direct text nodes (avoid parent elements with aggregate text)
                        if (el.children.length <= 2 && matchKeys(t) && t.length < 80) {
                            el.click();
                            return JSON.stringify({ selected: true, model: el.textContent.trim(), selector: 'broad-scan' });
                        }
                    }
                    return JSON.stringify({ selected: false });
                })()
            `, 10000);

            const selVal = (selectResult && selectResult.result) ? selectResult.result.value : null;
            if (selVal) {
                try {
                    const p = JSON.parse(selVal);
                    if (p.selected) {
                        this._addLog(`[Ralph] ✅ 모델 전환 완료: ${p.model} (via ${p.selector})`);
                        await delay(500);
                        return true;
                    }
                } catch (e) { /* ignore */ }
            }

            this._addLog(`[Ralph] ❌ 드롭다운에서 "${targetModelKeyword}" 모델을 찾을 수 없습니다`, 'error');

            // Close dropdown by pressing Escape
            try {
                await this.cdpClient.sendCommand(targetWsUrl, 'Input.dispatchKeyEvent', {
                    type: 'keyDown', key: 'Escape', code: 'Escape',
                    windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27
                }, 3000);
            } catch (e) { /* ignore */ }

            return false;
        } catch (e) {
            this._addLog(`[Ralph] ❌ _switchModel 에러: ${e.message}`, 'error');
            return false;
        }
    }

    /**
     * Determine which model to use for verification based on the implementation model.
     * Opus → Gemini Pro (High), Gemini → Opus, Other → Opus


    /**
     * Extract a useful keyword from a full model name for switching back.
     * e.g. "Claude Opus 4.6 (Thinking)" → "opus"
     * @param {string} modelName - Full model name
     * @returns {string|null}
     */
    _extractModelKeyword(modelName) {
        const name = (modelName || '').toLowerCase();
        if (name.includes('opus')) return 'opus';
        if (name.includes('sonnet')) return 'sonnet';
        if (name.includes('flash')) return 'flash';
        if (name.includes('gemini') && name.includes('pro')) {
            if (name.includes('high')) return 'gemini pro high';
            if (name.includes('low')) return 'gemini pro low';
            return 'gemini pro';
        }
        if (name.includes('gemini')) return 'gemini';
        if (name.includes('claude')) return 'claude';
        // Return first two words as keyword
        const words = modelName.trim().split(/\s+/).slice(0, 2).join(' ');
        return words || null;
    }

    // ─── Code Review Watcher (기본 대화 코드 리뷰 워처) ─────────────────

    /**
     * enableCodeReview 설정이 켜져 있고 Ralph Loop가 IDLE이면 워처 시작.
     * 에이전트가 busy → idle 전환 시 자동으로 코드 리뷰를 실행한다.
     */
    _startCodeReviewWatcherIfEnabled() {
        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const enabled = config.get('ralphLoop.enableCodeReview', false);
        if (enabled && this.state === LoopState.IDLE) {
            this._startCodeReviewWatcher();
        } else {
            this._stopCodeReviewWatcher();
        }
    }

    /**
     * CDP 폴링 기반 코드 리뷰 워처 시작.
     * 3초 간격으로 에이전트 busy 상태를 폴링하여 busy→idle 전환 시 리뷰 실행.
     */
    _startCodeReviewWatcher() {
        this._stopCodeReviewWatcher(); // 기존 워처 정리

        this._codeReviewWatcherLastBusy = false;
        this._addLog('[Ralph] 👁 코드 리뷰 워처 시작 (기본 대화 감시)');

        this._codeReviewWatcherTimer = setInterval(async () => {
            await this._pollCodeReviewWatcher();
        }, 3000);
    }

    /**
     * 코드 리뷰 워처 중지.
     */
    _stopCodeReviewWatcher() {
        if (this._codeReviewWatcherTimer) {
            clearInterval(this._codeReviewWatcherTimer);
            this._codeReviewWatcherTimer = null;
            this._addLog('[Ralph] 👁 코드 리뷰 워처 중지');
        }
    }

    /**
     * 코드 리뷰 워처 폴링 1회 실행.
     * busy→idle 전환 감지 시 runCodeReview() 호출.
     */
    async _pollCodeReviewWatcher() {
        // Ralph Loop가 실행 중이면 무시 (루프 내 리뷰가 처리)
        if (this.state !== LoopState.IDLE) return;
        // 이미 코드 리뷰 실행 중이면 중복 방지
        if (this._codeReviewRunning) return;
        // 취소됐으면 무시
        if (this._codeReviewCancelled) return;

        try {
            const mainTarget = await this.cdpClient.findMainTarget(false);
            if (!mainTarget || !mainTarget.webSocketDebuggerUrl) {
                // CDP 타겟을 못 찾으면 상태 리셋
                this._codeReviewWatcherLastBusy = false;
                return;
            }

            const status = await this.cdpClient.isAgentBusy(mainTarget.webSocketDebuggerUrl);
            const currentBusy = !!status.busy;

            // busy → idle 전환 감지
            if (this._codeReviewWatcherLastBusy && !currentBusy) {
                this._addLog('[Ralph] 👁 에이전트 대화 완료 감지 → 코드 리뷰 준비');
                this._codeReviewRunning = true;
                this._codeReviewCancelled = false;
                try {
                    // 이전 대화의 에이전트 응답을 컨텍스트로 가져옴
                    const lastResponse = await this._getLastAgentResponse();
                    const contextSummary = lastResponse
                        ? lastResponse.substring(0, 500)
                        : null;

                    // 변경 파일도 확인
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    let hasDiffChanges = false;
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        this.gitManager._workspaceRoot = this.gitManager._workspaceRoot || workspaceFolders[0].uri.fsPath;
                        const diff = this.gitManager.getUncommittedDiffSummary();
                        hasDiffChanges = diff.hasChanges;
                    }

                    // 대화 내용과 변경 파일 모두 없으면 리뷰 스킵
                    if (!contextSummary && !hasDiffChanges) {
                        this._addLog('[Ralph] 👁 대화 내용 수집 불가 & 파일 변경 없음 → 코드 리뷰 스킵');
                    } else {
                        const reviewContext = contextSummary || '(대화 내용을 가져올 수 없음 — 파일 변경 기반 리뷰)';
                        this._addLog('[Ralph] 👁 코드 리뷰 자동 실행');
                        await this.runCodeReview(reviewContext, 0, { isFromWatcher: true });
                    }
                } catch (err) {
                    if (!this._codeReviewCancelled) {
                        this._addLog(`[Ralph] ❌ 코드 리뷰 워처 에러: ${err.message}`, 'error');
                    }
                } finally {
                    this._codeReviewRunning = false;
                    this._codeReviewCancelled = false;
                    // 리뷰 자체의 busy→idle 전환이 다시 트리거되지 않도록 리셋
                    this._codeReviewWatcherLastBusy = false;
                }
            }

            this._codeReviewWatcherLastBusy = currentBusy;
        } catch (e) {
            // CDP 연결 실패 등 — 조용히 무시
            this._codeReviewWatcherLastBusy = false;
        }
    }

    // ─── Code Review (코드 리뷰) ──────────────────────────────────────

    /**
     * Build a code review prompt.
     * 항상 이전 대화 내용(또는 작업 내용)을 기반으로 리뷰 프롬프트를 생성한다.
     * 변경된 파일이 있으면 파일 목록과 diff 통계도 포함.
     *
     * @param {string} taskText - 이전 대화 요약 또는 완료된 작업 설명
     * @param {number} iteration - Current iteration number
     * @param {{ hasChanges?: boolean, changedFiles?: string[], diffStat?: string }} [context]
     * @returns {string} Code review prompt
     */
    _buildCodeReviewPrompt(taskText, iteration, context = {}) {
        const { hasChanges = false, changedFiles = [], diffStat = '' } = context;

        let prompt = `당신은 코드 리뷰어입니다. 아래 내용을 기반으로 코드 리뷰를 수행해주세요.\n\n`;
        prompt += `**중요 규칙:**\n`;
        prompt += `- 파일 시스템을 탐색하거나 디렉토리를 조회하지 마세요.\n`;
        prompt += `- 아래 제공된 정보만으로 리뷰를 작성하세요.\n`;
        prompt += `- 새로운 대화로 시작되었으므로 이전 대화 컨텍스트는 없습니다.\n\n`;
        prompt += `---\n\n`;
        prompt += `## Iteration ${iteration} 작업 요약\n${taskText}\n\n`;

        if (hasChanges) {
            prompt += `## 변경된 파일 (${changedFiles.length}개)\n`;
            for (const f of changedFiles.slice(0, 20)) {
                prompt += `- \`${f}\`\n`;
            }
            if (changedFiles.length > 20) {
                prompt += `- ... 외 ${changedFiles.length - 20}개\n`;
            }
            prompt += `\n`;
            if (diffStat) {
                prompt += `## Git Diff 통계\n\`\`\`\n${diffStat}\n\`\`\`\n\n`;
            }
            prompt += `## 리뷰 요청\n`;
            prompt += `위 변경 파일들의 **Git diff** (\`git diff HEAD\`)를 확인하여 코드 변경 내역을 리뷰해주세요.\n\n`;
        } else {
            prompt += `## 리뷰 요청\n`;
            prompt += `파일 변경은 없었습니다.\n`;
            prompt += `위 작업 요약 내용을 기반으로 에이전트의 응답 품질을 평가해주세요.\n\n`;
        }

        prompt += `### 확인 사항\n`;
        if (hasChanges) {
            prompt += `1. **코드 품질**: 가독성, 명명 규칙, 코드 구조\n`;
            prompt += `2. **버그 가능성**: null 참조, 경계 조건, 에러 핸들링\n`;
            prompt += `3. **성능**: 불필요한 루프, 메모리 누수, 최적화 기회\n`;
            prompt += `4. **보안**: 입력 검증, 인젝션 취약점\n`;
            prompt += `5. **개선 제안**: 리팩터링 기회, 더 나은 패턴 제안\n\n`;
        } else {
            prompt += `1. **응답 정확성**: 에이전트의 답변이 정확한지\n`;
            prompt += `2. **유용성**: 실용적이고 도움이 되는 응답인지\n`;
            prompt += `3. **완전성**: 요청에 대해 빠진 부분은 없는지\n\n`;
        }
        prompt += `리뷰 결과를 구체적이고 실행 가능한 피드백으로 제공해주세요.\n`;
        prompt += `심각한 문제가 있으면 ⚠ 아이콘으로 표시하고, 경미한 제안은 💡로 표시해주세요.\n`;

        return prompt;
    }

    /**
     * Run a standalone task (from sidebar task queue) with full pipeline:
     * 1. Send /write-prd prompt to agent
     * 2. Wait for agent completion
     * 3. Run verification (if enabled)
     * 4. Run code review (if enabled)
     * @param {string} taskText - Task description from the sidebar input
     * @returns {Promise<void>}
     */
    async runStandaloneTask(taskText) {
        const config = vscode.workspace.getConfiguration('autoAntigravity');

        // 워처 임시 중지 (독립 작업 중 중복 리뷰 방지)
        this._stopCodeReviewWatcher();

        this._addLog(`[Ralph] 🚀 ═══ 독립 작업 시작 ═══`);
        this._addLog(`[Ralph] 📋 작업: ${taskText.substring(0, 100)}`);

        try {
            // 1. Send /write-prd prompt
            const prompt = `/write-prd ${taskText}`;
            this._addLog('[Ralph] 📤 에이전트에 프롬프트 전송 중...');
            await this._sendToAgent(prompt);
            this._addLog('[Ralph] ✅ 에이전트에 프롬프트 전송 완료');

            // 2. Wait for agent completion
            this._addLog('[Ralph] ⏳ 에이전트 작업 완료 대기...');
            await this._waitForAgentCompletion();
            this._addLog('[Ralph] ✅ 에이전트 작업 완료');


            // 4. Code Review (if enabled)
            const enableCodeReview = config.get('ralphLoop.enableCodeReview', false);
            if (enableCodeReview) {
                await this.runCodeReview(taskText, 0);
            }

            this._addLog(`[Ralph] 🚀 ═══ 독립 작업 완료 ═══`);
        } finally {
            // 워처 재시작
            this._startCodeReviewWatcherIfEnabled();
        }
    }

    /**
     * Run code review stage using the configured model.
     * Can be called independently (from sidebar) or from Ralph Loop.
     *
     * 항상 이전 대화 내용을 기반으로 리뷰를 수행한다.
     * 변경된 파일이 있으면 diff 정보도 포함.
     * 취소 시(_codeReviewCancelled) 즉시 중단하고 원래 모델로 복원.
     *
     * @param {string} taskText - The task that was completed (or conversation summary for watcher)
     * @param {number} [iteration=0] - Current iteration number
     * @param {{ isFromWatcher?: boolean }} [options] - Additional options
     * @returns {Promise<void>}
     */
    async runCodeReview(taskText, iteration = 0, options = {}) {
        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        const { isFromWatcher = false } = options;

        this._addLog('[Ralph] 📝 ═══ 코드 리뷰 시작 ═══');
        this._codeReviewRunning = true;

        // 0. Git 변경사항 사전 확인
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let diffSummary = { hasChanges: false, changedFiles: [], diffStat: '' };
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.gitManager._workspaceRoot = this.gitManager._workspaceRoot || workspaceFolders[0].uri.fsPath;
            diffSummary = this.gitManager.getUncommittedDiffSummary();
        }

        if (diffSummary.hasChanges) {
            this._addLog(`[Ralph] 📊 변경 파일 ${diffSummary.changedFiles.length}개 감지`);
        } else {
            this._addLog('[Ralph] 📊 변경된 파일 없음 — 이전 대화 내용 기반으로 리뷰 진행');
        }

        // 취소 확인
        if (this._codeReviewCancelled) {
            this._addLog('[Ralph] ⚠ 코드 리뷰 취소됨');
            this._addLog('[Ralph] 📝 ═══ 코드 리뷰 완료 (취소) ═══');
            return;
        }

        // 1. Get current model (to restore later)
        const originalModel = await this._getCurrentModel();
        this._addLog(`[Ralph] 📌 현재 모델: ${originalModel || '알 수 없음'}`);

        // 2. Switch to configured model for code review
        const codeReviewModel = vscode.workspace.getConfiguration('autoAntigravity').get('codeReview.model', 'flash');
        this._addLog(`[Ralph] 🔄 코드 리뷰 모델: ${codeReviewModel}`);
        const switched = await this._switchModel(codeReviewModel);
        if (!switched) {
            this._addLog(`[Ralph] ⚠ ${codeReviewModel} 모델 전환 실패 — 현재 모델로 리뷰 진행`, 'warn');
        }

        await delay(1000);

        try {
            // 취소 확인
            if (this._codeReviewCancelled) {
                this._addLog('[Ralph] ⚠ 코드 리뷰 취소됨');
                return;
            }

            // 3. Build and send code review prompt
            const promptContext = {
                hasChanges: diffSummary.hasChanges,
                changedFiles: diffSummary.changedFiles,
                diffStat: diffSummary.diffStat,
            };
            const prompt = this._buildCodeReviewPrompt(taskText, iteration, promptContext);
            this._addLog('[Ralph] 📤 코드 리뷰 프롬프트 전송 중...');
            await this._sendToAgent(prompt);
            this._addLog('[Ralph] ✅ 코드 리뷰 프롬프트 전송 완료');

            // 취소 확인
            if (this._codeReviewCancelled) {
                this._addLog('[Ralph] ⚠ 코드 리뷰 취소됨 — 에이전트 응답 대기 건너뜀');
                return;
            }

            // 4. Wait for agent to complete
            this._addLog('[Ralph] ⏳ 코드 리뷰 에이전트 작업 완료 대기...');
            await this._waitForAgentCompletion();
            this._addLog('[Ralph] ✅ 코드 리뷰 에이전트 작업 완료');

        } finally {
            // 5. 항상 원래 모델로 복원 (취소/에러 시에도)
            if (originalModel && switched) {
                const restoreKeyword = this._extractModelKeyword(originalModel);
                if (restoreKeyword) {
                    this._addLog(`[Ralph] 🔄 원래 모델로 복원: ${restoreKeyword}`);
                    try {
                        await this._switchModel(restoreKeyword);
                        await delay(500);
                    } catch (e) {
                        this._addLog(`[Ralph] ⚠ 모델 복원 실패: ${e.message}`, 'warn');
                    }
                }
            }

            this._codeReviewRunning = false;
            this._addLog('[Ralph] 📝 ═══ 코드 리뷰 완료 ═══');
        }
    }
}

module.exports = { RalphLoopManager, LoopState };

