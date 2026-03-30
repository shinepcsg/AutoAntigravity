// AutoAntigravity — Auto Accept Module
// VS Code Commands API polling + CDP connection management

const vscode = require('vscode');
const cp = require('child_process');
const http = require('http');
const { ConnectionManager } = require('./cdp/ConnectionManager');

// Antigravity-specific accept commands
const ACCEPT_COMMANDS = [
    'antigravity.agent.acceptAgentStep',
    'antigravity.terminalCommand.accept',
    'antigravity.terminalCommand.run',
    'antigravity.terminalCommand.runAll',
    'antigravity.command.accept',
    'antigravity.command.runAll',
    'workbench.action.chat.acceptInput',
    'workbench.action.chat.submit',
    'workbench.action.terminal.chat.runCommand',
    'workbench.action.terminal.chat.runFirstCommand',
    'chatEditing.acceptAllFiles',
    'notification.acceptPrimaryAction'
];

class AutoAcceptManager {
    constructor(log) {
        this.log = log;
        this.isEnabled = false;
        this.pollIntervalId = null;
        this.connectionManager = null;
        // Idle mode: slow down polling when no buttons have been clicked recently
        this._lastAcceptTime = 0;
        this._idleThresholdMs = 30000; // 30 seconds
    }

    initialize() {
        this.connectionManager = new ConnectionManager({
            log: this.log,
            getPort: () => this._getConfiguredPort(),
            getCustomTexts: () => vscode.workspace.getConfiguration('autoAntigravity')
                .get('autoAccept.customButtonTexts', [])
        });
    }

    async checkAndFixCDP(extensionMode) {
        const configPort = this._getConfiguredPort();

        if (await this._pingPort(configPort)) {
            this.log(`[CDP] Debug port ${configPort} active ✓`);
            this.cdpAvailable = true;
            return true;
        }

        // 포트 병렬 스캔 (connectionManager.start() 없이 — isRunning 오염 방지)
        this.log(`[CDP] Port ${configPort} not responding — scanning nearby ports...`);
        const scanRange = 20;
        const portsToScan = [];
        for (let p = Math.max(1024, configPort - scanRange); p <= Math.min(65535, configPort + scanRange); p++) {
            if (p !== configPort) portsToScan.push(p);
        }
        const results = await Promise.all(
            portsToScan.map(p => this._pingPort(p).then(ok => ({ p, ok })))
        );
        const found = results.find(r => r.ok);
        if (found) {
            this.log(`[CDP] ✓ Auto-discovered CDP on port ${found.p}`);
            this.cdpAvailable = true;
            return true;
        }

        // CDP 포트를 찾지 못해도 soft-fail: VS Code 명령 API 폴링은 계속 가능
        this.log(`[CDP] ⚠ No CDP port found — AutoAccept will run in VS Code command-only mode`);
        this.cdpAvailable = false;
        
        // 윈도우 환경에서 CDP 포트가 안 열려있으면 단축키 자동 패치를 시도합니다.
        // F5 디버깅 환경(ExtensionMode.Development === 2)에서는 단축키 기반이 아니므로 패치를 스킵.
        if (extensionMode !== 2) {
            this._applyWindowsPatch(configPort);
        }

        return true;
    }

    toggle() {
        this.isEnabled = !this.isEnabled;
        if (this.isEnabled) {
            this._startPolling();
        } else {
            this._stopPolling();
        }
        return this.isEnabled;
    }

    enable() {
        if (!this.isEnabled) {
            this.isEnabled = true;
            this._startPolling(); // resumeActiveScanning + start 포함
        }
    }

    disable() {
        if (this.isEnabled) {
            this.isEnabled = false;
            this._stopPolling(); // pauseActiveScanning + stop 포함
        }
    }

    dispose() {
        this._stopPolling();
    }

    // ─── Internal ─────────────────────────────────────────────────────

    _getConfiguredPort() {
        return vscode.workspace.getConfiguration('autoAntigravity').get('autoAccept.cdpPort', 9559);
    }

    _startPolling() {
        if (this.pollIntervalId) return;

        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const baseInterval = config.get('autoAccept.pollInterval', 1000);
        this.log(`[AutoAccept] Polling started (every ${baseInterval}ms, ${ACCEPT_COMMANDS.length} commands)`);

        let lastDiagLog = 0;
        const DIAG_INTERVAL = 30000; // Log diagnostics every 30s

        const pollCycle = async () => {
            if (!this.isEnabled) return;
            try {
                // VS Code 명령 API로 활성 탭/네이티브 인라인 버튼 클릭 (CDP와 독립적으로 항상 실행)
                // 터미널 프롬프트나 에디터 인라인 패널은 CDP 웹뷰 대상이 아니므로 이 폴링이 필수적입니다.
                await Promise.allSettled(
                    ACCEPT_COMMANDS.map(cmd =>
                        vscode.commands.executeCommand(cmd)
                            .then(r => ({ cmd, status: 'ok', result: r }))
                    )
                );

                // Periodic diagnostic logging
                const now = Date.now();
                if (now - lastDiagLog > DIAG_INTERVAL) {
                    lastDiagLog = now;
                    const cdpStatus = this.connectionManager
                        ? `CDP: port=${this.connectionManager.getActivePort() || 'none'}, sessions=${this.connectionManager.getSessionCount()}`
                        : 'CDP: not initialized';
                    const idleMode = (now - this._lastAcceptTime > this._idleThresholdMs) ? 'idle' : 'active';
                    this.log(`[AutoAccept] Heartbeat — ${cdpStatus}, mode=${idleMode}, poll=cmd-always`);
                }
            } catch (e) { /* silent */ }
            if (this.isEnabled) {
                // Adaptive interval: slower when idle (no recent button clicks)
                const isIdle = (Date.now() - this._lastAcceptTime) > this._idleThresholdMs;
                const interval = isIdle ? baseInterval * 2 : baseInterval;
                this.pollIntervalId = setTimeout(pollCycle, interval);
            }
        };
        this.pollIntervalId = setTimeout(pollCycle, baseInterval);

        if (this.connectionManager && this.cdpAvailable !== false) {
            this.connectionManager.resumeActiveScanning();
            this.connectionManager.start();
        }
    }

    _stopPolling() {
        if (this.pollIntervalId) {
            clearTimeout(this.pollIntervalId);
            this.pollIntervalId = null;
        }
        if (this.connectionManager) {
            this.connectionManager.pauseActiveScanning();
            this.connectionManager.stop();
        }
        this.log('[AutoAccept] Polling stopped');
    }

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

    _applyWindowsPatch(targetPort) {
        if (process.platform !== 'win32') {
            vscode.window.showInformationMessage('Auto-patching is Windows-only. Use the Manual Guide.');
            return;
        }

        const psContent = `
$flag = "--remote-debugging-port=${targetPort}"
$WshShell = New-Object -comObject WScript.Shell
$paths = @(
    "$env:USERPROFILE\\\\Desktop",
    "$env:PUBLIC\\\\Desktop",
    "$env:APPDATA\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs",
    "$env:ALLUSERSPROFILE\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs",
    "$env:APPDATA\\\\Microsoft\\\\Internet Explorer\\\\Quick Launch\\\\User Pinned\\\\TaskBar"
)
$patched = $false
$manualFixNeeded = $false
$patchedLnk = $null

foreach ($dir in $paths) {
    if (Test-Path $dir) {
        $files = Get-ChildItem -Path $dir -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            try {
                $shortcut = $WshShell.CreateShortcut($file.FullName)
                if ($file.Name -match "Antigravity" -or $shortcut.TargetPath -match "Antigravity") {
                    if ($shortcut.Arguments -match "--remote-debugging-port=") {
                        if ($shortcut.Arguments -notmatch $flag) {
                            $manualFixNeeded = $true
                        } else {
                            if (-not $patchedLnk) { $patchedLnk = $file.FullName }
                        }
                    } else {
                        $shortcut.Arguments = ("$($shortcut.Arguments) " + $flag).Trim()
                        $shortcut.Save()
                        $patched = $true
                        if (-not $patchedLnk) { $patchedLnk = $file.FullName }
                    }
                }
            } catch { }
        }
    }
}
if ($manualFixNeeded) { Write-Output "MANUAL_NEEDED" }
elseif ($patched) { Write-Output "PATCHED|$patchedLnk" }
elseif ($patchedLnk) { Write-Output "ALREADY_PATCHED|$patchedLnk" }
else { Write-Output "NOT_FOUND" }
`;

        const base64Script = Buffer.from(psContent, 'utf16le').toString('base64');

        this.log(`[CDP] Running fileless shortcut patcher for port ${targetPort}...`);
        cp.exec(`powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64Script}`,
            { windowsHide: true },
            (err, stdout) => {
                if (err) {
                    this.log(`[CDP] Patcher error: ${err.message}`);
                    vscode.window.showWarningMessage('Shortcut patching failed. Please add the flag manually.');
                    return;
                }
                const out = stdout.trim();
                this.log(`[CDP] Patcher output: ${out}`);
                if (out.includes('MANUAL_NEEDED')) {
                    vscode.window.showWarningMessage(
                        `Your shortcut already has a debugging port. Please manually change it to ${targetPort}.`
                    );
                } else if (out.includes('PATCHED|')) {
                    const lnkPath = out.split('PATCHED|')[1].trim();
                    this.log(`[CDP] ✓ Shortcut patched: ${lnkPath}`);
                    vscode.window.showInformationMessage(
                        `✅ Shortcut ready! Restart Antigravity to activate AutoAccept.`,
                        'Restart Now'
                    ).then(action => {
                        if (action === 'Restart Now') {
                            vscode.commands.executeCommand('workbench.action.quit');
                        }
                    });
                } else if (out.includes('ALREADY_PATCHED|')) {
                    const lnkPath = out.split('ALREADY_PATCHED|')[1].trim();
                    this.log(`[CDP] ✓ Shortcut already has the correct port: ${lnkPath}`);
                } else {
                    this.log('[CDP] No matching shortcuts found');
                    vscode.window.showWarningMessage(
                        `No Antigravity shortcut found. Add --remote-debugging-port=${targetPort} to your shortcut manually.`
                    );
                }
            });
    }
}

module.exports = { AutoAcceptManager };
