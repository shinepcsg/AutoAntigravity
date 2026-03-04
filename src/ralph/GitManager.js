// AutoAntigravity — Git Branch Manager for Ralph Loop
// Manages git branching to isolate task work from the original branch
// Creates a work branch on start, commits per iteration, merges on completion

const cp = require('child_process');
const path = require('path');

class GitManager {
    /**
     * @param {Function} log - Logging function
     */
    constructor(log) {
        this.log = log;
        this._originalBranch = null;   // Branch name before Ralph Loop started
        this._workBranch = null;       // Work branch created for this loop session
        this._workspaceRoot = null;    // Workspace root path for git commands
    }

    /**
     * Execute a git command synchronously
     * @param {string[]} args - Git command arguments
     * @returns {string} stdout output trimmed
     * @throws {Error} if git command fails
     */
    _execGit(args) {
        const result = cp.spawnSync('git', args, {
            cwd: this._workspaceRoot,
            encoding: 'utf8',
            timeout: 30000,
            windowsHide: true,
        });
        if (result.status !== 0) {
            const stderr = (result.stderr || '').trim();
            throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
        }
        return (result.stdout || '').trim();
    }

    /**
     * Check if the workspace is a git repository
     * @returns {boolean}
     */
    isGitRepo() {
        try {
            this._execGit(['rev-parse', '--is-inside-work-tree']);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the current branch name
     * @returns {string} current branch name
     */
    getCurrentBranch() {
        return this._execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    }

    /**
     * Check if working tree has uncommitted changes
     * @returns {boolean}
     */
    hasUncommittedChanges() {
        const status = this._execGit(['status', '--porcelain']);
        return status.length > 0;
    }

    /**
     * Stage all changes and commit
     * @param {string} message - Commit message
     * @returns {boolean} true if committed, false if nothing to commit
     */
    commitAll(message) {
        try {
            this._execGit(['add', '-A']);
            const status = this._execGit(['status', '--porcelain']);
            if (!status) {
                this.log('[Git] 커밋할 변경사항이 없습니다.');
                return false;
            }
            this._execGit(['commit', '-m', message]);
            this.log(`[Git] ✅ 커밋 완료: ${message}`);
            return true;
        } catch (e) {
            this.log(`[Git] ⚠ 커밋 실패: ${e.message}`);
            return false;
        }
    }

    /**
     * Initialize git branch management for a new Ralph Loop session
     * 1. Save the current branch name
     * 2. Stash any uncommitted changes on the original branch
     * 3. Create and checkout a new work branch
     * 
     * @param {string} workspaceRoot - Workspace root path
     * @returns {{ success: boolean, workBranch?: string, error?: string }}
     */
    startSession(workspaceRoot) {
        this._workspaceRoot = workspaceRoot;

        if (!this.isGitRepo()) {
            this.log('[Git] ⚠ Git 저장소가 아닙니다 — 브랜치 관리를 건너뜁니다.');
            return { success: false, error: 'Not a git repository' };
        }

        try {
            // 1. Remember the original branch
            this._originalBranch = this.getCurrentBranch();
            this.log(`[Git] 📌 원본 브랜치 기록: ${this._originalBranch}`);

            // 2. Stash any uncommitted changes on the original branch
            if (this.hasUncommittedChanges()) {
                this.log('[Git] 📦 원본 브랜치의 미커밋 변경사항을 스태시합니다...');
                this._execGit(['stash', 'push', '-m', `ralph-auto-stash-${Date.now()}`]);
                this.log('[Git] ✅ 스태시 완료');
            }

            // 3. Create work branch with timestamp
            const timestamp = new Date().toISOString()
                .replace(/[:.]/g, '-')
                .replace('T', '_')
                .slice(0, 19);
            this._workBranch = `ralph/task-${timestamp}`;

            this._execGit(['checkout', '-b', this._workBranch]);
            this.log(`[Git] 🌿 작업 브랜치 생성 및 체크아웃: ${this._workBranch}`);

            return { success: true, workBranch: this._workBranch };

        } catch (e) {
            this.log(`[Git] ❌ 브랜치 세션 시작 실패: ${e.message}`);
            this._originalBranch = null;
            this._workBranch = null;
            return { success: false, error: e.message };
        }
    }

    /**
     * Commit changes after an iteration
     * @param {number} iteration - Current iteration number
     * @param {string} taskText - Completed task description
     * @returns {boolean} true if committed
     */
    commitIteration(iteration, taskText) {
        if (!this._workBranch) return false;

        // Truncate task text for commit message
        const shortTask = taskText.length > 80
            ? taskText.substring(0, 77) + '...'
            : taskText;
        const message = `[Ralph #${iteration}] ${shortTask}`;
        return this.commitAll(message);
    }

    /**
     * End the session: merge work branch back into original branch
     * Called when all tasks are completed or loop is stopped
     * 
     * @param {{ mergeOnStop: boolean }} [options] - Options
     *   mergeOnStop: if true, merge even when stopped early (default: true)
     * @returns {{ success: boolean, merged: boolean, error?: string }}
     */
    endSession(options = {}) {
        const { mergeOnStop = true } = options;

        if (!this._originalBranch || !this._workBranch) {
            this.log('[Git] ℹ Git 세션이 활성화되어 있지 않습니다.');
            return { success: true, merged: false };
        }

        try {
            // Commit any remaining uncommitted changes on the work branch
            if (this.hasUncommittedChanges()) {
                this.commitAll('[Ralph] 최종 미커밋 변경사항 커밋');
            }

            // Check if there are any commits on the work branch vs original
            let hasWorkCommits = false;
            try {
                const log = this._execGit([
                    'log', `${this._originalBranch}..${this._workBranch}`, '--oneline'
                ]);
                hasWorkCommits = log.length > 0;
            } catch {
                hasWorkCommits = false;
            }

            if (!hasWorkCommits) {
                // No commits on work branch → just switch back and delete
                this.log('[Git] ℹ 작업 브랜치에 커밋이 없습니다 — 브랜치를 삭제합니다.');
                this._execGit(['checkout', this._originalBranch]);
                try {
                    this._execGit(['branch', '-d', this._workBranch]);
                } catch { /* ignore if already deleted */ }
                this._restoreStash();
                this._cleanup();
                return { success: true, merged: false };
            }

            if (!mergeOnStop) {
                // Don't merge, just switch back
                this.log('[Git] ℹ 머지 없이 원본 브랜치로 복귀합니다.');
                this._execGit(['checkout', this._originalBranch]);
                this.log(`[Git] 📌 작업 브랜치 '${this._workBranch}'는 유지됩니다.`);
                this._restoreStash();
                this._cleanup();
                return { success: true, merged: false };
            }

            // Merge work branch into original
            this.log(`[Git] 🔀 작업 브랜치를 원본 브랜치(${this._originalBranch})에 머지합니다...`);
            this._execGit(['checkout', this._originalBranch]);

            try {
                this._execGit(['merge', this._workBranch, '--no-ff', '-m',
                    `[Ralph] 태스크 완료: ${this._workBranch} → ${this._originalBranch}`]);
                this.log('[Git] ✅ 머지 완료');

                // Delete work branch after successful merge
                try {
                    this._execGit(['branch', '-d', this._workBranch]);
                    this.log(`[Git] 🗑 작업 브랜치 삭제: ${this._workBranch}`);
                } catch { /* non-critical */ }

                this._restoreStash();
                this._cleanup();
                return { success: true, merged: true };

            } catch (mergeErr) {
                // Merge conflict — leave both branches intact for manual resolution
                this.log(`[Git] ⚠ 머지 충돌 발생: ${mergeErr.message}`);
                this.log(`[Git] ℹ 작업 브랜치 '${this._workBranch}'를 유지합니다. 수동으로 해결해주세요.`);

                // Abort the failed merge
                try {
                    this._execGit(['merge', '--abort']);
                } catch { /* ignore */ }

                this._restoreStash();
                this._cleanup();
                return { success: false, merged: false, error: `Merge conflict: ${mergeErr.message}` };
            }

        } catch (e) {
            this.log(`[Git] ❌ 세션 종료 중 에러: ${e.message}`);
            this._cleanup();
            return { success: false, merged: false, error: e.message };
        }
    }

    /**
     * Try to restore stashed changes on the original branch
     */
    _restoreStash() {
        try {
            // Check if there's a ralph auto-stash to restore
            const stashList = this._execGit(['stash', 'list']);
            if (stashList.includes('ralph-auto-stash-')) {
                this._execGit(['stash', 'pop']);
                this.log('[Git] 📦 스태시된 변경사항을 복원했습니다.');
            }
        } catch (e) {
            this.log(`[Git] ⚠ 스태시 복원 실패: ${e.message}`);
        }
    }

    /**
     * Clean up internal state
     */
    _cleanup() {
        this._originalBranch = null;
        this._workBranch = null;
    }

    /**
     * Get current session info for UI display
     * @returns {{ active: boolean, originalBranch?: string, workBranch?: string }}
     */
    getSessionInfo() {
        if (!this._originalBranch || !this._workBranch) {
            return { active: false };
        }
        return {
            active: true,
            originalBranch: this._originalBranch,
            workBranch: this._workBranch,
        };
    }
}

module.exports = { GitManager };
