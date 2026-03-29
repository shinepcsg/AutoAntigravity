const vscode = require('vscode');
const http = require('http');

class CdpClient {
    constructor(logFn) {
        this.log = logFn || (() => {});
        this._discoveredCdpPort = null;
        this._lastAgentTargetWsUrl = null;
    }

    _addLog(msg, level = 'info') {
        this.log(msg, level);
    }

    setLastAgentTargetWsUrl(url) {
        this._lastAgentTargetWsUrl = url;
    }

    getLastAgentTargetWsUrl() {
        return this._lastAgentTargetWsUrl;
    }

    getCdpPort() {
        return vscode.workspace.getConfiguration('autoAntigravity').get('autoAccept.cdpPort', 9559);
    }

    pingPort(port) {
        return new Promise((resolve) => {
            const req = http.get({ hostname: '127.0.0.1', port, path: '/json/version', timeout: 800 }, (res) => {
                res.on('data', () => { });
                res.on('end', () => resolve(true));
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
        });
    }

    async findActiveCdpPort() {
        if (this._discoveredCdpPort && await this.pingPort(this._discoveredCdpPort)) {
            return this._discoveredCdpPort;
        }

        const configPort = this.getCdpPort();
        if (await this.pingPort(configPort)) {
            this._discoveredCdpPort = configPort;
            return configPort;
        }

        const scanRange = 100;
        const startPort = Math.max(1024, configPort - scanRange);
        const endPort = Math.min(65535, configPort + scanRange);
        const batchSize = 20;

        for (let base = startPort; base <= endPort; base += batchSize) {
            const ports = [];
            for (let p = base; p < Math.min(base + batchSize, endPort + 1); p++) {
                if (p === configPort) continue;
                ports.push(p);
            }
            const results = await Promise.all(
                ports.map(async (p) => ({ port: p, ok: await this.pingPort(p) }))
            );
            const found = results.find(r => r.ok);
            if (found) {
                this._addLog(`[Ralph] ✓ CDP 포트 자동 감지: ${found.port} (설정: ${configPort})`);
                this._discoveredCdpPort = found.port;
                return found.port;
            }
        }
        return null;
    }

    getTargets(port) {
        return new Promise((resolve, reject) => {
            const req = http.get({ hostname: '127.0.0.1', port, path: '/json', timeout: 3000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
    }

    async sendCommand(targetWsUrl, method, params, timeout = 10000) {
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

                    const cmd = JSON.stringify({ id: msgId, method, params });
                    sendWsFrame(cmd);

                    if (buffer.length > 0) tryParseResponse();
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

    async evaluateOnTarget(targetWsUrl, expression, timeout = 10000) {
        return this.sendCommand(targetWsUrl, 'Runtime.evaluate', {
            expression,
            returnByValue: true
        }, timeout);
    }

    async findMainTarget(verbose = false) {
        const cdpPort = await this.findActiveCdpPort();
        if (!cdpPort) {
            throw new Error('CDP 포트 없음 — 설정 포트(' + this.getCdpPort() + ') 및 근처 포트 스캔 실패');
        }
        let targets;
        try {
            targets = await this.getTargets(cdpPort);
        } catch (e) {
            throw new Error('CDP 타겟 조회 실패 (port ' + cdpPort + '): ' + e.message);
        }

        const workspaceName = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
            ? vscode.workspace.workspaceFolders[0].name : '';

        if (verbose) {
            this._addLog('[Ralph] 워크스페이스: "' + workspaceName + '", CDP 타겟 수: ' + targets.length);
        }

        const pageTargets = targets.filter(t => t.type === 'page');
        if (verbose) {
            for (const t of pageTargets) {
                this._addLog('[Ralph]   타겟: ' + (t.title || 'no-title').substring(0, 70));
            }
        }

        let mainTarget = null;
        if (workspaceName) {
            mainTarget = pageTargets.find(t => t.url && t.url.includes('workbench.html') && !t.url.includes('jetski-agent') && t.title && t.title.includes(workspaceName));
        }

        if (!mainTarget) {
            mainTarget = pageTargets.find(t => t.url && t.url.includes('workbench.html') && !t.url.includes('jetski-agent'));
            if (mainTarget && verbose) {
                this._addLog('[Ralph] ⚠ 워크스페이스 매칭 실패 — 첫 번째 workbench 타겟 사용', 'warn');
            }
        }

        if (!mainTarget) {
            mainTarget = pageTargets.find(t => t.webSocketDebuggerUrl);
        }

        if (!mainTarget || !mainTarget.webSocketDebuggerUrl) {
            throw new Error('CDP 타겟 없음 (' + targets.length + '개 중 page 없음)');
        }

        if (verbose) {
            this._addLog('[Ralph] ✅ 선택된 타겟: ' + (mainTarget.title || '').substring(0, 60));
        }

        return mainTarget;
    }

    async findAllWorkbenchTargets() {
        const cdpPort = await this.findActiveCdpPort();
        if (!cdpPort) return [];
        let targets;
        try {
            targets = await this.getTargets(cdpPort);
        } catch (e) {
            return [];
        }

        const workspaceName = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
            ? vscode.workspace.workspaceFolders[0].name : '';

        let filtered = targets.filter(t => t.type === 'page' && t.url && t.url.includes('workbench.html') && !t.url.includes('jetski-agent') && t.webSocketDebuggerUrl);

        if (workspaceName) {
            const wsFiltered = filtered.filter(t => t.title && t.title.includes(workspaceName));
            if (wsFiltered.length > 0) {
                filtered = wsFiltered;
            }
        }

        return filtered;
    }

    async cancelAllActiveConversations() {
        const cdpPort = await this.findActiveCdpPort();
        if (!cdpPort) {
            this._addLog(`[Ralph] ❌ cancelAllActiveConversations: CDP 포트 없음 — 스캔 실패`, 'error');
            return { cancelled: 0, total: 0 };
        }
        let targets;
        try {
            targets = await this.getTargets(cdpPort);
        } catch (e) {
            this._addLog(`[Ralph] ❌ cancelAllActiveConversations: CDP 타겟 조회 실패 — ${e.message}`, 'error');
            return { cancelled: 0, total: 0 };
        }

        const pageTargets = targets.filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
        const total = pageTargets.length;
        let cancelled = 0;

        this._addLog(`[Ralph] 🔍 cancelAllActiveConversations: ${total}개 page 타겟 검사 시작`);

        const cancelExpression = [
            '(function() {',
            '  var btn = document.querySelector("[data-tooltip-id=input-send-button-cancel-tooltip]");',
            '  if (btn) {',
            '    btn.click();',
            '    return JSON.stringify({ clicked: true });',
            '  }',
            '  return JSON.stringify({ clicked: false });',
            '})()'
        ].join('\n');

        for (const target of pageTargets) {
            const targetLabel = (target.title || target.url || 'unknown').substring(0, 60);
            try {
                const result = await this.evaluateOnTarget(target.webSocketDebuggerUrl, cancelExpression, 5000);
                if (result && result.result && result.result.value) {
                    const parsed = JSON.parse(result.result.value);
                    if (parsed.clicked) {
                        cancelled++;
                        this._addLog(`[Ralph] ✅ Cancel 클릭 성공: ${targetLabel}`);
                    } else {
                        this._addLog(`[Ralph] ⏭ Cancel 버튼 없음 (유휴 상태): ${targetLabel}`);
                    }
                } else {
                    this._addLog(`[Ralph] ⏭ 평가 결과 없음: ${targetLabel}`);
                }
            } catch (e) {
                this._addLog(`[Ralph] ⚠ 타겟 처리 에러 무시: ${targetLabel} — ${e.message}`, 'warn');
            }
        }

        this._addLog(`[Ralph] 📊 cancelAllActiveConversations 완료: ${cancelled}/${total}개 대화 취소됨`);
        return { cancelled, total };
    }

    async isAgentBusy(targetWsUrl, diagnostic = false) {
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
                    '    var ces = document.querySelectorAll("[contenteditable]");',
                    '    inputInfo.totalContentEditable = ces.length;',
                    '  }',
                    '  return JSON.stringify({ buttons: all, inputState: inputInfo });',
                    '})()'
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
                    '  var cancelDiv = document.querySelector("[data-tooltip-id=input-send-button-cancel-tooltip]");',
                    '  if (cancelDiv) {',
                    '    return JSON.stringify({ busy: true, reason: "cancel_btn_present", detail: "Cancel/Stop div found" });',
                    '  }',
                    '  var sendBtn = document.querySelector("button[data-tooltip-id=input-send-button-send-tooltip]");',
                    '  if (sendBtn) {',
                    '    var isDisabled = sendBtn.disabled || sendBtn.hasAttribute("disabled");',
                    '    if (isDisabled) {',
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
                    '  return JSON.stringify({ busy: true, reason: "no_btn_found", detail: "Neither send nor cancel button found" });',
                    '})()'
                ].join('\n');

            const result = await this.sendCommand(targetWsUrl, 'Runtime.evaluate', {
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

    async getLastAgentResponse() {
        let wsUrl = this._lastAgentTargetWsUrl;
        if (!wsUrl) {
            try {
                const target = await this.findMainTarget(false);
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
            const result = await this.evaluateOnTarget(wsUrl, `
                (function() {
                    var MAX_LEN = 4000;
                    function truncate(text) {
                        text = (text || '').trim();
                        if (!text) return null;
                        return text.length > MAX_LEN ? text.substring(0, MAX_LEN) + '...' : text;
                    }

                    var selectors = [
                        '[data-role="assistant"]',
                        '[data-turn-role="assistant"]',
                        '.assistant-message',
                        '.ai-message',
                        '.response-markdown',
                        '.chat-response-content',
                        '.agent-response',
                        '.assistant-message .message-content',
                        '.chat-message-content',
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
                        } catch (e) { }
                    }

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
                        } catch (e) { }
                    }

                    var chatInput = document.querySelector('.cursor-text[contenteditable]');
                    if (chatInput) {
                        var container = chatInput;
                        for (var up = 0; up < 8 && container.parentElement; up++) {
                            container = container.parentElement;
                        }
                        var blocks = container.querySelectorAll('div, section, article');
                        var candidates = [];
                        for (var b = 0; b < blocks.length; b++) {
                            var block = blocks[b];
                            if (block.querySelector('.cursor-text[contenteditable]')) continue;
                            if (block.getAttribute('contenteditable')) continue;
                            var blockText = (block.innerText || '').trim();
                            if (blockText.length > 50 && block.children.length > 0) {
                                candidates.push({ el: block, len: blockText.length });
                            }
                        }
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

    async checkResponseForToolQuota(targetWsUrl) {
        const wsUrl = targetWsUrl || this._lastAgentTargetWsUrl;
        if (!wsUrl) return null;

        try {
            const result = await this.evaluateOnTarget(wsUrl, `
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
            if (!val) return null;
            let parsed;
            try { parsed = JSON.parse(val); } catch (e) { return null; }

            if (!parsed.quotaHit) return null;

            this._addLog(`[Ralph] 🔍 에이전트 응답에서 도구 쿼터 에러 감지 (RESOURCE_EXHAUSTED)`, 'warn');

            let waitMs = 30 * 60 * 1000;
            let refreshLabel = '약 30분 후';

            if (parsed.resetTimestamp) {
                const resetDate = new Date(parsed.resetTimestamp);
                const now = new Date();
                const diff = resetDate.getTime() - now.getTime();
                if (!isNaN(diff) && diff > 0) {
                    waitMs = diff + 10000;
                    refreshLabel = parsed.resetTimestamp;
                } else if (!isNaN(diff) && diff <= 0) {
                    waitMs = 60 * 1000;
                    refreshLabel = '리셋 시간 경과 (1분 후 재시도)';
                }
            } else if (parsed.resetDelay) {
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

            return { quotaHit: true, waitMs, refreshLabel, wsUrl };

        } catch (e) {
            this._addLog(`[Ralph] ⚠ 도구 쿼터 체크 중 에러 (무시): ${e.message}`, 'warn');
            return null;
        }
    }
}

module.exports = { CdpClient };
