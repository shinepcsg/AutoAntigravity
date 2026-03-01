// AutoAntigravity — Ralph Loop Main Logic
// Iterative AI agent execution with persistent memory

const vscode = require('vscode');
const { TaskFileManager } = require('./TaskFileManager');
const { ProgressTracker } = require('./ProgressTracker');

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

        this.state = LoopState.IDLE;
        this.currentIteration = 0;
        this.loopTimer = null;
        this.onStateChange = null; // callback for UI updates

        // 로그 버퍼 — 사이드바에 표시
        this._logBuffer = [];
        this._maxLogLines = 100;

        // 에러 추적
        this.lastError = null;
        this.consecutiveErrors = 0;
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
        this._notifyStateChange();
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
            this.taskManager.setTaskFile(files[0].fsPath);
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

        this.state = LoopState.RUNNING;
        this.consecutiveErrors = 0;
        this.lastError = null;
        this.progressTracker.initializeProgressFile();
        this.currentIteration = this.progressTracker.getLastIteration();

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

        this.state = LoopState.STOPPING;
        this._addLog('[Ralph] ⏹ 루프 정지 요청 — 현재 반복 마무리 중...');
        this._notifyStateChange();

        if (this.loopTimer) {
            clearTimeout(this.loopTimer);
            this.loopTimer = null;
        }

        this.state = LoopState.IDLE;
        vscode.window.showInformationMessage('⏹ Ralph Loop stopped.');
        this._addLog('[Ralph] ⏹ 루프가 정지되었습니다.');
        this._notifyStateChange();
    }

    /**
     * Emergency stop — immediate halt
     */
    emergencyStop() {
        this._addLog('[Ralph] ⚠ 긴급 정지!', 'error');

        if (this.loopTimer) {
            clearTimeout(this.loopTimer);
            this.loopTimer = null;
        }

        this.state = LoopState.IDLE;
        vscode.window.showWarningMessage('🛑 Ralph Loop EMERGENCY STOPPED');
        this._notifyStateChange();
    }

    /**
     * Dispose / cleanup
     */
    dispose() {
        this.emergencyStop();
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
            this.state = LoopState.IDLE;
            this._notifyStateChange();
            return;
        }

        // Check consecutive errors — stop after 3
        if (this.consecutiveErrors >= 3) {
            const msg = `❌ 연속 ${this.consecutiveErrors}회 에러 발생 — 루프를 자동 정지합니다.`;
            this._addLog(`[Ralph] ${msg}`, 'error');
            vscode.window.showErrorMessage(`Ralph Loop: ${msg}\n마지막 에러: ${this.lastError}`);
            this.state = LoopState.IDLE;
            this._notifyStateChange();
            return;
        }

        // Get next task
        const task = this.taskManager.getNextTask();
        if (!task) {
            this._addLog('[Ralph] ✅ 모든 작업이 완료되었습니다!');
            vscode.window.showInformationMessage('🎉 Ralph Loop: All tasks completed!');
            this.state = LoopState.IDLE;
            this._notifyStateChange();
            return;
        }

        this.currentIteration++;
        const progress = this.taskManager.getProgress();
        this._addLog(`[Ralph] ═══ 반복 ${this.currentIteration} ═══`);
        this._addLog(`[Ralph] 작업: ${task.text}`);
        this._addLog(`[Ralph] 진행: ${progress.completed}/${progress.total}`);
        this._notifyStateChange();

        try {
            // Build the prompt for the agent
            const prompt = this._buildAgentPrompt(task, this.currentIteration, progress);

            // Send to Antigravity agent via chat
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
            this._addLog(`[Ralph] ✅ 작업 완료: ${task.text}`);

            // Auto-commit
            const committed = await this.progressTracker.autoCommit(this.currentIteration, task.text);
            if (committed) {
                this._addLog('[Ralph] 📦 Git 커밋 완료');
            }

            // Reset consecutive errors on success
            this.consecutiveErrors = 0;
            this.lastError = null;

        } catch (e) {
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

        this._notifyStateChange();

        // Schedule next iteration
        if (this.state === LoopState.RUNNING) {
            const delay = config.get('ralphLoop.iterationDelayMs', 3000);
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

        let prompt = `# Ralph Loop — Iteration ${iteration}\n\n`;
        prompt += `## Current Task\n${task.text}\n\n`;
        prompt += `## Progress\n- Completed: ${progress.completed}/${progress.total}\n- Remaining: ${progress.remaining}\n\n`;
        prompt += `## Instructions\n`;
        prompt += `1. Read the task file at \`${taskFilePath}\` for full context\n`;
        prompt += `2. Check progress at \`${progressFilePath}\` for what's been done\n`;
        prompt += `3. Complete EXACTLY ONE task: "${task.text}"\n`;
        prompt += `4. Do NOT modify the progress file — it is managed automatically\n`;
        prompt += `5. When done, verify your changes work correctly\n`;

        return prompt;
    }

    /**
     * Send prompt to Antigravity agent
     * Opens a new chat and actually SUBMITS the prompt (not just filling the input)
     */
    async _sendToAgent(prompt) {
        try {
            // 1. 새 채팅을 열고 프롬프트를 입력란에 채움
            await vscode.commands.executeCommand(
                'workbench.action.chat.open',
                { query: prompt }
            );

            // 잠시 대기 — 채팅 패널이 열리고 입력이 채워질 때까지
            await new Promise(r => setTimeout(r, 1500));

            // 2. 입력을 실제로 전송 (Accept Input = Enter 키 역할)
            try {
                await vscode.commands.executeCommand('workbench.action.chat.acceptInput');
                this._addLog('[Ralph] ✅ 채팅 입력 전송됨 (acceptInput)');
            } catch (e1) {
                // acceptInput이 안 되면 submit 시도
                this._addLog(`[Ralph] ⚠ acceptInput 실패: ${e1.message}, submit 대체 시도...`, 'warn');
                try {
                    await vscode.commands.executeCommand('workbench.action.chat.submit');
                    this._addLog('[Ralph] ✅ 채팅 입력 전송됨 (submit)');
                } catch (e2) {
                    // 마지막 시도: 키바인딩으로 Enter 입력
                    this._addLog(`[Ralph] ⚠ submit도 실패: ${e2.message}, Enter 키 시뮬레이션 시도...`, 'warn');
                    try {
                        await vscode.commands.executeCommand('type', { text: '\n' });
                        this._addLog('[Ralph] ✅ Enter 키 시뮬레이션으로 전송됨');
                    } catch (e3) {
                        throw new Error(`채팅 전송 실패 — 모든 방법 시도함: acceptInput(${e1.message}), submit(${e2.message}), type(${e3.message})`);
                    }
                }
            }

        } catch (e) {
            this._addLog(`[Ralph] ❌ 에이전트 전송 실패: ${e.message}`, 'error');

            // Fallback: 새 채팅 생성 후 재시도
            this._addLog('[Ralph] 🔄 대체 방법으로 재시도 중...', 'warn');
            try {
                await vscode.commands.executeCommand('workbench.action.chat.newChat');
                await new Promise(r => setTimeout(r, 1000));
                await vscode.commands.executeCommand(
                    'workbench.action.chat.open',
                    { query: prompt }
                );
                await new Promise(r => setTimeout(r, 1500));
                await vscode.commands.executeCommand('workbench.action.chat.acceptInput');
                this._addLog('[Ralph] ✅ 대체 방법으로 전송 성공');
            } catch (e2) {
                const errorMsg = `에이전트 전송 완전 실패: ${e2.message}`;
                this._addLog(`[Ralph] ❌ ${errorMsg}`, 'error');
                vscode.window.showErrorMessage(`Ralph Loop: ${errorMsg}`);
                throw new Error(errorMsg);
            }
        }
    }

    /**
     * Wait for the agent to finish working
     * Uses a heuristic: monitor file system activity to detect completion
     */
    async _waitForAgentCompletion() {
        const config = vscode.workspace.getConfiguration('autoAntigravity');

        // Simple heuristic: wait for a minimum period, then check for inactivity
        // The agent's Auto Accept feature will handle the step-by-step acceptance
        const MIN_WAIT_MS = 30000; // 30s minimum per task
        const MAX_WAIT_MS = 300000; // 5 min maximum per task
        const CHECK_INTERVAL_MS = 5000;
        const INACTIVITY_THRESHOLD_MS = 15000;

        let lastActivityTime = Date.now();
        let elapsed = 0;

        // Set up a file system watcher for activity detection
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolders[0], '**/*')
        );

        const updateActivity = () => { lastActivityTime = Date.now(); };
        watcher.onDidChange(updateActivity);
        watcher.onDidCreate(updateActivity);
        watcher.onDidDelete(updateActivity);

        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                elapsed += CHECK_INTERVAL_MS;
                const timeSinceActivity = Date.now() - lastActivityTime;

                // Stop conditions
                if (this.state !== LoopState.RUNNING) {
                    clearInterval(checkInterval);
                    watcher.dispose();
                    this._addLog('[Ralph] ⚠ 루프 상태 변경 — 대기 취소');
                    resolve();
                    return;
                }

                // Past minimum wait and agent seems idle
                if (elapsed >= MIN_WAIT_MS && timeSinceActivity >= INACTIVITY_THRESHOLD_MS) {
                    this._addLog(`[Ralph] 에이전트 유휴 감지 (${Math.round(timeSinceActivity / 1000)}초 비활성)`);
                    clearInterval(checkInterval);
                    watcher.dispose();
                    resolve();
                    return;
                }

                // Maximum wait exceeded
                if (elapsed >= MAX_WAIT_MS) {
                    this._addLog('[Ralph] ⚠ 최대 대기 시간 초과 — 다음 반복으로 이동', 'warn');
                    clearInterval(checkInterval);
                    watcher.dispose();
                    resolve();
                    return;
                }

                if (elapsed % 15000 === 0) {
                    this._addLog(`[Ralph] ⏳ 에이전트 대기 중... (${Math.round(elapsed / 1000)}초 경과)`);
                }
            }, CHECK_INTERVAL_MS);
        });
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
