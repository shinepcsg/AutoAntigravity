// AutoAntigravity — Parallel Task Runner
// Orchestrates parallel execution of #parallel task groups
// Uses git worktrees for file isolation, file-based completion markers for status tracking

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/** Marker file name placed in each worktree root on completion */
const COMPLETION_MARKER = 'COMPLETED.marker';

class ParallelTaskRunner {
    /**
     * @param {import('./ralphLoop').RalphLoopManager} ralphLoop - Reference to RalphLoopManager
     */
    constructor(ralphLoop) {
        this._loop = ralphLoop;
        this._log = ralphLoop._addLog.bind(ralphLoop);
    }

    /**
     * Run a group of parallel tasks.
     *
     * Flow:
     * 1. Create worktrees for each task
     * 2. Sequentially send prompts to the agent (one new conversation per task)
     * 3. Wait for ALL completion marker files (file-based polling)
     * 4. Commit each worktree & send task-complete callbacks
     * 5. Sequentially merge into original branch (with auto conflict resolution)
     * 6. Clean up worktrees (markers included)
     * 7. Mark all tasks complete
     *
     * @param {Array<{line: number, text: string, parallel: boolean}>} tasks
     * @param {number} iteration - Current iteration number
     * @returns {Promise<{success: boolean, completed: number, errors: string[]}>}
     */
    async runParallelGroup(tasks, iteration) {
        const gitManager = this._loop.gitManager;
        const taskManager = this._loop.taskManager;
        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const maxParallel = config.get('ralphLoop.maxParallelTasks', 3);
        const autoDeleteBranch = config.get('ralphLoop.autoDeleteBranch', true);

        // Limit group size
        const activeTasks = tasks.slice(0, maxParallel);
        if (tasks.length > maxParallel) {
            this._log(`[Parallel] ⚠ 병렬 그룹 ${tasks.length}개 중 ${maxParallel}개만 실행 (최대 제한)`, 'warn');
        }

        this._log(`[Parallel] ═══ 병렬 그룹 시작: ${activeTasks.length}개 작업 ═══`);
        for (let i = 0; i < activeTasks.length; i++) {
            this._log(`[Parallel]   ${i + 1}. ${activeTasks[i].text}`);
        }

        const worktreeInfos = []; // { task, worktreePath, branchName, index, markerPath }
        const errors = [];
        let completed = 0;

        // ── Phase 1: Create worktrees ──
        this._log('[Parallel] 📁 Phase 1: 워크트리 생성...');
        for (let i = 0; i < activeTasks.length; i++) {
            const task = activeTasks[i];
            const result = gitManager.createWorktree(task.text, i, iteration);
            if (result.success) {
                const markerPath = path.join(result.worktreePath, COMPLETION_MARKER);
                worktreeInfos.push({
                    task,
                    worktreePath: result.worktreePath,
                    branchName: result.branchName,
                    index: i,
                    markerPath
                });
            } else {
                errors.push(`워크트리 생성 실패 (${task.text}): ${result.error}`);
                this._log(`[Parallel] ❌ 워크트리 생성 실패: ${task.text}`, 'error');
            }
        }

        if (worktreeInfos.length === 0) {
            this._log('[Parallel] ❌ 모든 워크트리 생성 실패 — 병렬 실행 중단', 'error');
            return { success: false, completed: 0, errors };
        }

        // ── 기존 마커 파일 정리 (이전 실행 잔여물) ──
        this._cleanupMarkers(worktreeInfos);

        // ── Phase 2: Send prompts sequentially (one new conversation each) ──
        this._log('[Parallel] 📤 Phase 2: 에이전트에 프롬프트 전송...');
        let sentCount = 0;

        for (const info of worktreeInfos) {
            const { LoopState } = require('./ralphLoop');
            if (this._loop.state !== LoopState.RUNNING) {
                this._log('[Parallel] ⚠ 정지 요청 감지 — 추가 프롬프트 전송 중단');
                break;
            }
            try {
                // Build prompt that instructs agent to work in the worktree directory
                const prompt = this._buildParallelPrompt(info, iteration);

                // Send to agent — this opens a new conversation and submits
                this._log(`[Parallel] 📤 전송 중: ${info.task.text}`);
                await this._loop._sendToAgent(prompt);
                this._log(`[Parallel] ✅ 전송 완료: ${info.task.text}`);
                sentCount++;

                // Small delay between conversation creation to avoid CDP race
                await new Promise(r => setTimeout(r, 2000));

            } catch (e) {
                errors.push(`프롬프트 전송 실패 (${info.task.text}): ${e.message}`);
                this._log(`[Parallel] ❌ 전송 실패: ${info.task.text} — ${e.message}`, 'error');
            }
        }

        if (sentCount === 0) {
            this._log('[Parallel] ❌ 모든 프롬프트 전송 실패 — 병렬 실행 중단', 'error');
            this._cleanupMarkers(worktreeInfos);
            this._cleanupWorktrees(worktreeInfos, autoDeleteBranch);
            return { success: false, completed: 0, errors };
        } else if (sentCount < worktreeInfos.length) {
            this._log(`[Parallel] ⚠ 정지로 인해 ${sentCount}/${worktreeInfos.length}개만 전송됨`);
        }

        // ── 이미 전송된 태스크 추적 (Phase 3 ↔ Phase 3.5 간 중복 전송 방지) ──
        const notifiedTasks = new Set();

        // ── Phase 3: Wait for ALL completion markers (file-based polling) ──
        this._log(`[Parallel] ⏳ Phase 3: ${worktreeInfos.length}개 완료 마커 대기 (파일 기반 폴링)...`);
        try {
            const markerResults = await this._waitForAllCompletionMarkers(worktreeInfos, (info, imageFiles) => {
                // ── onMarkerDetected: 마커 감지 즉시 텔레그램 전송 ──
                if (!this._loop.onTaskCompleteCallback) return;

                try {
                    // ImageName 기반으로 메인 워크스페이스의 ResultImages/에서도 검색
                    const mainImages = this._loop._findImageByName(info.task.text);
                    // 워크트리 이미지 + 메인 이미지 병합 (중복 제거)
                    const allImages = [...new Set([...imageFiles, ...mainImages])];

                    const progress = this._loop.taskManager.getProgress();
                    this._loop.onTaskCompleteCallback(info.task.text, iteration, progress, allImages);
                    notifiedTasks.add(info.task.line);
                    this._log(`[Parallel] 📨 즉시 전송 완료: Worker ${info.index + 1} (이미지 ${allImages.length}개)`);
                } catch (cbErr) {
                    this._log(`[Parallel] ⚠ 즉시 전송 콜백 에러: ${cbErr.message}`, 'warn');
                }
            });

            // 각 Worker 결과 처리
            for (const mr of markerResults) {
                if (mr.success) {
                    completed++;
                    this._log(`[Parallel] ✅ 완료 감지: Worker ${mr.index + 1} — ${mr.task.text}`);
                } else {
                    errors.push(`마커 타임아웃 (${mr.task.text})`);
                    this._log(`[Parallel] ⚠ 마커 미감지: Worker ${mr.index + 1} — ${mr.task.text}`, 'warn');
                }
            }
        } catch (e) {
            // QUOTA 에러 등은 상위로 전파
            if (e.message === 'QUOTA_REACHED' || e.message === 'QUOTA_PAUSE_CANCELLED') {
                this._cleanupMarkers(worktreeInfos);
                throw e;
            }
            errors.push(`마커 대기 에러: ${e.message}`);
            this._log(`[Parallel] ❌ 마커 대기 실패: ${e.message}`, 'error');
        }

        // ── Phase 3.5: Commit all worktrees & fire callbacks ──
        this._log('[Parallel] 💾 Phase 3.5: 워크트리 커밋...');
        for (const info of worktreeInfos) {
            try {
                const shortTask = info.task.text.length > 60
                    ? info.task.text.substring(0, 57) + '...'
                    : info.task.text;
                gitManager.commitWorktree(info.worktreePath, `[Ralph #${iteration}] (parallel) ${shortTask}`);

                // ── 개별 작업 완료: ImageName 기반 이미지 감지 → 텔레그램 전송 ──
                // notifiedTasks에 이미 있는 태스크는 Phase 3에서 즉시 전송 완료 → 스킵
                if (this._loop.onTaskCompleteCallback && !notifiedTasks.has(info.task.line)) {
                    try {
                        const newImages = this._loop._findImageByName(info.task.text);
                        const progress = this._loop.taskManager.getProgress();
                        this._loop.onTaskCompleteCallback(info.task.text, iteration, progress, newImages);
                        this._log(`[Parallel] 📨 Phase 3.5 전송: ${info.task.text.substring(0, 40)}...`);
                    } catch (cbErr) {
                        this._log(`[Parallel] ⚠ onTaskCompleteCallback 에러: ${cbErr.message}`, 'warn');
                    }
                } else if (notifiedTasks.has(info.task.line)) {
                    this._log(`[Parallel] ⏭ Phase 3.5 스킵 (이미 전송됨): ${info.task.text.substring(0, 40)}...`);
                }
            } catch (commitErr) {
                this._log(`[Parallel] ⚠ 커밋 에러 (${info.task.text}): ${commitErr.message}`, 'warn');
            }
        }

        // ── Phase 4: Merge all completed branches ──
        this._log('[Parallel] 🔀 Phase 4: 원본 브랜치에 머지...');
        let mergeErrors = 0;

        for (const info of worktreeInfos) {
            const mergeResult = gitManager.mergeWorktreeBranch(info.branchName, true);
            if (mergeResult.success && mergeResult.merged) {
                if (mergeResult.conflictsResolved > 0) {
                    this._log(`[Parallel] ✅ ${info.branchName} 머지 완료 (${mergeResult.conflictsResolved}개 충돌 자동 해결)`);
                } else {
                    this._log(`[Parallel] ✅ ${info.branchName} 머지 완료`);
                }
            } else if (!mergeResult.success) {
                mergeErrors++;
                errors.push(`머지 실패 (${info.task.text}): ${mergeResult.error}`);
                this._log(`[Parallel] ❌ ${info.branchName} 머지 실패: ${mergeResult.error}`, 'error');
            }
        }

        // ── Phase 5: Mark tasks complete, clean up markers & worktrees ──
        this._log('[Parallel] 🧹 Phase 5: 정리...');

        // Mark all successfully executed tasks as complete
        for (const info of worktreeInfos) {
            taskManager.markTaskComplete(info.task.line);
        }

        // Clean up markers first, then worktrees
        this._cleanupMarkers(worktreeInfos);
        this._cleanupWorktrees(worktreeInfos, autoDeleteBranch);

        // Summary
        const summary = `[Parallel] ═══ 병렬 그룹 완료: ${completed}/${activeTasks.length} 성공, ${errors.length} 에러, ${mergeErrors} 머지 실패 ═══`;
        this._log(summary);

        return {
            success: errors.length === 0,
            completed,
            errors
        };
    }

    /**
     * Build a prompt for a parallel task that instructs the agent to
     * work in the worktree directory and create a completion marker file.
     *
     * @param {{ task: object, worktreePath: string, branchName: string, index: number, markerPath: string }} info
     * @param {number} iteration
     * @returns {string}
     */
    _buildParallelPrompt(info, iteration) {
        const taskFilePath = this._loop.taskManager.getTaskFile();

        var prompt = '# Ralph Loop \u2014 Parallel Task (Iteration ' + iteration + ', Worker ' + (info.index + 1) + ')\n\n';
        prompt += '## Current Task\n' + info.task.text + '\n\n';
        prompt += '## IMPORTANT: Working Directory\n';
        prompt += '\uc774 \uc791\uc5c5\uc740 \ubcd1\ub82c \uc2e4\ud589 \uc911\uc785\ub2c8\ub2e4. **\ubc18\ub4dc\uc2dc \uc544\ub798 \uc6cc\ud06c\ud2b8\ub9ac \ub514\ub809\ud1a0\ub9ac\uc5d0\uc11c \uc791\uc5c5\ud558\uc138\uc694**:\n';
        prompt += '`' + info.worktreePath + '`\n\n';
        prompt += '\u26a0 \uba54\uc778 \uc6cc\ud06c\uc2a4\ud398\uc774\uc2a4 \ub514\ub809\ud1a0\ub9ac\uac00 \uc544\ub2cc \uc704 \uacbd\ub85c\uc5d0\uc11c\ub9cc \ud30c\uc77c\uc744 \uc0dd\uc131/\uc218\uc815\ud558\uc138\uc694.\n\n';
        prompt += '## Instructions\n';
        prompt += '1. Read the task file at `' + taskFilePath + '` for full context\n';
        prompt += '2. Work ONLY within the worktree directory: `' + info.worktreePath + '`\n';
        prompt += '3. Complete EXACTLY ONE task: "' + info.task.text + '"\n';
        prompt += '4. Do NOT modify the progress file \u2014 it is managed automatically\n';
        prompt += '5. When done, verify your changes work correctly\n';
        prompt += '6. **[\ud544\uc218] \ubaa8\ub4e0 \uc791\uc5c5\uc774 \uc644\ub8cc\ub41c \ud6c4 \ubc18\ub4dc\uc2dc \uc544\ub798 \ud30c\uc77c\uc744 \uc0dd\uc131\ud558\uc138\uc694** (\uc624\ucf00\uc2a4\ud2b8\ub808\uc774\ud130\uac00 \uc644\ub8cc \uc5ec\ubd80\ub97c \uc774 \ud30c\uc77c\ub85c \ud310\ub2e8\ud569\ub2c8\ub2e4):\n';
        prompt += '   `' + info.markerPath + '`\n';
        prompt += '   \ud30c\uc77c \ub0b4\uc6a9\uc740 `DONE` \ud55c \uc904\uc774\uba74 \ub429\ub2c8\ub2e4. write_to_file \ub3c4\uad6c\ub97c \uc0ac\uc6a9\ud558\uc138\uc694.\n';

        return prompt;
    }

    /**
     * Wait for ALL completion marker files to appear in worktree directories.
     * Polls every POLL_INTERVAL_MS until all markers are found or timeout.
     *
     * @param {Array<{task: object, worktreePath: string, index: number, markerPath: string}>} worktreeInfos
     * @param {Function} [onMarkerDetected] - Optional callback invoked when a marker is detected.
     *   Called with (worktreeInfo, imageFiles) where imageFiles is an array of image file paths
     *   found in the worktree's ResultImages/ directory.
     * @returns {Promise<Array<{task: object, index: number, success: boolean}>>}
     */
    async _waitForAllCompletionMarkers(worktreeInfos, onMarkerDetected) {
        const MAX_WAIT_MS = 3600000;     // 1시간 최대
        const POLL_INTERVAL_MS = 3000;   // 3초마다 폴링
        const INITIAL_WAIT_MS = 5000;    // 에이전트 시작 대기 5초
        const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        // 초기 대기
        this._log(`[Parallel] ⏳ 에이전트 시작 대기 (${INITIAL_WAIT_MS / 1000}초)...`);
        await delay(INITIAL_WAIT_MS);

        // 각 Worker의 완료 상태 추적
        const pending = new Set(worktreeInfos.map((_, i) => i));
        const results = worktreeInfos.map(info => ({
            task: info.task,
            index: info.index,
            success: false
        }));

        let elapsed = INITIAL_WAIT_MS;
        let lastLogTime = 0;

        while (elapsed < MAX_WAIT_MS && pending.size > 0) {
            // 루프 상태 확인 (중단 시 즉시 반환)
            const { LoopState } = require('./ralphLoop');
            if (this._loop.state !== LoopState.RUNNING) {
                this._log('[Parallel] ⚠ 루프 상태 변경 — 마커 대기 취소');
                return results;
            }

            // 각 미완료 Worker의 마커 파일 존재 확인
            for (const i of [...pending]) {
                const info = worktreeInfos[i];
                try {
                    if (fs.existsSync(info.markerPath)) {
                        results[i].success = true;
                        pending.delete(i);
                        this._log(`[Parallel] 📄 마커 감지: Worker ${i + 1} (${info.task.text.substring(0, 40)}...) — ${Math.round(elapsed / 1000)}초 경과`);

                        // 마커 감지 즉시: worktree의 ResultImages/에서 이미지 검색 및 콜백 호출
                        if (typeof onMarkerDetected === 'function') {
                            try {
                                const resultImagesDir = path.join(info.worktreePath, 'ResultImages');
                                const imageFiles = [];

                                if (fs.existsSync(resultImagesDir)) {
                                    const files = fs.readdirSync(resultImagesDir);
                                    for (const file of files) {
                                        const ext = path.extname(file).toLowerCase();
                                        if (IMAGE_EXTS.includes(ext)) {
                                            imageFiles.push(path.join(resultImagesDir, file));
                                        }
                                    }
                                }

                                this._log(`[Parallel] 🖼 Worker ${i + 1} ResultImages/ 이미지 ${imageFiles.length}개 감지`);
                                onMarkerDetected(info, imageFiles);
                            } catch (cbErr) {
                                this._log(`[Parallel] ⚠ onMarkerDetected 콜백 에러: ${cbErr.message}`, 'warn');
                            }
                        }
                    }
                } catch (e) {
                    // fs 에러는 무시하고 다음 폴링에서 재시도
                }
            }

            if (pending.size === 0) break;

            // 30초마다 진행 상황 로그
            if (elapsed - lastLogTime >= 30000) {
                const doneCount = worktreeInfos.length - pending.size;
                this._log(`[Parallel] ⏳ 마커 대기 중: ${doneCount}/${worktreeInfos.length} 완료, ${Math.round(elapsed / 1000)}초 경과`);
                lastLogTime = elapsed;
            }

            await delay(POLL_INTERVAL_MS);
            elapsed += POLL_INTERVAL_MS;
        }

        if (pending.size > 0) {
            this._log(`[Parallel] ⚠ 마커 대기 타임아웃: ${pending.size}개 미완료 (${Math.round(elapsed / 1000)}초 경과)`, 'warn');
        } else {
            this._log(`[Parallel] ✅ 모든 마커 감지 완료 (${Math.round(elapsed / 1000)}초 경과)`);
        }

        return results;
    }

    /**
     * Clean up completion marker files from all worktrees.
     * Called on: normal completion, error, loop interruption.
     *
     * @param {Array<{markerPath: string}>} worktreeInfos
     */
    _cleanupMarkers(worktreeInfos) {
        for (const info of worktreeInfos) {
            try {
                if (fs.existsSync(info.markerPath)) {
                    fs.unlinkSync(info.markerPath);
                }
            } catch (e) {
                // 정리 실패는 무시 (워크트리 삭제 시 함께 제거됨)
            }
        }
    }

    /**
     * Clean up all worktree directories and branches.
     *
     * @param {Array<{worktreePath: string, branchName: string}>} worktreeInfos
     * @param {boolean} deleteBranches
     */
    _cleanupWorktrees(worktreeInfos, deleteBranches) {
        const gitManager = this._loop.gitManager;
        for (const info of worktreeInfos) {
            gitManager.removeWorktree(info.worktreePath, info.branchName, deleteBranches);
        }
        gitManager.cleanupWorktrees();
    }
}

module.exports = { ParallelTaskRunner };
