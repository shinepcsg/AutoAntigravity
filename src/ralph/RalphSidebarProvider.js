// AutoAntigravity — Ralph Loop Sidebar Webview Provider
// Provides a rich sidebar UI for controlling Ralph Loop

const vscode = require('vscode');
const { getSidebarHtml } = require('./RalphSidebarHtml');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');


class RalphSidebarProvider {
    static viewType = 'autoAntigravity.ralphSidebar';

    /**
     * @param {vscode.ExtensionContext} context
     * @param {Function} log
     */
    constructor(context, log) {
        this._context = context;
        this._log = log;
        this._view = null;

        // External references (set by extension.js)
        this.ralphLoop = null;
        this.autoAccept = null;
        this.telemetryService = null;
        this.onToggleAutoAccept = null;
        this.onStartRalph = null;
        this.onStopRalph = null;
        this.onSelectTaskFile = null;
        this.onToggleTelegram = null;
        this.onSaveTelegramCred = null;
        this.telegramService = null;
        this._showTelegramCredForm = false;
        this._taskQueue = [];

        // Performance: debounce updateState calls and cache fs checks
        this._updateDebounceTimer = null;
        this._fsCache = new Map(); // key -> { value, expiry }
        this._fsCacheTtl = 5000; // 5 seconds
    }

    /**
     * Called by VS Code when the webview view first becomes visible.
     * @param {vscode.WebviewView} webviewView
     */
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'toggleAutoAccept':
                    if (this.onToggleAutoAccept) {
                        await this.onToggleAutoAccept();
                    }
                    this.updateState();
                    break;
                case 'startRalph':
                    if (this.onStartRalph) this.onStartRalph();
                    break;
                case 'stopRalph':
                    if (this.onStopRalph) this.onStopRalph();
                    break;
                case 'selectTaskFile':
                    if (this.onSelectTaskFile) this.onSelectTaskFile();
                    break;
                case 'openTaskFile': {
                    const filePath = message.filePath;
                    if (filePath) {
                        try {
                            const doc = await vscode.workspace.openTextDocument(filePath);
                            await vscode.window.showTextDocument(doc, { preview: false });
                        } catch (err) {
                            this._log(`[Sidebar] Failed to open task file: ${err.message}`);
                        }
                    }
                    break;
                }
                case 'setMaxIterations': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    await config.update('ralphLoop.maxIterations', message.value, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Max iterations set to ${message.value}`);
                    break;
                }
                case 'setIterationDelay': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    await config.update('ralphLoop.iterationDelayMs', message.value, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Iteration delay set to ${message.value}ms`);
                    break;
                }

                case 'toggleAllowPrdMod': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.allowPrdModification', false);
                    await config.update('ralphLoop.allowPrdModification', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] PRD modification: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'toggleAutoStart': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.autoStart', true);
                    await config.update('ralphLoop.autoStart', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Auto Start: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'toggleAutoCommit': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.autoCommit', true);
                    await config.update('ralphLoop.autoCommit', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Auto Commit: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'toggleAutoDeleteBranch': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.autoDeleteBranch', true);
                    await config.update('ralphLoop.autoDeleteBranch', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Auto Delete Branch: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'toggleAutoPush': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.autoPush', false);
                    await config.update('ralphLoop.autoPush', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Auto Push: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'toggleEnableCodeReview': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const current = config.get('ralphLoop.enableCodeReview', false);
                    await config.update('ralphLoop.enableCodeReview', !current, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Enable Code Review: ${!current ? 'ON' : 'OFF'}`);
                    this.updateState();
                    break;
                }
                case 'setCodeReviewModel': {
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    await config.update('codeReview.model', message.value, vscode.ConfigurationTarget.Global);
                    this._log(`[Sidebar] Code Review Model: ${message.value}`);
                    this.updateState();
                    break;
                }
                case 'runCodeReviewNow': {
                    if (this.ralphLoop) {
                        const taskText = message.taskText || '마지막 작업 리뷰';
                        this._log(`[Sidebar] 수동 코드 리뷰 실행: ${taskText.substring(0, 50)}`);
                        this.ralphLoop.runCodeReview(taskText).catch(err => {
                            this._log(`[Sidebar] ❌ 코드 리뷰 실행 에러: ${err.message}`);
                        });
                    }
                    break;
                }

                case 'refreshQuota':
                    if (this.telemetryService) {
                        this.telemetryService.refresh();
                    }
                    break;


                case 'generateSamplePrd': {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        vscode.window.showWarningMessage('워크스페이스가 열려있지 않습니다.');
                        break;
                    }
                    const config = vscode.workspace.getConfiguration('autoAntigravity');
                    const taskFileName = config.get('ralphLoop.taskFile', 'PRD.md');
                    const rootPath = workspaceFolders[0].uri.fsPath;
                    const prdPath = path.join(rootPath, taskFileName);

                    const sampleContent = [
                        '# 랄프루프 테스트용 임시 PRD',
                        '',
                        '> **목적**: Ralph Loop의 순차 실행, 병렬 실행, 검증 기능이 정상 동작하는지 테스트',
                        '',
                        '---',
                        '',
                        '## 작업 목록',
                        '',
                        '### Step 1: 순차 작업 테스트',
                        '- [ ] 작업 1-1: 워크스페이스 루트에 `test-output/` 디렉토리를 생성하고, `test-output/sequential-1.txt` 파일에 "Step 1-1 완료" 내용을 작성.',
                        '- [ ] 작업 1-2: `test-output/sequential-2.txt` 파일에 "Step 1-2 완료" 내용을 작성. (`test-output/sequential-1.txt`가 존재하는지 확인 후 진행)',
                        '- [ ] 검증 1: `test-output/sequential-1.txt`와 `test-output/sequential-2.txt` 파일이 모두 존재하고 올바른 내용을 담고 있는지 확인.',
                        '',
                        '### Step 2: 병렬 작업 테스트',
                        '- [ ] #parallel 작업 2-1: `test-output/parallel-a.txt` 파일에 "병렬 작업 A 완료" 내용을 작성.',
                        '- [ ] #parallel 작업 2-2: `test-output/parallel-b.txt` 파일에 "병렬 작업 B 완료" 내용을 작성.',
                        '- [ ] #parallel 작업 2-3: `test-output/parallel-c.txt` 파일에 "병렬 작업 C 완료" 내용을 작성.',
                        '- [ ] 검증 2: `test-output/parallel-a.txt`, `test-output/parallel-b.txt`, `test-output/parallel-c.txt` 파일이 모두 존재하고 올바른 내용을 담고 있는지 확인.(파일이 없다면 에러이므로 파일을 임의로 생성하지 마라.)',
                        '',
                        '### Step 3: 정리',
                        '- [ ] 작업 3-1: `test-output/` 디렉토리와 그 안의 모든 파일을 삭제하여 테스트 흔적을 정리.',
                        '- [ ] 검증 3: `test-output/` 디렉토리가 더 이상 존재하지 않는지 확인.',
                        '',
                        '---',
                        '',
                        '## 각 단계별 작업 중 필요하다면 PRD에 내용을 추가하거나 변경해라.',
                        ''
                    ].join('\n');

                    const doWrite = async () => {
                        try {
                            fs.writeFileSync(prdPath, sampleContent, 'utf8');
                            const doc = await vscode.workspace.openTextDocument(prdPath);
                            await vscode.window.showTextDocument(doc, { preview: false });
                            this._log(`[Sidebar] Sample PRD created: ${taskFileName}`);
                            vscode.window.showInformationMessage(`샘플 PRD가 생성되었습니다: ${taskFileName}`);
                        } catch (err) {
                            this._log(`[Sidebar] Failed to create sample PRD: ${err.message}`);
                            vscode.window.showErrorMessage(`PRD 생성 실패: ${err.message}`);
                        }
                    };

                    if (fs.existsSync(prdPath)) {
                        const answer = await vscode.window.showWarningMessage(
                            `${taskFileName} 파일이 이미 존재합니다. 덮어쓰시겠습니까?`,
                            { modal: true },
                            '덮어쓰기'
                        );
                        if (answer === '덮어쓰기') {
                            await doWrite();
                        }
                    } else {
                        await doWrite();
                    }
                    break;
                }
                case 'toggleTelegramDetail': {
                    if (this.telegramService) {
                        const newVal = !this.telegramService.detailedNotification;
                        this.telegramService.detailedNotification = newVal;
                        await this._context.globalState.update('autoAntigravity.telegramDetailedNotification', newVal);
                        this._log(`[Sidebar] Telegram detailed notification: ${newVal ? 'ON' : 'OFF'}`);
                    }
                    this.updateState();
                    break;
                }
                case 'toggleTelegram': {
                    // If no credentials, show the credential form
                    // Check telegramService first, then fall back to .env file
                    const hasCred = !!(this.telegramService && this.telegramService.botToken && this.telegramService.chatId)
                        || (() => { const c = this._getEnvTelegramCreds(); return !!(c.botToken && c.chatId); })();
                    if (!hasCred) {
                        this._showTelegramCredForm = true;
                        this.updateState();
                    } else {
                        if (this.onToggleTelegram) await this.onToggleTelegram();
                        this.updateState();
                    }
                    break;
                }
                case 'saveTelegramCred': {
                    const { botToken, chatId } = message;
                    if (botToken && chatId && this.onSaveTelegramCred) {
                        await this.onSaveTelegramCred(botToken, chatId);
                    }
                    this._showTelegramCredForm = false;
                    this.updateState();
                    break;
                }
                case 'setWritePrdWorkspace': {
                    const folders = vscode.workspace.workspaceFolders;
                    if (!folders || folders.length === 0) {
                        vscode.window.showWarningMessage('워크스페이스가 열려있지 않습니다.');
                        break;
                    }
                    const targetDir = path.join(folders[0].uri.fsPath, '.agent', 'workflows');
                    const targetPath = path.join(targetDir, 'write-prd.md');

                    const templateContent = [
                        '---',
                        'description: PRD(작업 목록) 작성 후 AutoAntigravity Ralph Loop 작업 파일로 자동 적용',
                        '---',
                        '',
                        '# PRD 작성 워크플로우',
                        '',
                        '이 워크플로우는 AI 에이전트가 PRD를 작성하여 AutoAntigravity Ralph Loop의 작업 파일로 즉시 적용하는 과정을 안내합니다.',
                        '',
                        '## 사전 조건',
                        '',
                        '- AutoAntigravity 플러그인이 설치되어 있어야 합니다.',
                        '- `autoAntigravity.ralphLoop.autoStart` 설정이 `true`일 경우, PRD 저장 즉시 Ralph Loop가 자동 시작됩니다.',
                        '',
                        '## PRD 작성 규칙',
                        '',
                        '1. **파일 경로**: 워크스페이스 루트의 `PRD.md` (설정에서 변경 가능: `autoAntigravity.ralphLoop.taskFile`)',
                        '2. **체크박스 형식 필수**: Ralph Loop의 `TaskFileManager`는 `- [ ]` / `- [x]` 패턴만 인식합니다.',
                        '3. **작업 분해**: 큰 작업은 적당히 작은 하위 작업으로 분리하세요 (예: Step 3-1, 3-2, ...).',
                        '   - **단일 파일 수정이거나 논리적으로 밀접한 2~3개 변경은 하나의 Step으로 묶을 것** (예: 같은 클래스의 메서드 추가 + 해당 메서드 호출부 수정은 한 Step)',
                        '   - **검증/빌드 등 5분 이내 완료 가능한 작업은 별도 Step으로 분리하지 말고 이전 Step의 검증 항목으로 포함할 것**',
                        '   - **1~5줄 수정만으로 끝나는 작업을 독립 Step으로 만들지 말 것**',
                        '4. **각 Step 끝에 검증 항목**을 포함하세요.',
                        '5. **마지막 줄**에 반드시 다음을 포함하세요:',
                        '   ```',
                        '   ## 각 단계별 작업 중 필요하다면 PRD에 내용을 추가하거나 변경해라.',
                        '   ```',
                        '',
                        '## 병렬 작업 (`#parallel` 태그)',
                        '',
                        '**이전 작업 완료와 무관하게 독립적으로 실행 가능한 작업**에는 `#parallel` 태그를 붙입니다.',
                        'Ralph Loop가 이 태그를 인식하여 독립적인 git worktree에서 동시에 실행합니다.',
                        '',
                        '### 문법',
                        '',
                        '```markdown',
                        '- [ ] #parallel 작업 설명',
                        '```',
                        '',
                        '### 규칙',
                        '',
                        '1. **연속된 `#parallel` 항목**이 하나의 병렬 그룹을 형성합니다.',
                        '2. 병렬 그룹 사이에 일반 작업이 끼어 있으면 **별개의 그룹**으로 구분됩니다.',
                        '3. **서로 다른 파일을 수정하는 작업**에 사용하세요 — 같은 파일을 수정하면 머지 충돌이 발생합니다.',
                        '',
                        '### AI 판단 기준',
                        '',
                        'AI가 `#parallel` 태그를 붙일 때 고려할 사항:',
                        '- ✅ 서로 다른 모듈/파일을 수정하는 작업',
                        '- ✅ 서로 의존성이 없는 독립적 작업',
                        '- ❌ 이전 작업의 결과물에 의존하는 작업',
                        '- ❌ 같은 파일을 동시에 수정해야 하는 작업',
                        '',
                        '## PRD 템플릿',
                        '',
                        '```markdown',
                        '# [프로젝트/기능 이름] PRD',
                        '',
                        '> **목적**: [이 PRD의 목적을 간략히 설명]',
                        '',
                        '---',
                        '',
                        '## 작업 목록',
                        '',
                        '### Step 1: [단계 제목]',
                        '- [ ] 작업 1-1: [구체적인 작업 설명]',
                        '- [ ] 작업 1-2: [구체적인 작업 설명]',
                        '- [ ] 검증 1: [이 단계의 검증 방법]',
                        '',
                        '### Step 2: [독립적 작업들]',
                        '- [ ] #parallel 작업 2-1: [독립적인 작업 A]',
                        '- [ ] #parallel 작업 2-2: [독립적인 작업 B]',
                        '- [ ] #parallel 작업 2-3: [독립적인 작업 C]',
                        '- [ ] 검증 2: [병렬 작업 통합 검증]',
                        '',
                        '### Step 3: [단계 제목]',
                        '- [ ] 작업 3-1: [구체적인 작업 설명]',
                        '- [ ] 검증 3: [이 단계의 검증 방법]',
                        '',
                        '---',
                        '',
                        '## 각 단계별 작업 중 필요하다면 PRD에 내용을 추가하거나 변경해라.',
                        '```',
                        '',
                        '## 실행 단계',
                        '',
                        '// turbo-all',
                        '',
                        '1. 사용자의 요구사항을 분석하고 위 템플릿에 따라 PRD를 작성합니다.',
                        '2. 워크스페이스 루트에 `PRD.md`로 저장합니다.',
                        '',
                        '## 주의사항',
                        '',
                        '- `- [x]` 완료 마킹은 **직접 하지 마세요** — Ralph Loop가 자동으로 관리합니다.',
                        '- `progress.txt`는 수정하지 마세요 — ProgressTracker가 관리합니다.',
                        '- 이미 완료된 작업은 수정하지 마세요.',
                        '- `#parallel` 태그는 **반드시 서로 독립적인 작업에만** 사용하세요.',
                        ''
                    ].join('\n');

                    const writeTemplate = async () => {
                        try {
                            fs.mkdirSync(targetDir, { recursive: true });
                            fs.writeFileSync(targetPath, templateContent, 'utf8');
                            this._log(`[Sidebar] write-prd workflow created: ${targetPath}`);
                            vscode.window.showInformationMessage(`write-prd 워크플로우가 생성되었습니다: ${targetPath}`);
                            const doc = await vscode.workspace.openTextDocument(targetPath);
                            await vscode.window.showTextDocument(doc, { preview: false });
                        } catch (err) {
                            this._log(`[Sidebar] Failed to create write-prd workflow: ${err.message}`);
                            vscode.window.showErrorMessage(`write-prd 워크플로우 생성 실패: ${err.message}`);
                        }
                        this.updateState();
                    };

                    if (fs.existsSync(targetPath)) {
                        const answer = await vscode.window.showWarningMessage(
                            `write-prd.md 파일이 이미 존재합니다. 덮어쓰시겠습니까?`,
                            { modal: true },
                            '덮어쓰기'
                        );
                        if (answer === '덮어쓰기') {
                            await writeTemplate();
                        }
                    } else {
                        await writeTemplate();
                    }
                    break;
                }
                case 'enqueueTask': {
                    const text = message.text;
                    if (text) {
                        const isIdle = this.ralphLoop && !this.ralphLoop.isBusy();
                        if (isIdle) {
                            // idle 상태 → 큐에 넣지 않고 즉시 실행 (작업 판단 + 코드 리뷰 포함)
                            this._log(`[Sidebar] 🚀 독립 작업 실행 (idle): ${text.substring(0, 50)}...`);
                            this.ralphLoop.runStandaloneTask(text).then(() => {
                                this._log(`[Sidebar] ✅ 독립 작업 완료`);
                                this.updateState();
                            }).catch(err => {
                                this._log(`[Sidebar] ❌ 독립 작업 실패: ${err.message}`);
                                this.updateState();
                            });
                        } else {
                            // 실행 중 → 큐에 추가
                            this._taskQueue.push({ text, mediaPaths: [] });
                            this._log(`[Sidebar] Task enqueued: ${text.substring(0, 50)}...`);
                        }
                    }
                    this.updateState();
                    break;
                }
                case 'dequeueTask': {
                    const idx = message.index;
                    if (typeof idx === 'number' && idx >= 0 && idx < this._taskQueue.length) {
                        const removed = this._taskQueue.splice(idx, 1);
                        this._log(`[Sidebar] Task dequeued: ${removed[0].text.substring(0, 50)}...`);
                    }
                    this.updateState();
                    break;
                }
                case 'ready':
                    this.updateState();
                    break;
            }
        });

        // When the view becomes visible, send the current state
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.updateState();
            }
        });
    }

    /**
     * Send the current state to the webview (debounced)
     */
    updateState() {
        if (!this._view || !this._view.visible) return;
        // Debounce: coalesce rapid-fire calls into one update
        if (this._updateDebounceTimer) return;
        this._updateDebounceTimer = setTimeout(() => {
            this._updateDebounceTimer = null;
            this._sendState();
        }, 300);
    }

    /** Cached fs.existsSync with TTL */
    _cachedExistsSync(filePath) {
        if (!filePath) return false;
        const cached = this._fsCache.get(filePath);
        if (cached && Date.now() < cached.expiry) return cached.value;
        const result = fs.existsSync(filePath);
        this._fsCache.set(filePath, { value: result, expiry: Date.now() + this._fsCacheTtl });
        return result;
    }

    /** Actually send the current state to the webview */
    _sendState() {
        if (!this._view || !this._view.visible) return;

        const config = vscode.workspace.getConfiguration('autoAntigravity');

        const state = {
            version: this._context.extension.packageJSON.version || 'unknown',
            autoAcceptEnabled: this.autoAccept ? this.autoAccept.isEnabled : false,
            ralphState: this.ralphLoop ? (this.ralphLoop.isBusy() ? 'running' : this.ralphLoop.getState()) : 'idle',
            currentIteration: this.ralphLoop ? this.ralphLoop.currentIteration : 0,
            maxIterations: config.get('ralphLoop.maxIterations', 50),
            iterationDelay: config.get('ralphLoop.iterationDelayMs', 1500),

            allowPrdModification: config.get('ralphLoop.allowPrdModification', false),
            autoStart: config.get('ralphLoop.autoStart', true),
            autoCommit: config.get('ralphLoop.autoCommit', true),
            autoDeleteBranch: config.get('ralphLoop.autoDeleteBranch', true),
            enableCodeReview: config.get('ralphLoop.enableCodeReview', false),
            codeReviewModel: config.get('codeReview.model', 'flash'),
            autoPush: config.get('ralphLoop.autoPush', false),
            taskFile: this.ralphLoop && this.ralphLoop.taskManager
                ? this.ralphLoop.taskManager.getTaskFile()
                : null,
            taskFileExists: (() => {
                const tf = this.ralphLoop && this.ralphLoop.taskManager
                    ? this.ralphLoop.taskManager.getTaskFile()
                    : null;
                return this._cachedExistsSync(tf);
            })(),
            progress: this.ralphLoop && this.ralphLoop.taskManager
                ? this.ralphLoop.taskManager.getProgress()
                : { total: 0, completed: 0, remaining: 0 },
            // 로그, 에러, PRD 변경 정보
            recentLogs: this.ralphLoop ? this.ralphLoop.getRecentLogs(30) : [],
            lastError: this.ralphLoop ? this.ralphLoop.lastError : null,
            consecutiveErrors: this.ralphLoop ? this.ralphLoop.consecutiveErrors : 0,
            prdChanges: this.ralphLoop ? this.ralphLoop.getPrdChanges() : [],
            // 텔레메트리
            quota: this.telemetryService ? this.telemetryService.getData() : { connected: false, models: [] },
            // 텔레그램 상태
            telegramConnected: !!(this.telegramService && this.telegramService.isConnected && this.telegramService.isConnected()),
            telegramDetailedNotification: !!(this.telegramService && this.telegramService.detailedNotification),
            telegramHasCred: !!(this.telegramService && this.telegramService.botToken && this.telegramService.chatId)
                || (() => { const c = this._getEnvTelegramCreds(); return !!(c.botToken && c.chatId); })(),
            showTelegramCredForm: this._showTelegramCredForm || false,
            // write-prd 워크플로우 존재 여부
            hasWritePrdWorkspace: (() => {
                const folders = vscode.workspace.workspaceFolders;
                if (!folders || folders.length === 0) return false;
                return this._cachedExistsSync(path.join(folders[0].uri.fsPath, '.agent', 'workflows', 'write-prd.md'));
            })(),
            // 작업 큐
            taskQueue: this._taskQueue.slice()
        };

        this._view.webview.postMessage({ command: 'updateState', state });
    }

    /**
     * Read TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from workspace .env file.
     * Used as fallback when telegramService is null (disconnected).
     * @returns {{ botToken: string, chatId: string }}
     */
    _getEnvTelegramCreds() {
        let botToken = '';
        let chatId = '';
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            const envPath = path.join(folders[0].uri.fsPath, '.env');
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf-8');
                for (const line of content.split('\n')) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('TELEGRAM_BOT_TOKEN=')) {
                        botToken = trimmed.substring('TELEGRAM_BOT_TOKEN='.length).trim();
                    } else if (trimmed.startsWith('TELEGRAM_CHAT_ID=')) {
                        chatId = trimmed.substring('TELEGRAM_CHAT_ID='.length).trim();
                    }
                }
            }
        }
        return { botToken, chatId };
    }

    /**
     * Generate the HTML for the sidebar webview
     */
    _getHtml(webview) {
        return getSidebarHtml(webview, vscode.env.language);
    }
}

module.exports = { RalphSidebarProvider };
