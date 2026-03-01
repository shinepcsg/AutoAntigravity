// AutoAntigravity — Ralph Loop Main Logic
// Iterative AI agent execution with persistent memory
// Uses CDP (Chrome DevTools Protocol) to inject prompts into Antigravity chat

const vscode = require('vscode');
const http = require('http');
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

        // CDP 관련
        this._connectionManager = null; // shared from AutoAccept
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

        // Verify CDP connectivity before starting
        const cdpPort = this._getCdpPort();
        const cdpOk = await this._pingPort(cdpPort);
        if (!cdpOk) {
            const msg = `CDP 포트 ${cdpPort}에 연결할 수 없습니다. Antigravity를 --remote-debugging-port=${cdpPort} 옵션과 함께 시작해야 합니다.`;
            this._addLog(`[Ralph] ❌ ${msg}`, 'error');
            vscode.window.showErrorMessage(`Ralph Loop: ${msg}`);
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
     * Send a CDP command to a target via HTTP (one-shot, no persistent WS needed)
     * Uses the /json endpoint to find pages, then connects via WS for a single eval
     */
    async _cdpEvaluateOnTarget(targetWsUrl, expression, timeout = 10000) {
        // Use the MiniWebSocket from ConnectionManager, or a simple net-based approach
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
                reject(new Error('CDP evaluate timeout'));
            }, timeout);

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

                    // Send Runtime.evaluate command
                    const cmd = JSON.stringify({
                        id: msgId,
                        method: 'Runtime.evaluate',
                        params: { expression, returnByValue: true }
                    });
                    const payload = Buffer.from(cmd, 'utf-8');
                    const maskKey = crypto.randomBytes(4);
                    let header2;
                    if (payload.length < 126) {
                        header2 = Buffer.alloc(2);
                        header2[0] = 0x81; // FIN + text
                        header2[1] = 0x80 | payload.length;
                    } else if (payload.length < 65536) {
                        header2 = Buffer.alloc(4);
                        header2[0] = 0x81;
                        header2[1] = 0x80 | 126;
                        header2.writeUInt16BE(payload.length, 2);
                    } else {
                        header2 = Buffer.alloc(10);
                        header2[0] = 0x81;
                        header2[1] = 0x80 | 127;
                        header2.writeBigUInt64BE(BigInt(payload.length), 2);
                    }
                    const masked = Buffer.alloc(payload.length);
                    for (let i = 0; i < payload.length; i++) {
                        masked[i] = payload[i] ^ maskKey[i & 3];
                    }
                    socket.write(Buffer.concat([header2, maskKey, masked]));

                    // Process any remaining data in buffer
                    if (buffer.length > 0) {
                        tryParseResponse();
                    }
                    return;
                }

                tryParseResponse();
            });

            function tryParseResponse() {
                while (buffer.length >= 2) {
                    const firstByte = buffer[0];
                    const secondByte = buffer[1];
                    const masked = (secondByte & 0x80) !== 0;
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

                    if (masked) offset += 4;
                    if (buffer.length < offset + payloadLen) return;

                    let payload = buffer.slice(offset, offset + payloadLen);
                    if (masked) {
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
     * Send prompt to Antigravity agent via CDP
     * Finds the chat panel webview via CDP targets, then injects the prompt
     * into the chat textarea and submits it with a synthetic Enter keypress.
     */
    async _sendToAgent(prompt) {
        const cdpPort = this._getCdpPort();

        // 1. Get all CDP targets
        let targets;
        try {
            targets = await this._getTargets(cdpPort);
        } catch (e) {
            throw new Error(`CDP 타겟 조회 실패 (port ${cdpPort}): ${e.message}`);
        }

        if (!targets || targets.length === 0) {
            throw new Error(`CDP 타겟이 없습니다 (port ${cdpPort})`);
        }

        this._addLog(`[Ralph] CDP 타겟 ${targets.length}개 발견`);

        // 2. Escape the prompt for safe injection into JavaScript string
        const escapedPrompt = prompt
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');

        // 3. Build the injection script that finds and fills the chat input
        const injectionScript = `
(function() {
    // Strategy 1: Look for a textarea or contenteditable in the chat panel
    var selectors = [
        'textarea[class*="chat"]',
        'textarea[class*="input"]',
        'textarea[placeholder]',
        'div[contenteditable="true"][class*="chat"]',
        'div[contenteditable="true"][class*="input"]',
        'div[contenteditable="true"]',
        'textarea'
    ];

    var input = null;
    for (var i = 0; i < selectors.length; i++) {
        var candidates = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < candidates.length; j++) {
            var el = candidates[j];
            if (el.offsetParent !== null && !el.disabled && !el.readOnly) {
                input = el;
                break;
            }
        }
        if (input) break;
    }

    if (!input) {
        return JSON.stringify({ success: false, error: 'chat-input-not-found', selectors: selectors.length });
    }

    var promptText = '${escapedPrompt}';

    // Fill the input
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
        // For native textarea/input, use nativeInputValueSetter if available
        var nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        );
        if (nativeSetter && nativeSetter.set) {
            nativeSetter.set.call(input, promptText);
        } else {
            input.value = promptText;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        // contenteditable
        input.textContent = promptText;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Wait a moment for React/framework to process the input
    return new Promise(function(resolve) {
        setTimeout(function() {
            // Submit via Enter key
            var enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            input.dispatchEvent(enterEvent);

            // Also try form submit if input is inside a form
            var form = input.closest('form');
            if (form) {
                try { form.requestSubmit(); } catch(e) { }
            }

            resolve(JSON.stringify({
                success: true,
                element: input.tagName,
                className: (input.className || '').substring(0, 100)
            }));
        }, 300);
    });
})()`;

        // 4. Try each target to find one with a chat input
        let lastError = null;
        const candidateTargets = targets.filter(t =>
            t.type === 'page' ||
            (t.url && (t.url.includes('vscode-webview://') || t.url.includes('webview')))
        );

        // Also try all targets if no candidates matched
        const allTargets = candidateTargets.length > 0 ? candidateTargets : targets;

        for (const target of allTargets) {
            if (!target.webSocketDebuggerUrl) continue;

            try {
                const result = await this._cdpEvaluateOnTarget(
                    target.webSocketDebuggerUrl,
                    injectionScript,
                    8000
                );

                if (result && result.result) {
                    let value = result.result.value;
                    if (typeof value === 'string') {
                        try { value = JSON.parse(value); } catch (e) { }
                    }

                    if (value && value.success) {
                        this._addLog(`[Ralph] ✅ CDP로 채팅 입력 완료 (${value.element}, target: ${(target.url || '').substring(0, 50)})`);
                        return; // Success!
                    }

                    if (value && value.error === 'chat-input-not-found') {
                        // This target doesn't have the chat input, try next
                        continue;
                    }
                }
            } catch (e) {
                lastError = e.message;
                // Try next target
            }
        }

        // 5. If CDP injection didn't work, try VS Code command API as fallback
        this._addLog('[Ralph] ⚠ CDP 직접 주입 실패, VS Code 커맨드 API 폴백 시도...', 'warn');

        // Try various Antigravity-specific commands
        const chatCommands = [
            'antigravity.chat.open',
            'antigravity.chat.new',
            'antigravity.newConversation',
            'workbench.panel.chat.view.copilot.focus',
        ];

        for (const cmd of chatCommands) {
            try {
                await vscode.commands.executeCommand(cmd);
                this._addLog(`[Ralph] 채팅 열기 성공: ${cmd}`);
                await new Promise(r => setTimeout(r, 1000));
                break;
            } catch (e) {
                // Try next command
            }
        }

        // Try to submit via command
        const submitCommands = [
            'antigravity.chat.submit',
            'antigravity.chat.acceptInput',
        ];

        for (const cmd of submitCommands) {
            try {
                await vscode.commands.executeCommand(cmd, { text: prompt });
                this._addLog(`[Ralph] ✅ 커맨드로 전송 성공: ${cmd}`);
                return;
            } catch (e) {
                // Try next
            }
        }

        throw new Error(`채팅 입력 전송 실패 — CDP ${allTargets.length}개 타겟 시도, 마지막 에러: ${lastError || 'unknown'}`);
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
