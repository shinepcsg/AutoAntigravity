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
const { scanWorkflows } = require('./telegram/scanWorkflows');

let autoAccept = null;
let ralphLoop = null;
let sidebarProvider = null;
let autoUpdater = null;
let telemetryService = null;
let telegramService = null;
let statusBarAutoAccept = null;
let statusBarRalph = null;
let outputChannel = null;
let _extensionContext = null;

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
        case LoopState.QUOTA_PAUSED:
            statusBarRalph.text = '$(watch) Ralph: Quota Paused';
            statusBarRalph.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            statusBarRalph.tooltip = 'Ralph Loop paused — waiting for model quota reset';
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

// ─── Git Session Helper ────────────────────────────────────────────────
/**
 * IDLE 상태에서 _sendToAgent 직접 호출 전에 Git 세션 브랜치를 미리 생성.
 * 이렇게 해야 PRD 작성 커밋도 세션 브랜치에서 이루어짐.
 * @param {string} label - 세션 라벨 (작업 설명 등)
 */
function _initGitSessionIfIdle(label) {
    const autoCommit = vscode.workspace.getConfiguration('autoAntigravity')
        .get('ralphLoop.autoCommit', true);
    if (!autoCommit) return;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const wsRoot = workspaceFolders && workspaceFolders.length > 0
        ? workspaceFolders[0].uri.fsPath : null;
    if (!wsRoot) return;

    // 이미 활성 세션이 있으면 건너뜀
    const existing = ralphLoop.gitManager.getSessionInfo();
    if (existing.active) {
        log(`[Git] 📌 기존 세션 사용: ${existing.sessionBranch || existing.originalBranch}`);
        return;
    }

    const gitResult = ralphLoop.gitManager.initSession(wsRoot, label);
    if (gitResult.success) {
        log(`[Git] 🌿 세션 브랜치 생성: ${gitResult.sessionBranch}`);
    }
}

// ─── Telegram Immediate Execution: Wait & Send Images Helper ──────────
/**
 * 즉시 실행 후 에이전트 작업 완료를 기다리고, 새로 생성된 이미지를 텔레그램으로 전송.
 * @param {Set<string>} imagesBefore - 실행 전 이미지 스냅샷
 */
async function _waitAndSendImages(imagesBefore) {
    try {
        log('[Telegram] ⏳ 에이전트 작업 완료 대기 중...');
        await ralphLoop._waitForAgentCompletion();
        log('[Telegram] ✅ 에이전트 작업 완료 감지');

        // 새로 생성된 이미지 감지
        const newImages = ralphLoop._getNewImagesSinceSnapshot(imagesBefore);
        if (newImages.length > 0 && telegramService) {
            const path = require('path');
            for (const imgPath of newImages) {
                await telegramService.sendPhoto(imgPath, `🖼 ${path.basename(imgPath)}`);
            }
            log(`[Telegram] 🖼 생성된 이미지 ${newImages.length}개 텔레그램 전송 완료`);
        }
    } catch (err) {
        log(`[Telegram] ⚠ 이미지 감지/전송 실패: ${err.message}`);
    }
}

// ─── Telegram Connect / Disconnect ────────────────────────────────────
function connectTelegram(context) {
    _extensionContext = context;
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
    if (!botToken || !chatId) {
        log('[Telegram] 텔레그램 활성화되었으나 botToken 또는 chatId가 비어있습니다.');
        return;
    }

    telegramService = new TelegramService(log);

    // globalState에서 상세 알림 설정 복원
    telegramService.detailedNotification = context.globalState.get('autoAntigravity.telegramDetailedNotification', false);

    // 텔레그램 → 플러그인: /task 명령 수신 시 idle이면 즉시 실행, 아니면 큐에 추가
    telegramService.onTaskRequest = async (text) => {
        const state = ralphLoop.getState();

        if (state === LoopState.IDLE) {
            // Git 세션 초기화
            _initGitSessionIfIdle(text);

            // 이미지 스냅샷 (실행 전)
            const imagesBefore = ralphLoop._snapshotImageFiles();

            // Ralph Loop가 idle이면 즉시 대화 프롬프트로 전달
            try {
                log(`[Telegram] 📤 즉시 실행 프롬프트 전송: ${text.substring(0, 80)}`);
                await ralphLoop._sendToAgent(text, []);
                telegramService.sendMessage(`🚀 즉시 실행 중: ${text.substring(0, 80)}`);
                log(`[Telegram] ✅ 즉시 실행 프롬프트 전송 완료`);

                // 에이전트 완료 대기 후 생성된 이미지 텔레그램 전송 (비동기, 에러 무시)
                _waitAndSendImages(imagesBefore);
            } catch (err) {
                log(`[Telegram] ❌ 즉시 실행 프롬프트 전송 실패: ${err.message}`);
                telegramService.sendMessage(`❌ 즉시 실행 실패: ${err.message}`);
            }
        } else if (sidebarProvider) {
            // Ralph Loop가 실행 중이면 작업 큐에 추가 (text 그대로 저장)
            sidebarProvider._taskQueue.push({ text, mediaPaths: [], type: 'task' });
            sidebarProvider.updateState();
            telegramService.sendMessage(`📥 작업 큐에 추가됨 (${sidebarProvider._taskQueue.length}개): ${text.substring(0, 80)}`);
            log('[Telegram] 작업 큐에 추가: ' + text.substring(0, 80));
        } else {
            telegramService.sendMessage(`❌ 사이드바가 초기화되지 않았습니다.`);
        }
    };

    // 텔레그램 → 플러그인: /prd 명령 수신 시 idle이면 즉시 /write-prd 워크플로우 실행, 아니면 큐에 추가
    telegramService.onPrdRequest = async (text) => {
        const state = ralphLoop.getState();
        const prompt = '/write-prd ' + text;

        if (state === LoopState.IDLE) {
            // Git 세션 초기화
            _initGitSessionIfIdle(text);

            // Ralph Loop가 idle이면 즉시 /write-prd 워크플로우로 실행
            try {
                log(`[Telegram] 📤 PRD 즉시 실행 프롬프트 전송: ${text.substring(0, 80)}`);
                await ralphLoop._sendToAgent(prompt, []);
                telegramService.sendMessage(`🚀 PRD 작성 즉시 실행 중: ${text.substring(0, 80)}`);
                log(`[Telegram] ✅ PRD 즉시 실행 프롬프트 전송 완료`);
            } catch (err) {
                log(`[Telegram] ❌ PRD 즉시 실행 프롬프트 전송 실패: ${err.message}`);
                telegramService.sendMessage(`❌ PRD 즉시 실행 실패: ${err.message}`);
            }
        } else if (sidebarProvider) {
            // Ralph Loop가 실행 중이면 작업 큐에 추가 (type: 'prd'로 저장)
            sidebarProvider._taskQueue.push({ text, mediaPaths: [], type: 'prd' });
            sidebarProvider.updateState();
            telegramService.sendMessage(`📥 PRD 작업 큐에 추가됨 (${sidebarProvider._taskQueue.length}개): ${text.substring(0, 80)}`);
            log('[Telegram] PRD 작업 큐에 추가: ' + text.substring(0, 80));
        } else {
            telegramService.sendMessage(`❌ 사이드바가 초기화되지 않았습니다.`);
        }
    };

    // 텔레그램 → 플러그인: 도움말
    telegramService.onHelpRequest = () => {
        const lines = [
            `📖 *AutoAntigravity 명령어 목록*`,
            ``,
            `/help — 📖 사용 가능한 명령어 목록`,
            `/status — 📊 현재 상태 및 AI 사용량 조회`,
            `/start — 🚀 Ralph Loop 시작`,
            `/stop — ⏹ Ralph Loop 정지`,
            `/autoaccept — ⚡ AutoAccept ON/OFF 토글`,
            `/config — ⚙️ 현재 설정값 조회`,
            `/queue — 📋 작업 큐 목록 조회`,
        ];

        // 동적 워크플로우 명령어 추가
        const wsRoot = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : undefined;
        const builtInNames = new Set(['help', 'status', 'start', 'stop', 'autoaccept', 'config', 'queue']);
        const workflows = scanWorkflows(wsRoot).filter(w => !builtInNames.has(w.command));
        if (workflows.length > 0) {
            lines.push(``);
            lines.push(`🔧 *워크플로우 명령어*`);
            for (const wf of workflows) {
                lines.push(`/${wf.command} — ${wf.description}`);
            }
        }

        lines.push(``);
        lines.push(`💡 *작업 요청*`);
        lines.push(`/task [내용] — 💬 작업 요청 (대화로 직접 전달)`);
        lines.push(`/prd [내용] — 📋 PRD 작성 요청 (write-prd 워크플로우)`);

        telegramService.sendMessage(lines.join('\n'));
    };

    // 텔레그램 → 플러그인: 상태 조회 (+ AI 사용량)
    telegramService.onStatusRequest = () => {
        const state = ralphLoop.getState();
        const progress = ralphLoop.taskManager.getProgress();
        const autoAcceptState = autoAccept && autoAccept.isEnabled ? 'ON ⚡' : 'OFF 🔴';
        const queueCount = sidebarProvider ? sidebarProvider._taskQueue.length : 0;

        const lines = [
            `📊 *AutoAntigravity 상태*`,
            ``,
            `🔄 *Ralph Loop*: ${state}`,
            `📋 *진행*: ${progress.completed}/${progress.total} (남은: ${progress.remaining})`,
            `🔁 *반복*: ${ralphLoop.currentIteration}회차`,
            `⚡ *AutoAccept*: ${autoAcceptState}`,
            `📬 *작업 큐*: ${queueCount}개`,
        ];

        // AI 사용량 정보 추가
        if (telemetryService) {
            const quota = telemetryService.getData();
            if (quota && quota.connected && quota.models && quota.models.length > 0) {
                lines.push(``);
                lines.push(`🤖 *AI 사용량*`);
                for (const m of quota.models) {
                    const pct = m.limit > 0 ? Math.round((m.usage / m.limit) * 100) : 0;
                    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
                    lines.push(`  ${m.name}: ${m.usage}/${m.limit} (${pct}%) [${bar}]`);
                }
            }
        }

        telegramService.sendMessage(lines.join('\n'));
    };

    // 텔레그램 → 플러그인: Ralph Loop 시작
    telegramService.onStartRequest = () => {
        const state = ralphLoop.getState();
        if (state === LoopState.RUNNING) {
            telegramService.sendMessage('⚠️ Ralph Loop가 이미 실행 중입니다.');
        } else {
            ralphLoop.start().then(() => {
                updateRalphStatusBar();
                telegramService.sendMessage('🚀 Ralph Loop 시작됨');
            }).catch(err => {
                telegramService.sendMessage(`❌ Ralph Loop 시작 실패: ${err.message}`);
            });
        }
    };

    // 텔레그램 → 플러그인: 정지
    telegramService.onStopRequest = () => {
        ralphLoop.stop();
        updateRalphStatusBar();
        telegramService.sendMessage('⏹ Ralph Loop 정지 완료');
    };

    // 텔레그램 → 플러그인: AutoAccept 토글
    telegramService.onAutoAcceptRequest = () => {
        const enabled = autoAccept.toggle();
        updateAutoAcceptStatusBar();
        telegramService.sendMessage(`⚡ AutoAccept: ${enabled ? 'ON ✅' : 'OFF 🔴'}`);
    };

    // 텔레그램 → 플러그인: 설정 조회
    telegramService.onConfigRequest = () => {
        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const configMsg = [
            `⚙️ *현재 설정*`,
            ``,
            `🔄 *Max Iterations*: ${config.get('ralphLoop.maxIterations', 50)}`,
            `⏱ *Iteration Delay*: ${config.get('ralphLoop.iterationDelayMs', 1500)}ms`,
            `📝 *PRD Modification*: ${config.get('ralphLoop.allowPrdModification', false) ? 'ON' : 'OFF'}`,
            `▶️ *Auto Start*: ${config.get('ralphLoop.autoStart', true) ? 'ON' : 'OFF'}`,
            `💾 *Auto Commit*: ${config.get('ralphLoop.autoCommit', true) ? 'ON' : 'OFF'}`,
            `🗑 *Auto Delete Branch*: ${config.get('ralphLoop.autoDeleteBranch', true) ? 'ON' : 'OFF'}`,
            `🔀 *Parallel Enabled*: ${config.get('ralphLoop.enableParallel', true) ? 'ON' : 'OFF'}`,
            `📁 *Task File*: ${config.get('ralphLoop.taskFile', 'PRD.md')}`,
        ].join('\n');
        telegramService.sendMessage(configMsg);
    };

    // 텔레그램 → 플러그인: 작업 큐 조회
    telegramService.onQueueRequest = () => {
        if (!sidebarProvider || sidebarProvider._taskQueue.length === 0) {
            telegramService.sendMessage('📋 작업 큐가 비어있습니다.');
            return;
        }
        const items = sidebarProvider._taskQueue.map((t, i) => `${i + 1}. ${t.text.substring(0, 60)}${t.mediaPaths.length > 0 ? ` 📎${t.mediaPaths.length}` : ''}`);
        const msg = [`📋 *작업 큐* (${sidebarProvider._taskQueue.length}개)`, ``, ...items].join('\n');
        telegramService.sendMessage(msg);
    };

    // 텔레그램 → 플러그인: 동적 워크플로우 명령어 수신
    telegramService.onWorkflowRequest = async (workflowName, argsText) => {
        const prompt = argsText ? `/${workflowName} ${argsText}` : `/${workflowName}`;
        const state = ralphLoop.getState();

        if (state === LoopState.IDLE) {
            // Git 세션 초기화 (워크플로우도 세션 브랜치에서 진행)
            _initGitSessionIfIdle(workflowName);

            // Ralph Loop가 idle이면 즉시 실행
            try {
                log(`[Telegram] 📤 워크플로우 프롬프트 전송: ${prompt.substring(0, 80)}`);
                await ralphLoop._sendToAgent(prompt, []);
                telegramService.sendMessage(`🚀 워크플로우 실행 중: /${workflowName}`);
                log(`[Telegram] ✅ 워크플로우 프롬프트 전송 완료`);
            } catch (err) {
                log(`[Telegram] ❌ 워크플로우 프롬프트 전송 실패: ${err.message}`);
                telegramService.sendMessage(`❌ 워크플로우 실행 실패: ${err.message}`);
            }
        } else {
            // Ralph Loop가 실행 중이면 작업 큐에 추가
            if (sidebarProvider) {
                sidebarProvider._taskQueue.push({ text: prompt, mediaPaths: [] });
                sidebarProvider.updateState();
                telegramService.sendMessage(`📥 작업 큐에 추가됨 (${sidebarProvider._taskQueue.length}개): ${prompt.substring(0, 80)}`);
                log(`[Telegram] 작업 큐에 워크플로우 추가: ${prompt.substring(0, 80)}`);
            } else {
                telegramService.sendMessage(`❌ 사이드바가 초기화되지 않았습니다.`);
            }
        }
    };

    // 텔레그램 → 플러그인: 미디어 수신 시 파일 다운로드 후 처리
    telegramService.onMediaReceived = async (text, mediaFiles) => {
        const fs = require('fs');
        const path = require('path');

        // 워크스페이스 루트 확인
        const wsRoot = workspaceFolders && workspaceFolders.length > 0
            ? workspaceFolders[0].uri.fsPath : null;
        if (!wsRoot) {
            telegramService.sendMessage('❌ 워크스페이스가 열려있지 않습니다.');
            return;
        }

        // .antigravity/media/ 디렉토리 생성
        const mediaDir = path.join(wsRoot, '.antigravity', 'media');
        fs.mkdirSync(mediaDir, { recursive: true });

        // 각 미디어 파일 다운로드
        const timestamp = Date.now();
        const downloadedPaths = [];

        for (const mf of mediaFiles) {
            const fileName = mf.type === 'photo' && (!mf.fileName || mf.fileName === 'photo.jpg')
                ? `${timestamp}_photo.jpg`
                : `${timestamp}_${mf.fileName}`;
            const destPath = path.join(mediaDir, fileName);

            try {
                const result = await telegramService.downloadFile(mf.fileId, destPath);
                if (result.success) {
                    downloadedPaths.push(result.path);
                    log(`[Telegram] 📥 미디어 다운로드 성공: ${fileName}`);
                } else {
                    log(`[Telegram] ⚠️ 미디어 다운로드 실패: ${result.error}`);
                }
            } catch (err) {
                log(`[Telegram] ❌ 미디어 다운로드 오류: ${err.message}`);
            }
        }

        if (downloadedPaths.length === 0) {
            telegramService.sendMessage('❌ 미디어 파일 다운로드에 모두 실패했습니다.');
            return;
        }

        // 프롬프트 구성: 미디어 + 캡션 텍스트를 대화 프롬프트로 직접 전달 (/task와 동일)
        const captionText = text || '';
        const mediaRefs = downloadedPaths.map(p => `@${p}`).join(' ');
        const prompt = captionText
            ? `${captionText}\n\n첨부 미디어:\n${mediaRefs}`
            : `첨부된 미디어 파일을 분석해주세요.\n\n첨부 미디어:\n${mediaRefs}`;

        const state = ralphLoop.getState();

        if (state === LoopState.IDLE) {
            // Git 세션 초기화 (미디어 작업도 세션 브랜치에서 진행)
            _initGitSessionIfIdle(captionText || '미디어-첨부-작업');

            // 이미지 스냅샷 (실행 전)
            const imagesBefore = ralphLoop._snapshotImageFiles();

            // idle이면 즉시 대화 프롬프트로 전달
            try {
                log(`[Telegram] 📤 미디어 포함 즉시 실행: ${prompt.substring(0, 80)}`);
                await ralphLoop._sendToAgent(prompt, downloadedPaths);
                telegramService.sendMessage(`🚀 미디어 포함 즉시 실행 중 (파일 ${downloadedPaths.length}개): ${captionText.substring(0, 60) || '(캡션 없음)'}`);
                log(`[Telegram] ✅ 미디어 포함 즉시 실행 완료`);

                // 에이전트 완료 대기 후 생성된 이미지 텔레그램 전송 (비동기, 에러 무시)
                _waitAndSendImages(imagesBefore);
            } catch (err) {
                log(`[Telegram] ❌ 미디어 포함 즉시 실행 실패: ${err.message}`);
                telegramService.sendMessage(`❌ 미디어 실행 실패: ${err.message}`);
            }
        } else if (sidebarProvider) {
            // 실행 중이면 큐에 추가 (텍스트 + 미디어 경로, type: 'task')
            const queueText = captionText || '미디어 첨부 작업';
            sidebarProvider._taskQueue.push({ text: queueText, mediaPaths: downloadedPaths, type: 'task' });
            sidebarProvider.updateState();
            telegramService.sendMessage(`📥 미디어 작업 큐에 추가됨 (${sidebarProvider._taskQueue.length}개, 파일 ${downloadedPaths.length}개): ${queueText.substring(0, 60)}`);
            log(`[Telegram] 미디어 작업 큐에 추가: ${queueText.substring(0, 80)}`);
        } else {
            telegramService.sendMessage('❌ 사이드바가 초기화되지 않았습니다.');
        }
    };

    // 플러그인 → 텔레그램: Ralph Loop 로그 전달
    ralphLoop.onLogCallback = (logEntry) => {
        telegramService.onRalphLog(logEntry);
    };

    // 플러그인 → 텔레그램: 개별 작업 완료 결과 전달 (detailedNotification 플래그에 따라 조건부)
    // imagePaths: 작업 중 생성된 이미지 파일 경로 배열 (git diff 기반 감지)
    ralphLoop.onTaskCompleteCallback = (taskText, iteration, progress, imagePaths) => {
        if (telegramService.detailedNotification) {
            telegramService.sendTaskResult(taskText, iteration, progress, imagePaths);
        } else if (imagePaths && imagePaths.length > 0) {
            // 상세 알림이 꺼져 있어도 이미지가 있으면 이미지만 전송
            for (const imgPath of imagePaths) {
                const path = require('path');
                telegramService.sendPhoto(imgPath, `🖼 ${path.basename(imgPath)}`);
            }
        }
    };

    // 플러그인 → 텔레그램: 쿼터 초과 알림
    ralphLoop.onQuotaExhaustedCallback = (info) => {
        if (info.resumed) {
            telegramService.sendMessage(`▶️ 모델 할당량 갱신 완료 — Ralph Loop 재개됩니다.`);
        } else {
            telegramService.sendMessage(
                `⏸️ *모델 할당량 초과 (Quota Exhausted)*\n\n` +
                `Ralph Loop가 일시정지되었습니다.\n` +
                `할당량 리셋: ${info.refreshTime}\n` +
                `예상 재개: ${info.resumeTime} (약 ${info.waitMinutes}분 후)\n\n` +
                `ℹ️ 리셋 시간이 지나면 자동으로 재개됩니다.`
            );
        }
    };

    // NOTE: onAllTasksCompleteCallback은 activate()에서 통합 설정 (사이드바 큐 처리 + 텔레그램 알림)

    const wsRoot = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : undefined;
    telegramService.start(botToken, chatId, wsRoot);
    context.subscriptions.push({ dispose: () => telegramService.dispose() });
    log('[Telegram] 텔레그램 봇 서비스 시작');

    // sidebar에 참조 동기화
    if (sidebarProvider) {
        sidebarProvider.telegramService = telegramService;
        sidebarProvider.updateState();
    }

    // 텔레그램 연결 상태를 globalState에 영속 저장
    context.globalState.update('autoAntigravity.telegramConnected', true);
}

function disconnectTelegram() {
    if (telegramService) {
        telegramService.dispose();
        telegramService = null;
        log('[Telegram] 텔레그램 봇 서비스 해제');
    }
    // Ralph Loop 콜백 정리 (onAllTasksCompleteCallback은 activate()에서 관리)
    if (ralphLoop) {
        ralphLoop.onLogCallback = null;
        ralphLoop.onTaskCompleteCallback = null;
        ralphLoop.onQuotaExhaustedCallback = null;
    }
    // sidebar에 참조 동기화
    if (sidebarProvider) {
        sidebarProvider.telegramService = null;
        sidebarProvider.updateState();
    }

    // 텔레그램 연결 해제 상태를 globalState에 영속 저장
    if (_extensionContext) {
        _extensionContext.globalState.update('autoAntigravity.telegramConnected', false);
    }
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

    // ─── 전체 작업 완료 시: 사이드바 큐 처리 + 텔레그램 알림 ──────────
    ralphLoop.onAllTasksCompleteCallback = async (sessionLabel, tasks, totalIterations) => {
        // 1) 텔레그램 알림 (연결 시)
        if (telegramService && typeof telegramService.sendSessionResult === 'function') {
            try {
                telegramService.sendSessionResult(sessionLabel, tasks, totalIterations);
            } catch (e) {
                log(`[Queue] 텔레그램 완료 알림 실패: ${e.message}`);
            }
        }

        // 2) 사이드바 큐에 항목이 있으면 다음 작업 전송 (type에 따라 분기)
        if (sidebarProvider && sidebarProvider._taskQueue.length > 0) {
            const nextItem = sidebarProvider._taskQueue.shift();
            const nextTask = nextItem.text;
            const nextMediaPaths = nextItem.mediaPaths || [];
            const itemType = nextItem.type || 'prd'; // 기본값 'prd' (하위 호환)
            log(`[Queue] 📬 큐에서 다음 작업 꺼냄 (type: ${itemType}, 남은: ${sidebarProvider._taskQueue.length}${nextMediaPaths.length > 0 ? ', 미디어 ' + nextMediaPaths.length + '개' : ''}): ${nextTask.substring(0, 80)}`);
            sidebarProvider.updateState(); // 큐 UI 갱신

            // 큐 작업에 의한 PRD 변경 시 autoStart 무관하게 자동 시작되도록 플래그 설정
            ralphLoop._forceNextAutoStart = true;

            // Git 세션 초기화 (큐 작업도 세션 브랜치에서 진행)
            _initGitSessionIfIdle(nextTask);

            // type에 따라 프롬프트 구성: 'prd' → /write-prd 래핑, 'task' → 텍스트 직접 전달
            const prompt = itemType === 'task' ? nextTask : `/write-prd ${nextTask}`;
            const promptLabel = itemType === 'task' ? '대화 프롬프트' : 'write-prd 워크플로우 프롬프트';
            try {
                log(`[Queue] 📤 ${promptLabel} 전송 중...`);
                await ralphLoop._sendToAgent(prompt, nextMediaPaths);
                log(`[Queue] ✅ ${promptLabel} 전송 완료`);

                // autoStart 설정이 false이면 일회성 watcher 설정 (prd 타입만 — task는 대화 직접 전달이므로 watcher 불필요)
                if (itemType !== 'task') {
                    const autoStartEnabled = vscode.workspace.getConfiguration('autoAntigravity')
                        .get('ralphLoop.autoStart', false);
                    if (!autoStartEnabled) {
                        ralphLoop.enableAutoStartOnce();
                        log(`[Queue] 👁 autoStart 비활성 상태 — 일회성 watcher 활성화`);
                    }
                }

                if (telegramService && typeof telegramService.sendMessage === 'function') {
                    const emoji = itemType === 'task' ? '💬' : '📬';
                    telegramService.sendMessage(`${emoji} 큐 작업 자동 실행: ${nextTask.substring(0, 80)}`);
                }
            } catch (err) {
                log(`[Queue] ❌ ${promptLabel} 전송 실패: ${err.message}`);
                ralphLoop._forceNextAutoStart = false; // 전송 실패 시 플래그 리셋
                if (telegramService && typeof telegramService.sendMessage === 'function') {
                    telegramService.sendMessage(`❌ 큐 작업 전송 실패: ${err.message}`);
                }
            }
        }
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
    sidebarProvider.onSelectTaskFile = () => {
        vscode.commands.executeCommand('autoAntigravity.selectTaskFile');
    };
    sidebarProvider.onToggleTelegram = async () => {
        if (telegramService) {
            disconnectTelegram();
        } else {
            connectTelegram(context);
        }
    };
    sidebarProvider.onSaveTelegramCred = async (botToken, chatId) => {
        // .env에 자격증명 저장
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const fs = require('fs');
            const path = require('path');
            const envPath = path.join(workspaceFolders[0].uri.fsPath, '.env');
            let lines = [];
            if (fs.existsSync(envPath)) {
                lines = fs.readFileSync(envPath, 'utf-8').split('\n');
            }
            // 기존 키를 업데이트하거나 추가
            let foundToken = false, foundChat = false;
            lines = lines.map(l => {
                if (l.trim().startsWith('TELEGRAM_BOT_TOKEN=')) { foundToken = true; return `TELEGRAM_BOT_TOKEN=${botToken}`; }
                if (l.trim().startsWith('TELEGRAM_CHAT_ID=')) { foundChat = true; return `TELEGRAM_CHAT_ID=${chatId}`; }
                return l;
            });
            if (!foundToken) lines.push(`TELEGRAM_BOT_TOKEN=${botToken}`);
            if (!foundChat) lines.push(`TELEGRAM_CHAT_ID=${chatId}`);
            fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
            log(`[Telegram] .env에 자격증명 저장 완료: ${envPath}`);
        }
        // 저장 후 연결
        connectTelegram(context);
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
    sidebarProvider.telegramService = telegramService; // 초기 null 참조
    // globalState 기반 텔레그램 자동 연결 (fallback: 기존 telegram.enabled 설정)
    const telegramGlobalState = context.globalState.get('autoAntigravity.telegramConnected');
    const shouldConnectTelegram = telegramGlobalState !== undefined
        ? telegramGlobalState  // globalState에 명시적 값이 있으면 그 값 사용
        : vscode.workspace.getConfiguration('autoAntigravity').get('telegram.enabled', false); // 한 번도 설정된 적 없으면 config fallback
    if (shouldConnectTelegram) {
        connectTelegram(context);
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
                if (!autoUpdater._authHeader) {
                    vscode.window.showWarningMessage(
                        'AutoAntigravity: Git 자격 증명이 없어 업데이트를 확인할 수 없습니다. Git 저장소 접근 권한을 확인하세요.'
                    );
                    log('[Updater] checkForUpdates 차단됨 — _authHeader가 null');
                    return;
                }
                autoUpdater.checkForUpdates();
            }
        })
    );

    // Git Push Now
    context.subscriptions.push(
        vscode.commands.registerCommand('autoAntigravity.pushNow', async () => {
            if (ralphLoop && typeof ralphLoop.pushNow === 'function') {
                await ralphLoop.pushNow();
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

    autoUpdater.start().catch(e => log(`[Updater] start failed: ${e.message}`));
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
