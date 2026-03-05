// AutoAntigravity — Unified Extension Entry Point
// Combines Auto Accept (CDP button clicking) + Ralph Loop (iterative agent execution)
// + Self-Updater (Gitea release auto-update)

const vscode = require('vscode');
const { AutoAcceptManager } = require('./autoAccept');
const { RalphLoopManager, LoopState } = require('./ralph/ralphLoop');
const { RalphSidebarProvider } = require('./ralph/RalphSidebarProvider');
const { AutoUpdater } = require('./updater');
const { TelemetryService } = require('./telemetry/TelemetryService');
const { TelegramService } = require('./telegram/TelegramService');

let autoAccept = null;
let ralphLoop = null;
let sidebarProvider = null;
let autoUpdater = null;
let telemetryService = null;
let telegramService = null;
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
    const currentVersion = context.extension.packageJSON.version;
    log(`AutoAntigravity extension activating (v${currentVersion})`);

    // ─── Initialize Auto Accept ───────────────────────────────────────
    autoAccept = new AutoAcceptManager(log);
    autoAccept.initialize();

    // ─── Initialize Ralph Loop ────────────────────────────────────────
    ralphLoop = new RalphLoopManager(log);
    ralphLoop.setContext(context);
    ralphLoop.setConnectionManager(autoAccept.connectionManager);
    ralphLoop.restoreTaskFile();
    ralphLoop.onStateChange = () => {
        updateRalphStatusBar();
    };

    // ─── Auto Start (FileSystemWatcher) ──────────────────────────────
    const autoStartConfig = vscode.workspace.getConfiguration('autoAntigravity');
    if (autoStartConfig.get('ralphLoop.autoStart', false)) {
        ralphLoop.enableAutoStart();
    }

    // 설정 변경 시 동적으로 autoStart ON/OFF
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('autoAntigravity.ralphLoop.autoStart')) {
                const enabled = vscode.workspace.getConfiguration('autoAntigravity')
                    .get('ralphLoop.autoStart', false);
                if (enabled) {
                    ralphLoop.enableAutoStart();
                } else {
                    ralphLoop.disableAutoStart();
                }
                log(`Auto Start ${enabled ? 'enabled' : 'disabled'}`);
            }
        })
    );

    // ─── Register Sidebar WebviewView Provider ────────────────────────
    sidebarProvider = new RalphSidebarProvider(context, log);
    sidebarProvider.autoAccept = autoAccept;
    sidebarProvider.ralphLoop = ralphLoop;

    // Wire sidebar actions
    sidebarProvider.onToggleAutoAccept = async () => {
        await vscode.commands.executeCommand('autoAntigravity.toggleAutoAccept');
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

    // ─── Initialize Telemetry Service ─────────────────────────────
    telemetryService = new TelemetryService(log);
    sidebarProvider.telemetryService = telemetryService;

    // Update sidebar when quota data changes
    telemetryService.onUpdate(() => {
        if (sidebarProvider) sidebarProvider.updateState();
    });

    const pollInterval = vscode.workspace.getConfiguration('autoAntigravity')
        .get('telemetry.pollInterval', 90);
    telemetryService.startPolling(pollInterval);

    context.subscriptions.push({ dispose: () => telemetryService.dispose() });

    // ─── Initialize Telegram Service ──────────────────────────────────
    const telegramConfig = vscode.workspace.getConfiguration('autoAntigravity');
    const telegramEnabled = telegramConfig.get('telegram.enabled', false);
    if (telegramEnabled) {
        // .env 파일에서 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 읽기
        let botToken = '';
        let chatId = '';
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const fs = require('fs');
            const path = require('path');
            const envPath = path.join(workspaceFolders[0].uri.fsPath, '.env');
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf-8');
                for (const line of envContent.split('\n')) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('TELEGRAM_BOT_TOKEN=')) {
                        botToken = trimmed.substring('TELEGRAM_BOT_TOKEN='.length).trim();
                    } else if (trimmed.startsWith('TELEGRAM_CHAT_ID=')) {
                        chatId = trimmed.substring('TELEGRAM_CHAT_ID='.length).trim();
                    }
                }
            } else {
                log('[Telegram] .env 파일이 없습니다: ' + envPath);
            }
        }
        if (botToken && chatId) {
            telegramService = new TelegramService(log);

            // 텔레그램 → 플러그인: 메시지 수신 시 write-prd 워크플로우 실행
            telegramService.onMessageReceived = (text) => {
                const prompt = `/write-prd ${text}`;
                telegramService.sendMessage(`📨 작업 요청 수신 — write-prd 워크플로우 실행 중...`);
                log('[Telegram] write-prd 워크플로우 실행: ' + text);
                ralphLoop._sendToAgent(prompt).then(() => {
                    telegramService.sendMessage(`✅ write-prd 워크플로우 프롬프트 전송 완료`);
                }).catch((err) => {
                    telegramService.sendMessage(`❌ 프롬프트 전송 실패: ${err.message}`);
                    log('[Telegram] write-prd 실행 실패: ' + err.message);
                });
            };

            // 텔레그램 → 플러그인: 상태 조회
            telegramService.onStatusRequest = () => {
                const state = ralphLoop.getState();
                const progress = ralphLoop.taskManager.getProgress();
                const msg = `📊 *상태*: ${state}\n📋 *진행*: ${progress.completed}/${progress.total} (남은: ${progress.remaining})\n🔄 *반복*: ${ralphLoop.currentIteration}`;
                telegramService.sendMessage(msg);
            };

            // 텔레그램 → 플러그인: 정지
            telegramService.onStopRequest = () => {
                ralphLoop.stop();
                updateRalphStatusBar();
                telegramService.sendMessage('⏹ Ralph Loop 정지 완료');
            };

            // 텔레그램 → 플러그인: 긴급 정지
            telegramService.onEmergencyRequest = () => {
                ralphLoop.emergencyStop();
                autoAccept.disable();
                updateAutoAcceptStatusBar();
                updateRalphStatusBar();
                telegramService.sendMessage('🛑 긴급 정지 완료 — 모든 기능 비활성화');
            };

            // 플러그인 → 텔레그램: Ralph Loop 로그 전달
            ralphLoop.onLogCallback = (logEntry) => {
                telegramService.onRalphLog(logEntry);
            };

            telegramService.start(botToken, chatId);
            context.subscriptions.push({ dispose: () => telegramService.dispose() });
            log('[Telegram] 텔레그램 봇 서비스 시작');
        } else {
            log('[Telegram] 텔레그램 활성화되었으나 botToken 또는 chatId가 비어있습니다.');
        }
    }

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

    // Manual update check
    context.subscriptions.push(
        vscode.commands.registerCommand('autoAntigravity.checkForUpdates', () => {
            if (autoUpdater) {
                autoUpdater.checkForUpdates();
            }
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

    // ─── Auto Updater ─────────────────────────────────────────────────
    autoUpdater = new AutoUpdater(context, log);
    sidebarProvider.autoUpdater = autoUpdater;

    // 업데이트 상태 변경 시 사이드바 갱신
    autoUpdater.onUpdateStateChange = () => {
        if (sidebarProvider) sidebarProvider.updateState();
    };

    autoUpdater.start();
    context.subscriptions.push({ dispose: () => autoUpdater.dispose() });
}

function deactivate() {
    if (autoUpdater) autoUpdater.dispose();
    if (telegramService) telegramService.dispose();
    if (telemetryService) telemetryService.dispose();
    if (autoAccept) autoAccept.dispose();
    if (ralphLoop) ralphLoop.dispose();
    if (outputChannel) outputChannel.dispose();
}

module.exports = { activate, deactivate };
