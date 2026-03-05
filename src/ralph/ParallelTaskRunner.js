// AutoAntigravity — Parallel Task Runner
// Orchestrates parallel execution of [병렬진행] task groups
// Uses git worktrees for file isolation and CDP for agent communication

const vscode = require('vscode');
const path = require('path');

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
     * 3. Wait for all agents to complete (Promise.all polling)
     * 4. Commit each worktree
     * 5. Sequentially merge into original branch (with auto conflict resolution)
     * 6. Clean up worktrees
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

        const worktreeInfos = []; // { task, worktreePath, branchName, conversationWsUrl }
        const errors = [];
        let completed = 0;

        // ── Phase 1: Create worktrees ──
        this._log('[Parallel] 📁 Phase 1: 워크트리 생성...');
        for (let i = 0; i < activeTasks.length; i++) {
            const task = activeTasks[i];
            const result = gitManager.createWorktree(task.text, i, iteration);
            if (result.success) {
                worktreeInfos.push({
                    task,
                    worktreePath: result.worktreePath,
                    branchName: result.branchName,
                    index: i
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

        // ── Phase 2: Send prompts sequentially (one new conversation each) ──
        this._log('[Parallel] 📤 Phase 2: 에이전트에 프롬프트 전송...');
        const agentPromises = [];

        for (const info of worktreeInfos) {
            try {
                // Build prompt that instructs agent to work in the worktree directory
                const prompt = this._buildParallelPrompt(info, iteration);

                // Send to agent — this opens a new conversation and submits
                this._log(`[Parallel] 📤 전송 중: ${info.task.text}`);
                await this._loop._sendToAgent(prompt);
                this._log(`[Parallel] ✅ 전송 완료: ${info.task.text}`);

                // Small delay between conversation creation to avoid CDP race
                await new Promise(r => setTimeout(r, 2000));

                // Start completion monitoring for this task
                agentPromises.push(
                    this._waitForAgentAndCommit(info, iteration)
                );

            } catch (e) {
                errors.push(`프롬프트 전송 실패 (${info.task.text}): ${e.message}`);
                this._log(`[Parallel] ❌ 전송 실패: ${info.task.text} — ${e.message}`, 'error');
            }
        }

        if (agentPromises.length === 0) {
            this._log('[Parallel] ❌ 모든 프롬프트 전송 실패 — 병렬 실행 중단', 'error');
            this._cleanupWorktrees(worktreeInfos, autoDeleteBranch);
            return { success: false, completed: 0, errors };
        }

        // ── Phase 3: Wait for all agents to complete ──
        this._log(`[Parallel] ⏳ Phase 3: ${agentPromises.length}개 에이전트 완료 대기...`);
        const results = await Promise.allSettled(agentPromises);

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.success) {
                completed++;
            } else {
                const reason = result.status === 'rejected'
                    ? result.reason?.message || String(result.reason)
                    : result.value?.error || '알 수 없는 에러';
                errors.push(reason);
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

        // ── Phase 5: Mark tasks complete and clean up ──
        this._log('[Parallel] 🧹 Phase 5: 정리...');

        // Mark all successfully executed tasks as complete
        for (const info of worktreeInfos) {
            taskManager.markTaskComplete(info.task.line);
        }

        // Clean up worktrees
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
     * work in the worktree directory.
     *
     * @param {{ task: object, worktreePath: string, branchName: string, index: number }} info
     * @param {number} iteration
     * @returns {string}
     */
    _buildParallelPrompt(info, iteration) {
        const taskFilePath = this._loop.taskManager.getTaskFile();
        const progressFilePath = this._loop.progressTracker.getProgressFilePath();

        let prompt = `# Ralph Loop — Parallel Task (Iteration ${iteration}, Worker ${info.index + 1})\n\n`;
        prompt += `## Current Task\n${info.task.text}\n\n`;
        prompt += `## IMPORTANT: Working Directory\n`;
        prompt += `이 작업은 병렬 실행 중입니다. **반드시 아래 워크트리 디렉토리에서 작업하세요**:\n`;
        prompt += `\`${info.worktreePath}\`\n\n`;
        prompt += `⚠ 메인 워크스페이스 디렉토리가 아닌 위 경로에서만 파일을 생성/수정하세요.\n\n`;
        prompt += `## Instructions\n`;
        prompt += `1. Read the task file at \`${taskFilePath}\` for full context\n`;
        prompt += `2. Work ONLY within the worktree directory: \`${info.worktreePath}\`\n`;
        prompt += `3. Complete EXACTLY ONE task: "${info.task.text}"\n`;
        prompt += `4. Do NOT modify the progress file — it is managed automatically\n`;
        prompt += `5. When done, verify your changes work correctly\n`;

        // Convert literal \\n to newlines
        prompt = prompt.replace(/\\n/g, '\n');
        return prompt;
    }

    /**
     * Wait for the current agent to complete, then commit changes in the worktree.
     *
     * @param {{ task: object, worktreePath: string, branchName: string }} info
     * @param {number} iteration
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async _waitForAgentAndCommit(info, iteration) {
        try {
            // Wait for agent completion using the shared mechanism
            await this._loop._waitForAgentCompletion();
            this._log(`[Parallel] ✅ 에이전트 완료: ${info.task.text}`);

            // Commit changes in the worktree
            const gitManager = this._loop.gitManager;
            const shortTask = info.task.text.length > 60
                ? info.task.text.substring(0, 57) + '...'
                : info.task.text;
            gitManager.commitWorktree(info.worktreePath, `[Ralph #${iteration}] (parallel) ${shortTask}`);

            return { success: true };
        } catch (e) {
            this._log(`[Parallel] ❌ 에이전트 실패: ${info.task.text} — ${e.message}`, 'error');
            return { success: false, error: e.message };
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
