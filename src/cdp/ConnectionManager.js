// AutoAntigravity — CDP Connection Manager
// Persistent browser-level WebSocket connection with session pooling.

const http = require('http');
const WebSocket = require('ws');
const { buildDOMObserverScript } = require('../scripts/DOMObserver');

class ConnectionManager {
    /**
     * @param {Object} options
     * @param {Function} options.log - Logging function
     * @param {Function} options.getPort - Returns configured CDP port
     * @param {Function} options.getCustomTexts - Returns custom button texts array
     */
    constructor({ log, getPort, getCustomTexts }) {
        this.log = log;
        this.getPort = getPort;
        this.getCustomTexts = getCustomTexts;

        this.ws = null;
        this.msgId = 0;
        this.pending = new Map();
        this.sessions = new Map();
        this.ignoredTargets = new Set();
        this.activeCdpPort = null;

        this.isRunning = false;
        this.isConnecting = false;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
    }

    // ─── Public API ───────────────────────────────────────────────────

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.log('[CDP] Connection manager starting');
        this.connect();
    }

    stop() {
        this.isRunning = false;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
        this._closeWebSocket();
        this.sessions.clear();
        this.ignoredTargets.clear();
        this._clearPending();
        this.log('[CDP] Connection manager stopped');
    }

    getSessionCount() {
        return this.sessions.size;
    }

    getActivePort() {
        return this.activeCdpPort;
    }

    // ─── Connection Lifecycle ─────────────────────────────────────────

    async connect() {
        if (!this.isRunning || this.isConnecting) return;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        this.isConnecting = true;

        try {
            const port = await this._findActivePort();
            if (!port) {
                this._scheduleReconnect();
                return;
            }

            const wsUrl = await this._getBrowserWsUrl(port);
            if (!wsUrl) {
                this._scheduleReconnect();
                return;
            }

            await this._establishConnection(wsUrl);
        } catch (e) {
            this.log(`[CDP] Connection error: ${e.message}`);
            this._scheduleReconnect();
        } finally {
            this.isConnecting = false;
        }
    }

    _establishConnection(wsUrl) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            const timeout = setTimeout(() => {
                try { ws.close(); } catch (e) { }
                reject(new Error('Connection timeout'));
            }, 10000);

            ws.on('open', async () => {
                clearTimeout(timeout);
                this.ws = ws;
                this.log('[CDP] Persistent connection established');

                try {
                    await this._initializeTargetDiscovery();
                    this.heartbeatTimer = setInterval(() => this._heartbeat(), 30000);
                    resolve();
                } catch (e) {
                    this.log(`[CDP] Initialization error: ${e.message}`);
                    ws.close();
                    reject(e);
                }
            });

            ws.on('message', (raw) => this._onMessage(raw));
            ws.on('close', () => {
                clearTimeout(timeout);
                this._onClose();
            });
            ws.on('error', () => { });
        });
    }

    // ─── Message Handling ─────────────────────────────────────────────

    _onMessage(raw) {
        try {
            const msg = JSON.parse(raw.toString());

            if (msg.id && this.pending.has(msg.id)) {
                const handler = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                clearTimeout(handler.timer);
                handler.resolve(msg);
                return;
            }

            switch (msg.method) {
                case 'Target.targetCreated':
                    this._handleNewTarget(msg.params.targetInfo);
                    break;
                case 'Target.targetDestroyed':
                    this._handleTargetDestroyed(msg.params.targetId);
                    break;
                case 'Target.detachedFromTarget':
                    this._handleSessionDetached(msg.params?.sessionId);
                    break;
                case 'Runtime.executionContextsCleared':
                    if (msg.sessionId) this._reinjectForSession(msg.sessionId);
                    break;
            }
        } catch (e) { }
    }

    _onClose() {
        this.log('[CDP] Connection closed');
        this.ws = null;
        this.sessions.clear();
        this.ignoredTargets.clear();
        this._clearPending();
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;

        if (this.isRunning) {
            this._scheduleReconnect();
        }
    }

    // ─── Target Discovery & Session Management ────────────────────────

    async _initializeTargetDiscovery() {
        await this._send('Target.setDiscoverTargets', { discover: true });

        const msg = await this._send('Target.getTargets');
        const targets = msg.result?.targetInfos || [];
        this.log(`[CDP] Found ${targets.length} targets`);

        const candidates = targets.filter(t => this._isCandidate(t));
        await Promise.allSettled(candidates.map(t => this._handleNewTarget(t)));

        this.log(`[CDP] ${this.sessions.size} sessions active after initial scan`);
    }

    _isCandidate(targetInfo) {
        const { url, type } = targetInfo;
        if (!url) return false;
        return type === 'page' ||
            url.includes('vscode-webview://') ||
            url.includes('webview') ||
            type === 'iframe';
    }

    async _handleNewTarget(targetInfo) {
        const { targetId, type, url } = targetInfo;
        if (!this._isCandidate(targetInfo)) return;
        if (this.sessions.has(targetId)) return;
        if (this.ignoredTargets.has(targetId)) return;

        const shortId = targetId.substring(0, 6);

        try {
            const attachMsg = await this._send('Target.attachToTarget', { targetId, flatten: true });
            const sessionId = attachMsg.result?.sessionId;
            if (!sessionId) return;

            await this._send('Runtime.enable', {}, sessionId).catch(() => { });

            if (type === 'page') {
                const domCheck = await this._send('Runtime.evaluate', {
                    expression: 'typeof document !== "undefined" ? document.title || "has-dom" : "no-dom"'
                }, sessionId);
                const domResult = domCheck.result?.result?.value;
                if (!domResult || domResult === 'no-dom') {
                    await this._send('Target.detachFromTarget', { sessionId }).catch(() => { });
                    this.ignoredTargets.add(targetId);
                    return;
                }
            }

            const result = await this._injectObserver(sessionId);

            if (result === 'not-agent-panel') {
                await this._send('Target.detachFromTarget', { sessionId }).catch(() => { });
                this.ignoredTargets.add(targetId);
                return;
            }

            this.sessions.set(targetId, sessionId);
            this.log(`[CDP] ✓ Attached [${shortId}] → ${result} (${(url || '').substring(0, 50)})`);
        } catch (e) { }
    }

    _handleTargetDestroyed(targetId) {
        if (this.sessions.has(targetId)) {
            this.sessions.delete(targetId);
            this.log(`[CDP] Target destroyed [${targetId.substring(0, 6)}]`);
        }
        this.ignoredTargets.delete(targetId);
    }

    _handleSessionDetached(sessionId) {
        if (!sessionId) return;
        for (const [tid, sid] of this.sessions) {
            if (sid === sessionId) {
                this.sessions.delete(tid);
                this.log(`[CDP] Session detached [${tid.substring(0, 6)}]`);
                break;
            }
        }
    }

    // ─── Observer Injection ───────────────────────────────────────────

    async _injectObserver(sessionId) {
        const script = buildDOMObserverScript(this.getCustomTexts());
        const evalMsg = await this._send('Runtime.evaluate', { expression: script }, sessionId);
        return evalMsg.result?.result?.value || 'undefined';
    }

    async _reinjectForSession(sessionId) {
        let targetId = null;
        for (const [tid, sid] of this.sessions) {
            if (sid === sessionId) { targetId = tid; break; }
        }
        if (!targetId) return;

        const shortId = targetId.substring(0, 6);

        try {
            await new Promise(r => setTimeout(r, 500));
            const result = await this._injectObserver(sessionId);
            if (result && result !== 'not-agent-panel') {
                this.log(`[CDP] ✓ Re-injected [${shortId}] → ${result}`);
            }
        } catch (e) { }
    }

    // ─── CDP Protocol Transport ───────────────────────────────────────

    _send(method, params = {}, sessionId = null) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('not connected'));
                return;
            }
            const id = ++this.msgId;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`timeout: ${method}`));
            }, 5000);
            this.pending.set(id, { resolve, reject, timer });
            const payload = { id, method, params };
            if (sessionId) payload.sessionId = sessionId;
            this.ws.send(JSON.stringify(payload));
        });
    }

    // ─── Health & Reconnection ────────────────────────────────────────

    _scheduleReconnect() {
        if (this.reconnectTimer || !this.isRunning) return;
        this.log('[CDP] Reconnecting in 3s...');
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.isRunning) this.connect();
        }, 3000);
    }

    async _heartbeat() {
        try {
            const msg = await this._send('Target.getTargets');
            const targets = msg.result?.targetInfos || [];
            this.log(`[CDP] Heartbeat: ${targets.length} targets, ${this.sessions.size} sessions`);

            const candidates = targets.filter(t =>
                this._isCandidate(t) &&
                !this.sessions.has(t.targetId) &&
                !this.ignoredTargets.has(t.targetId)
            );
            if (candidates.length > 0) {
                this.log(`[CDP] ${candidates.length} new targets found, attaching...`);
                await Promise.allSettled(candidates.map(t => this._handleNewTarget(t)));
            }
        } catch (e) { }
    }

    // ─── Port Discovery ───────────────────────────────────────────────

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

    _getBrowserWsUrl(port) {
        return new Promise((resolve, reject) => {
            const req = http.get({ hostname: '127.0.0.1', port, path: '/json/version', timeout: 800 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const info = JSON.parse(data);
                        resolve(info.webSocketDebuggerUrl || null);
                    } catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
    }

    async _findActivePort() {
        if (this.activeCdpPort && await this._pingPort(this.activeCdpPort)) {
            return this.activeCdpPort;
        }

        const configPort = this.getPort();
        if (await this._pingPort(configPort)) {
            this.activeCdpPort = configPort;
            return configPort;
        }

        return null;
    }

    // ─── Cleanup Helpers ──────────────────────────────────────────────

    _closeWebSocket() {
        if (this.ws) {
            try { this.ws.close(); } catch (e) { }
            this.ws = null;
        }
    }

    _clearPending() {
        for (const [id, handler] of this.pending) {
            clearTimeout(handler.timer);
        }
        this.pending.clear();
    }
}

module.exports = { ConnectionManager };
