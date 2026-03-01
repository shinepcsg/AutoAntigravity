// AutoAntigravity — Unified Extension Entry Point
// Combines Auto Accept (CDP button clicking) + Ralph Loop (iterative agent execution)

const vscode = require('vscode');
const { AutoAcceptManager } = require('./autoAccept');
const { RalphLoopManager, LoopState } = require('./ralph/ralphLoop');
const { RalphSidebarProvider } = require('./ralph/RalphSidebarProvider');

let autoAccept = null;
let ralphLoop = null;
let sidebarProvider = null;
let statusBarAutoAccept = null;
let statusBarRalph = null;
let outputChannel = null;

function log(msg) {
    if (outputChannel) {
        outputChannel.appendLine(`${new Date().toLocaleTimeString()} ${msg}`);
    }
}

function updateAutoAcceptStatusBar() {
    if (!statusBarAutoAccept) return;
    if (autoAccept && autoAccept.isEnabled) {
        statusBarAutoAccept.text = '$(zap) AutoAccept: ON';
        statusBarAutoAccept.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarAutoAccept.tooltip = 'Auto Accept is ACTIVE — click to disable';
    } else {
        statusBarAutoAccept.text = '$(circle-slash) AutoAccept: OFF';
        statusBarAutoAccept.backgroundColor = undefined;
        statusBarAutoAccept.tooltip = 'Auto Accept is OFF — click to enable';
    }
    // Sync sidebar
    if (sidebarProvider) sidebarProvider.updateState();
}

function updateRalphStatusBar() {
    if (!statusBarRalph) return;
    if (!ralphLoop) return;

    const state = ralphLoop.getState();
    switch (state) {
        case LoopState.RUNNING:
            statusBarRalph.text = `$(sync~spin) Ralph: #${ralphLoop.currentIteration}`;
            statusBarRalph.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            statusBarRalph.tooltip = 'Ralph Loop is RUNNING — click to stop';
            break;
        case LoopState.STOPPING:
            statusBarRalph.text = '$(loading~spin) Ralph: Stopping...';
            statusBarRalph.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            statusBarRalph.tooltip = 'Ralph Loop is stopping...';
            break;
        default:
            statusBarRalph.text = '$(debug-start) Ralph: IDLE';
            statusBarRalph.backgroundColor = undefined;
            statusBarRalph.tooltip = 'Ralph Loop is IDLE — click to start';
            break;
    }
    // Sync sidebar
    if (sidebarProvider) sidebarProvider.updateState();
}

// ─── Activation ───────────────────────────────────────────────────────
function activate(context) {
    outputChannel = vscode.window.createOutputChannel('AutoAntigravity');
    log('AutoAntigravity extension activating (v1.3.0)');

    // ─── Initialize Auto Accept ───────────────────────────────────────
    autoAccept = new AutoAcceptManager(log);
    autoAccept.initialize();

    // ─── Initialize Ralph Loop ────────────────────────────────────────
    ralphLoop = new RalphLoopManager(log);
    ralphLoop.onStateChange = () => {
        updateRalphStatusBar();
    };

    // ─── Register Sidebar WebviewView Provider ────────────────────────
    sidebarProvider = new RalphSidebarProvider(context, log);
    sidebarProvider.autoAccept = autoAccept;
    sidebarProvider.ralphLoop = ralphLoop;

    // Wire sidebar actions
    sidebarProvider.onToggleAutoAccept = () => {
        vscode.commands.executeCommand('autoAntigravity.toggleAutoAccept');
    };
    sidebarProvider.onStartRalph = () => {
        vscode.commands.executeCommand('autoAntigravity.startRalphLoop');
    };
    sidebarProvider.onStopRalph = () => {
        vscode.commands.executeCommand('autoAntigravity.stopRalphLoop');
    };
    sidebarProvider.onEmergencyStop = () => {
        vscode.commands.executeCommand('autoAntigravity.emergencyStop');
    };
    sidebarProvider.onSelectTaskFile = () => {
        vscode.commands.executeCommand('autoAntigravity.selectTaskFile');
    };

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            RalphSidebarProvider.viewType,
            sidebarProvider
        )
    );

    // ─── Status Bar Items ─────────────────────────────────────────────
    statusBarAutoAccept = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
    statusBarAutoAccept.command = 'autoAntigravity.toggleAutoAccept';
    context.subscriptions.push(statusBarAutoAccept);
    statusBarAutoAccept.show();

    statusBarRalph = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 199);
    statusBarRalph.command = 'autoAntigravity.startRalphLoop';
    context.subscriptions.push(statusBarRalph);
    statusBarRalph.show();

    // ─── Register Commands ────────────────────────────────────────────

    // Auto Accept toggle
    context.subscriptions.push(
        vscode.commands.registerCommand('autoAntigravity.toggleAutoAccept', () => {
            const enabled = autoAccept.toggle();
            log(`Auto Accept toggled: ${enabled ? 'ON' : 'OFF'}`);
            updateAutoAcceptStatusBar();
            context.globalState.update('autoAntigravity.autoAcceptEnabled', enabled);
            vscode.window.showInformationMessage(
                `AutoAntigravity — Auto Accept: ${enabled ? 'ENABLED ⚡' : 'DISABLED 🔴'}`
            );
        })
    );

    // Ralph Loop start
    context.subscriptions.push(
        vscode.commands.registerCommand('autoAntigravity.startRalphLoop', async () => {
            if (ralphLoop.getState() === LoopState.RUNNING) {
                // If already running, toggle to stop
                ralphLoop.stop();
            } else {
                await ralphLoop.start();
            }
            updateRalphStatusBar();
        })
    );

    // Ralph Loop stop
    context.subscriptions.push(
        vscode.commands.registerCommand('autoAntigravity.stopRalphLoop', () => {
            ralphLoop.stop();
            updateRalphStatusBar();
        })
    );

    // Emergency stop
    context.subscriptions.push(
        vscode.commands.registerCommand('autoAntigravity.emergencyStop', () => {
            ralphLoop.emergencyStop();
            autoAccept.disable();
            updateAutoAcceptStatusBar();
            updateRalphStatusBar();
            log('⚠ EMERGENCY STOP — all features disabled');
        })
    );

    // Select task file
    context.subscriptions.push(
        vscode.commands.registerCommand('autoAntigravity.selectTaskFile', async () => {
            await ralphLoop.selectTaskFile();
            if (sidebarProvider) sidebarProvider.updateState();
        })
    );

    // ─── Initial StatusBar Update (immediate, before CDP check) ─────
    updateAutoAcceptStatusBar();
    updateRalphStatusBar();

    // ─── CDP Check & Restore State ────────────────────────────────────
    autoAccept.checkAndFixCDP().then(cdpOk => {
        if (cdpOk) {
            // Restore Auto Accept state
            if (context.globalState.get('autoAntigravity.autoAcceptEnabled', false)) {
                autoAccept.enable();
            }
        } else {
            log('CDP not available — Auto Accept will not start until debug port is enabled');
        }
        updateAutoAcceptStatusBar();
        updateRalphStatusBar();
        log('AutoAntigravity activated successfully');
    }).catch(err => {
        log(`CDP check error: ${err.message} — continuing with status bar visible`);
        updateAutoAcceptStatusBar();
        updateRalphStatusBar();
    });
}

function deactivate() {
    if (autoAccept) autoAccept.dispose();
    if (ralphLoop) ralphLoop.dispose();
    if (outputChannel) outputChannel.dispose();
}

module.exports = { activate, deactivate };
