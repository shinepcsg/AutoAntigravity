// AutoAntigravity — Telemetry Service
// Connects to Antigravity language_server local API to fetch AI model quota usage.
// Reference: https://github.com/llegomark/ag-telemetry

const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const { platform } = require('os');

const execAsync = promisify(exec);

class TelemetryService {
    constructor(log) {
        this._log = log || (() => { });
        this._uplink = { connected: false, port: null, token: null };
        this._models = [];
        this._pollTimer = null;
        this._listeners = [];
        this._isConnecting = false;
    }

    // ─── Public API ──────────────────────────────────────────────────

    /** Subscribe to quota updates. Returns unsubscribe function. */
    onUpdate(callback) {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter(cb => cb !== callback);
        };
    }

    /** Get current data snapshot */
    getData() {
        return {
            connected: this._uplink.connected,
            models: this._models
        };
    }

    /** Start periodic polling */
    startPolling(intervalSec = 90) {
        this.stopPolling();
        this._log('[Telemetry] Polling started (every ' + intervalSec + 's)');
        // Initial fetch
        this._connectAndFetch();
        this._pollTimer = setInterval(() => this._connectAndFetch(), intervalSec * 1000);
    }

    /** Stop periodic polling */
    stopPolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }

    /** Manual refresh */
    async refresh() {
        return this._connectAndFetch();
    }

    /** Cleanup */
    dispose() {
        this.stopPolling();
        this._listeners = [];
    }

    // ─── Internal ────────────────────────────────────────────────────

    async _connectAndFetch() {
        if (this._isConnecting) return;
        this._isConnecting = true;
        try {
            // Re-establish uplink if not connected
            if (!this._uplink.connected) {
                const ok = await this._establishUplink();
                if (!ok) {
                    this._emit();
                    return;
                }
            }
            // Fetch quota data
            const data = await this._fetchUserStatus();
            if (data) {
                this._models = this._parseModels(data);
                this._uplink.connected = true;
            } else {
                // Connection lost, try to re-establish next time
                this._uplink.connected = false;
            }
            this._emit();
        } catch (err) {
            this._log('[Telemetry] Error: ' + err.message);
            this._uplink.connected = false;
            this._emit();
        } finally {
            this._isConnecting = false;
        }
    }

    _emit() {
        const data = this.getData();
        for (const cb of this._listeners) {
            try { cb(data); } catch (e) { /* ignore */ }
        }
    }

    /** Find language_server process and extract CSRF token */
    async _establishUplink() {
        try {
            const beacon = await this._findBeacon();
            if (!beacon) {
                this._log('[Telemetry] language_server not found');
                this._uplink = { connected: false, port: null, token: null };
                return false;
            }

            const ports = await this._getListeningPorts(beacon.pid);
            if (ports.length === 0) {
                this._log('[Telemetry] No listening ports found for PID ' + beacon.pid);
                this._uplink = { connected: false, port: null, token: null };
                return false;
            }

            // Probe each port to find the right one
            for (const port of ports) {
                const ok = await this._probePort(port, beacon.token);
                if (ok) {
                    this._log('[Telemetry] Connected on port ' + port);
                    this._uplink = { connected: true, port, token: beacon.token };
                    return true;
                }
            }

            this._log('[Telemetry] Could not find active API port');
            this._uplink = { connected: false, port: null, token: null };
            return false;
        } catch (err) {
            this._log('[Telemetry] Uplink error: ' + err.message);
            this._uplink = { connected: false, port: null, token: null };
            return false;
        }
    }

    /** Find the language_server process and extract PID + CSRF token */
    async _findBeacon() {
        const os = platform();
        let output;
        try {
            if (os === 'win32') {
                const { stdout } = await execAsync(
                    'powershell -NoProfile -Command "Get-CimInstance Win32_Process | ' +
                    "Where-Object {$_.Name -like '*language_server*'} | " +
                    'Select-Object ProcessId,CommandLine | ConvertTo-Json"',
                    { timeout: 8000 }
                );
                output = stdout;
            } else {
                const { stdout } = await execAsync(
                    'ps -axo pid,args | grep -i language_server | grep -v grep',
                    { timeout: 8000 }
                );
                output = stdout;
            }
        } catch {
            return null;
        }

        return this._extractBeacon(output, os);
    }

    _extractBeacon(raw, os) {
        if (!raw || !raw.trim()) return null;

        const tokenRegex = /--csrf[_-]?token[=\s]+([a-f0-9-]+)/ig;
        const findToken = (text) => {
            tokenRegex.lastIndex = 0;
            let match, token = null;
            while ((match = tokenRegex.exec(text)) !== null) {
                if (match[1] && /^[a-f0-9-]+$/i.test(match[1])) {
                    token = match[1];
                }
            }
            return token;
        };

        if (os === 'win32') {
            try {
                const data = JSON.parse(raw);
                const procs = Array.isArray(data) ? data : [data];
                for (const proc of procs) {
                    const cmdLine = typeof proc.CommandLine === 'string' ? proc.CommandLine : '';
                    const token = findToken(cmdLine);
                    const pid = Number(proc.ProcessId);
                    if (token && pid > 0) {
                        return { pid, token };
                    }
                }
            } catch { return null; }
        } else {
            const lines = raw.trim().split('\n');
            for (const line of lines) {
                const token = findToken(line);
                if (!token) continue;
                const pidMatch = line.trim().match(/^(\d+)/);
                if (pidMatch) {
                    const pid = parseInt(pidMatch[1], 10);
                    if (pid > 0) return { pid, token };
                }
            }
        }
        return null;
    }

    /** Get TCP listening ports for a PID */
    async _getListeningPorts(pid) {
        const os = platform();
        let output;
        try {
            if (os === 'win32') {
                const { stdout } = await execAsync(
                    `powershell -NoProfile -Command "Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort"`,
                    { timeout: 5000 }
                );
                output = stdout;
            } else if (os === 'darwin') {
                const { stdout } = await execAsync(
                    `lsof -iTCP -sTCP:LISTEN -a -p ${pid} -Fn 2>/dev/null | grep '^n' | sed 's/n\\*://'`,
                    { timeout: 5000 }
                );
                output = stdout;
            } else {
                const { stdout } = await execAsync(
                    `ss -tlnp 2>/dev/null | grep -F "pid=${pid}," | awk '{print $4}' | rev | cut -d: -f1 | rev`,
                    { timeout: 5000 }
                );
                output = stdout;
            }
        } catch {
            return [];
        }

        const ports = new Set();
        for (const line of output.split('\n')) {
            const port = parseInt(line.trim(), 10);
            if (port > 0 && port < 65536) ports.add(port);
        }
        return Array.from(ports).sort((a, b) => a - b).slice(0, 32);
    }

    /** Probe a port to verify it's the language server API */
    _probePort(port, token) {
        return new Promise(resolve => {
            const payload = JSON.stringify({
                context: { properties: { ide: 'antigravity' } }
            });

            const req = https.request({
                hostname: '127.0.0.1',
                port,
                path: '/exa.language_server_pb.LanguageServerService/GetUnleashData',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Connect-Protocol-Version': '1',
                    'X-Codeium-Csrf-Token': token
                },
                rejectUnauthorized: false,
                timeout: 3000
            }, res => {
                let data = '';
                res.on('data', chunk => {
                    data += chunk;
                    if (data.length > 64 * 1024) { res.destroy(); resolve(false); }
                });
                res.on('end', () => resolve(res.statusCode === 200));
                res.on('error', () => resolve(false));
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.write(payload);
            req.end();
        });
    }

    /** Fetch user status from the language server */
    _fetchUserStatus() {
        return new Promise(resolve => {
            const { port, token } = this._uplink;
            if (!port || !token) { resolve(null); return; }

            const payload = JSON.stringify({
                metadata: { ideName: 'antigravity' }
            });

            const req = https.request({
                hostname: '127.0.0.1',
                port,
                path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Connect-Protocol-Version': '1',
                    'X-Codeium-Csrf-Token': token
                },
                rejectUnauthorized: false,
                timeout: 5000
            }, res => {
                if (res.statusCode !== 200) {
                    res.resume();
                    resolve(null);
                    return;
                }
                let body = '';
                res.on('data', chunk => {
                    body += chunk;
                    if (body.length > 1024 * 1024) { res.destroy(); resolve(null); }
                });
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); }
                    catch { resolve(null); }
                });
                res.on('error', () => resolve(null));
            });

            req.on('error', () => resolve(null));
            req.on('timeout', () => { req.destroy(); resolve(null); });
            req.write(payload);
            req.end();
        });
    }

    /** Parse API response into simple model array */
    _parseModels(raw) {
        const configs = raw?.userStatus?.cascadeModelConfigData?.clientModelConfigs;
        if (!Array.isArray(configs)) return [];

        const models = [];
        for (const cfg of configs) {
            if (!cfg || typeof cfg.label !== 'string' || !cfg.label.trim()) continue;

            const label = cfg.label.trim().substring(0, 128);
            let remaining = 0;
            let resetTime = null;

            if (cfg.quotaInfo) {
                const frac = cfg.quotaInfo.remainingFraction;
                if (typeof frac === 'number' && Number.isFinite(frac)) {
                    remaining = Math.max(0, Math.min(1, frac));
                }
                if (typeof cfg.quotaInfo.resetTime === 'string') {
                    resetTime = cfg.quotaInfo.resetTime;
                }
            }

            models.push({
                label: this._formatLabel(label),
                remaining,       // 0.0 ~ 1.0
                resetTime        // ISO string or null
            });
        }

        return this._groupModels(models).sort((a, b) => a.remaining - b.remaining);
    }

    /**
     * Group models by provider.
     * - "Claude" group: Claude Sonnet, Claude Opus, GPT OSS
     * - "Gemini" group: Gemini Pro, Gemini Flash
     * Ungrouped models remain as-is.
     */
    _groupModels(models) {
        const GROUP_RULES = [
            {
                name: 'Claude',
                test: (label) => /claude/i.test(label) || /gpt\s*oss/i.test(label)
            },
            {
                name: 'Gemini',
                test: (label) => /gemini/i.test(label)
            }
        ];

        // Bucket models into groups
        /** @type {Map<string, {remaining: number, resetTime: string|null, members: string[]}>} */
        const groups = new Map();
        const ungrouped = [];

        for (const m of models) {
            const rule = GROUP_RULES.find(r => r.test(m.label));
            if (rule) {
                if (!groups.has(rule.name)) {
                    groups.set(rule.name, { remaining: m.remaining, resetTime: m.resetTime, members: [] });
                }
                const g = groups.get(rule.name);
                // Use the minimum remaining across the group (most constrained)
                g.remaining = Math.min(g.remaining, m.remaining);
                // Use the earliest resetTime
                if (m.resetTime) {
                    if (!g.resetTime || new Date(m.resetTime) < new Date(g.resetTime)) {
                        g.resetTime = m.resetTime;
                    }
                }
                g.members.push(m.label);
            } else {
                ungrouped.push(m);
            }
        }

        // Convert groups back to model-like objects
        const result = [];
        for (const [name, g] of groups) {
            result.push({
                label: name,
                remaining: g.remaining,
                resetTime: g.resetTime,
                isGroup: true,
                members: g.members
            });
        }
        return [...result, ...ungrouped];
    }

    /** Clean up model label */
    _formatLabel(label) {
        return label.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    }
}

module.exports = { TelemetryService };
