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
    'antigravity.command.accept',
];

class AutoAcceptManager {
    constructor(log) {
        this.log = log;
        this.isEnabled = false;
        this.pollIntervalId = null;
        this.connectionManager = null;
    }

    initialize() {
        this.connectionManager = new ConnectionManager({
            log: this.log,
            getPort: () => this._getConfiguredPort(),
            getCustomTexts: () => vscode.workspace.getConfiguration('autoAntigravity')
                .get('autoAccept.customButtonTexts', [])
        });
    }

    async checkAndFixCDP() {
        const configPort = this._getConfiguredPort();

        if (await this._pingPort(configPort)) {
            this.log(`[CDP] Debug port ${configPort} active ✓`);
            return true;
        }

        this.log(`[CDP] ⚠ Port ${configPort} refused — remote debugging not enabled`);
        vscode.window.showErrorMessage(
            `⚡ AutoAntigravity needs Debug Mode (Port ${configPort}). Please apply the fix or update your shortcut.`,
            'Auto-Fix Shortcut (Windows)',
            'Manual Guide'
        ).then(action => {
            if (action === 'Auto-Fix Shortcut (Windows)') this._applyWindowsPatch(configPort);
            else if (action === 'Manual Guide') vscode.env.openExternal(
                vscode.Uri.parse('https://github.com/yazanbaker94/AntiGravity-AutoAccept#setup')
            );
        });
        return false;
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
            this._startPolling();
        }
    }

    disable() {
        if (this.isEnabled) {
            this.isEnabled = false;
            this._stopPolling();
        }
    }

    dispose() {
        this._stopPolling();
    }

    // ─── Internal ─────────────────────────────────────────────────────

    _getConfiguredPort() {
        return vscode.workspace.getConfiguration('autoAntigravity').get('autoAccept.cdpPort', 9333);
    }

    _startPolling() {
        if (this.pollIntervalId) return;

        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const interval = config.get('autoAccept.pollInterval', 500);
        this.log(`[AutoAccept] Polling started (every ${interval}ms, ${ACCEPT_COMMANDS.length} commands)`);

        const pollCycle = async () => {
            if (!this.isEnabled) return;
            try {
                const timeoutPromise = new Promise(resolve => setTimeout(resolve, 500));
                const commandsPromise = Promise.allSettled(
                    ACCEPT_COMMANDS.map(cmd => vscode.commands.executeCommand(cmd))
                );
                await Promise.race([commandsPromise, timeoutPromise]);
            } catch (e) { /* silent */ }
            if (this.isEnabled) {
                this.pollIntervalId = setTimeout(pollCycle, interval);
            }
        };
        this.pollIntervalId = setTimeout(pollCycle, interval);

        if (this.connectionManager) {
            this.connectionManager.start();
        }
    }

    _stopPolling() {
        if (this.pollIntervalId) {
            clearTimeout(this.pollIntervalId);
            this.pollIntervalId = null;
        }
        if (this.connectionManager) {
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
$paths = @("$env:USERPROFILE\\\\Desktop", "$env:PUBLIC\\\\Desktop", "$env:APPDATA\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs", "$env:ALLUSERSPROFILE\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs")
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
elseif ($patched -or $patchedLnk) { Write-Output "SUCCESS|$patchedLnk" }
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
                } else if (out.includes('SUCCESS|')) {
                    const lnkPath = out.split('SUCCESS|')[1].trim();
                    this.log(`[CDP] ✓ Shortcut ready: ${lnkPath}`);
                    vscode.window.showInformationMessage(
                        `✅ Shortcut ready! Restart Antigravity to activate AutoAccept.`,
                        'Restart Now'
                    ).then(action => {
                        if (action === 'Restart Now') {
                            vscode.commands.executeCommand('workbench.action.quit');
                        }
                    });
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
