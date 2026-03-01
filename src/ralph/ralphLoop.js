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

        // ExtensionContext — workspaceState 영속 저장용 (워크스페이스별)
        this._context = null;
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
     * Check if the Antigravity agent is currently busy via CDP DOM inspection
     * Focuses ONLY on Stop button existence — simplest and most reliable approach
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
                    '      info += " [SVG:" + (b.innerHTML || "").replace(/\\s+/g," ").substring(0,80) + "]";',
                    '    }',
                    '    all.push(info);',
                    '  }',
                    '  return JSON.stringify({ buttons: all });',
                    '})()',
                ].join('\n')
                : [
                    '(function() {',
                    '  var bodyText = document.body.innerText || "";',
                    '  if (bodyText.includes("Model quota reached") && bodyText.includes("refresh on")) {',
                    '    var match = bodyText.match(/refresh on (.*?)\\./);',
                    '    if (match) {',
                    '      return JSON.stringify({ busy: true, reason: "quota", refreshTime: match[1] });',
                    '    }',
                    '  }',
                    '  var btns = document.querySelectorAll("button");',
                    '  for (var i = 0; i < btns.length; i++) {',
                    '    var b = btns[i];',
                    '    var rect = b.getBoundingClientRect();',
                    '    if (rect.width === 0 || rect.height === 0) continue;',
                    '    var label = (b.getAttribute("aria-label") || "").toLowerCase();',
                    '    var title = (b.getAttribute("title") || "").toLowerCase();',
                    '    var text = (b.textContent || "").toLowerCase().trim();',
                    '    var combined = label + " " + title + " " + text;',
                    '    if (combined.includes("stop") || combined.includes("cancel") ||',
                    '        combined.includes("중지") || combined.includes("취소") ||',
                    '        combined.includes("interrupt")) {',
                    '      if (combined.includes("breakpoint") || combined.includes("debug") ||',
                    '          combined.includes("close") || combined.includes("hide")) continue;',
                    '      return JSON.stringify({ busy: true, reason: "stop_button", detail: (label || title || text).substring(0, 50) });',
                    '    }',
                    '    if (combined.includes("generating") || combined.includes("planning") || combined.includes("searching") || combined.includes("reading") || combined.includes("editing") || combined.includes("analyzing")) {',
                    '      return JSON.stringify({ busy: true, reason: "thinking", detail: text.substring(0, 50) });',
                    '    }',
                    '    if (combined.includes("thinking") || combined.includes("thought")) {',
                    '      if (combined.includes(" for ")) continue;',
                    '      return JSON.stringify({ busy: true, reason: "thinking", detail: text.substring(0, 50) });',
                    '    }',
                    '  }',
                    '  var bodyLen = (document.body.innerText || "").length;',
                    '  var prev = window.__ralphContentLen || 0;',
                    '  window.__ralphContentLen = bodyLen;',
                    '  if (prev > 0 && bodyLen > prev + 5) {',
                    '    return JSON.stringify({ busy: true, reason: "content_growing", detail: "+" + (bodyLen - prev) + " chars" });',
                    '  }',
                    '  return JSON.stringify({ busy: false });',
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
     * Send prompt to Antigravity agent — FULLY CDP-BASED
     * 1. Get CDP target matching CURRENT workspace name
     * 2. CDP Ctrl+L → new chat session
     * 3. Runtime.evaluate → find chat textarea + focus + insert text (all in one call)
     * 4. CDP Enter → submit
     */
    async _sendToAgent(prompt) {
        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        // ─── Step 1: Get CDP target matching CURRENT workspace ───
        const mainTarget = await this._findMainTarget(true);
        const targetWsUrl = mainTarget.webSocketDebuggerUrl;

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

        // ─── Step 3: Store prompt → find textarea → focus → insert text ───
        // All done via Runtime.evaluate to prevent focus from being stolen
        try {
            await this._cdpSendCommand(targetWsUrl, 'Runtime.evaluate', {
                expression: 'window.__ralphPrompt = ' + JSON.stringify(prompt) + ';',
                returnByValue: true
            }, 5000);
        } catch (e) {
            throw new Error('프롬프트 전달 실패: ' + e.message);
        }

        try {
            const result = await this._cdpSendCommand(targetWsUrl, 'Runtime.evaluate', {
                expression: [
                    '(function() {',
                    '  var text = window.__ralphPrompt;',
                    '  delete window.__ralphPrompt;',
                    '  if (!text) return "ERROR:no_prompt";',
                    '',

                    '  // Phase 1: Try Antigravity contenteditable chat input FIRST',

                    '  var ceSelectors = [',

                    '    ".cursor-text[contenteditable]",',

                    '    ".cursor-text[role]",',

                    '    "[contenteditable].rounded",',

                    '    "[role]",',

                    '    "[contenteditable]:not(.xterm-helper-textarea)",',

                    '  ];',

                    '  for (var i = 0; i < ceSelectors.length; i++) {',

                    '    var ce = document.querySelector(ceSelectors[i]);',

                    '    if (ce) {',

                    '      ce.focus();',

                    '      var ok = document.execCommand("insertText", false, text);',

                    '      if (ok) return "OK:ce:execCmd:" + ceSelectors[i];',

                    '      ce.textContent = text;',

                    '      ce.dispatchEvent(new Event("input", { bubbles: true }));',

                    '      return "OK:ce:textContent:" + ceSelectors[i];',

                    '    }',

                    '  }',

                    '',

                    '  // Phase 2: Try specific chat textarea selectors (standard VS Code)',

                    '  var taSelectors = [',

                    '    ".interactive-input-part .monaco-editor textarea",',

                    '    ".interactive-input-editor .monaco-editor textarea",',

                    '    ".chat-input-part .monaco-editor textarea",',

                    '    ".interactive-input-part textarea",',

                    '    ".chat-editor-input textarea",',

                    '    ".part.panel .interactive-session .monaco-editor textarea",',

                    '  ];',

                    '  for (var j = 0; j < taSelectors.length; j++) {',

                    '    var el = document.querySelector(taSelectors[j]);',

                    '    if (el) {',

                    '      el.focus();',

                    '      var ok2 = document.execCommand("insertText", false, text);',

                    '      if (ok2) return "OK:ta:execCmd:" + taSelectors[j];',

                    '      el.value = text;',

                    '      el.dispatchEvent(new Event("input", { bubbles: true }));',

                    '      return "OK:ta:setValue:" + taSelectors[j];',

                    '    }',

                    '  }',

                    '',

                    '  // NOT FOUND - debug info',

                    '  var ta = document.querySelectorAll("textarea").length;',

                    '  var ce2 = document.querySelectorAll("[contenteditable]").length;',

                    '  var tb = document.querySelectorAll("[role]").length;',

                    '  return "NOT_FOUND|ta=" + ta + "|ce=" + ce2 + "|tb=" + tb;',
                    '})()',
                ].join('\n'),
                returnByValue: true
            }, 15000);

            const val = (result && result.result) ? result.result.value : JSON.stringify(result);
            this._addLog('[Ralph] 텍스트 삽입: ' + val);

            if (typeof val === 'string' && (val.startsWith('NOT_FOUND') || val.startsWith('ERROR'))) {
                throw new Error(val);
            }
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
     * Uses CDP to check Stop button existence — when Stop button disappears, agent is done
     */
    async _waitForAgentCompletion() {
        const MAX_WAIT_MS = 300000;       // 5분 최대
        const POLL_INTERVAL_MS = 3000;    // 3초마다 폴링
        const INITIAL_WAIT_MS = 10000;    // 에이전트 시작 대기 10초
        const IDLE_CONFIRMS_NEEDED = 3;   // 연속 3회 idle 확인 필요

        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        // CDP 타겟 찾기
        let targetWsUrl;
        try {
            const target = await this._findMainTarget(false);
            targetWsUrl = target.webSocketDebuggerUrl;
            this._addLog('[Ralph] 📡 CDP Stop 버튼 모니터링 시작');
        } catch (e) {
            this._addLog('[Ralph] ⚠ CDP 타겟 찾기 실패 — 시간 기반 대기(60초)로 대체: ' + e.message, 'warn');
            await delay(60000);
            return;
        }

        // 에이전트가 시작할 시간 확보
        this._addLog('[Ralph] ⏳ 에이전트 시작 대기 (' + (INITIAL_WAIT_MS / 1000) + '초)...');
        await delay(INITIAL_WAIT_MS);

        // ── 첫 폴링: 진단 모드로 DOM 버튼 전체 로그 ──
        const diag = await this._isAgentBusy(targetWsUrl, true);
        if (diag.buttons && diag.buttons.length > 0) {
            this._addLog('[Ralph] 🔍 DOM 버튼 진단 (' + diag.buttons.length + '개):');
            diag.buttons.forEach((btn, idx) => {
                this._addLog('[Ralph]   [' + idx + '] ' + btn);
            });
        } else {
            this._addLog('[Ralph] 🔍 DOM 버튼 진단: 버튼 없음');
        }

        let elapsed = INITIAL_WAIT_MS;
        let consecutiveIdleCount = 0;
        let everSeenBusy = false;

        while (elapsed < MAX_WAIT_MS) {
            // 루프 상태 확인
            if (this.state !== LoopState.RUNNING) {
                this._addLog('[Ralph] ⚠ 루프 상태 변경 — 대기 취소');
                return;
            }

            // CDP로 Stop 버튼 존재 확인
            const status = await this._isAgentBusy(targetWsUrl);

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

                // Stop 버튼 발견 — 에이전트 작업 중
                consecutiveIdleCount = 0;
                everSeenBusy = true;

                if (elapsed % 15000 < POLL_INTERVAL_MS) {
                    this._addLog('[Ralph] 🔄 에이전트 작업 중 — ' + (status.reason || 'unknown') + ' (' +
                        (status.detail || '') + ', ' + Math.round(elapsed / 1000) + '초 경과)');
                }
            } else {
                // Stop 버튼 없음 — 에이전트 유휴
                consecutiveIdleCount++;

                if (consecutiveIdleCount >= IDLE_CONFIRMS_NEEDED) {
                    this._addLog('[Ralph] ✅ 에이전트 완료 감지 — Stop 버튼 ' +
                        consecutiveIdleCount + '회 연속 미발견 (' +
                        Math.round(elapsed / 1000) + '초 경과, everBusy=' + everSeenBusy + ')');
                    return;
                }

                this._addLog('[Ralph] ⏳ Stop 버튼 미발견 (' +
                    consecutiveIdleCount + '/' + IDLE_CONFIRMS_NEEDED + ')');
            }

            await delay(POLL_INTERVAL_MS);
            elapsed += POLL_INTERVAL_MS;
        }

        this._addLog('[Ralph] ⚠ 최대 대기 시간 초과 (' + (MAX_WAIT_MS / 1000) + '초) — 다음 반복으로 이동', 'warn');
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
