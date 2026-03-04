// AutoAntigravity — Git Branch Manager for Ralph Loop
// Manages git branching to isolate each task's work from the original branch
// Creates a per-task branch, commits on completion, merges back to original

const cp = require('child_process');
const path = require('path');

class GitManager {
    /**
     * @param {Function} log - Logging function
     */
    constructor(log) {
        this.log = log;
        this._originalBranch = null;   // Branch name before Ralph Loop started
        this._workBranch = null;       // Work branch for the current task
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
     * Initialize session — just record workspace root and original branch.
     * Does NOT create a branch. Per-task branches are created via startTaskBranch().
     *
     * @param {string} workspaceRoot - Workspace root path
     * @returns {{ success: boolean, originalBranch?: string, error?: string }}
     */
    initSession(workspaceRoot) {
        this._workspaceRoot = workspaceRoot;

        if (!this.isGitRepo()) {
            this.log('[Git] ⚠ Git 저장소가 아닙니다 — 브랜치 관리를 건너뜁니다.');
            return { success: false, error: 'Not a git repository' };
        }

        try {
            this._originalBranch = this.getCurrentBranch();
            this.log(`[Git] 📌 원본 브랜치 기록: ${this._originalBranch}`);
            return { success: true, originalBranch: this._originalBranch };
        } catch (e) {
            this.log(`[Git] ❌ 세션 초기화 실패: ${e.message}`);
            this._originalBranch = null;
            return { success: false, error: e.message };
        }
    }

    /**
     * Sanitize task text for use in a branch name
     * @param {string} text
     * @returns {string}
     */
    _sanitizeBranchName(text) {
        return text
            .replace(/[^a-zA-Z0-9가-힣\s-]/g, '')  // keep alphanumeric, Korean, spaces, hyphens
            .trim()
            .replace(/\s+/g, '-')                    // spaces → hyphens
            .substring(0, 40)                        // max length
            .replace(/-+$/, '');                      // trim trailing hyphens
    }

    /**
     * Create and checkout a new branch for a specific task.
     *
     * @param {string} taskText - Task description
     * @param {number} iteration - Iteration number
     * @returns {{ success: boolean, workBranch?: string, error?: string }}
     */
    startTaskBranch(taskText, iteration) {
        if (!this._originalBranch || !this._workspaceRoot) {
            return { success: false, error: 'Session not initialized (call initSession first)' };
        }

        // If a previous task branch is still active, end it first
        if (this._workBranch) {
            this.log(`[Git] ⚠ 이전 작업 브랜치(${this._workBranch})가 아직 활성 — 자동 정리합니다.`);
            this.endTaskBranch(true);
        }

        try {
            // Ensure we're on the original branch before creating a new task branch
            const currentBranch = this.getCurrentBranch();
            if (currentBranch !== this._originalBranch) {
                this._execGit(['checkout', this._originalBranch]);
            }

            // Stash any uncommitted changes on the original branch
            if (this.hasUncommittedChanges()) {
                this.log('[Git] 📦 원본 브랜치의 미커밋 변경사항을 스태시합니다...');
                this._execGit(['stash', 'push', '-m', `ralph-auto-stash-${Date.now()}`]);
                this.log('[Git] ✅ 스태시 완료');
            }

            // Create branch name: ralph/task-{iteration}-{sanitized_name}
            const sanitized = this._sanitizeBranchName(taskText);
            const branchName = sanitized
                ? `ralph/task-${iteration}-${sanitized}`
                : `ralph/task-${iteration}`;
            this._workBranch = branchName;

            this._execGit(['checkout', '-b', this._workBranch]);
            this.log(`[Git] 🌿 작업 브랜치 생성: ${this._workBranch}`);

            return { success: true, workBranch: this._workBranch };

        } catch (e) {
            this.log(`[Git] ❌ 작업 브랜치 생성 실패: ${e.message}`);
            this._workBranch = null;
            return { success: false, error: e.message };
        }
    }

    /**
     * End the current task branch: commit remaining changes, merge back to original.
     *
     * @param {boolean} [autoDeleteBranch=true] - Whether to delete the branch after merge
     * @returns {{ success: boolean, merged: boolean, error?: string }}
     */
    endTaskBranch(autoDeleteBranch = true) {
        if (!this._originalBranch || !this._workBranch) {
            return { success: true, merged: false };
        }

        const workBranch = this._workBranch;

        try {
            // Commit any remaining uncommitted changes on the work branch
            if (this.hasUncommittedChanges()) {
                this.commitAll(`[Ralph] 작업 완료 — 최종 커밋`);
            }

            // Check if there are any commits on the work branch vs original
            let hasWorkCommits = false;
            try {
                const log = this._execGit([
                    'log', `${this._originalBranch}..${workBranch}`, '--oneline'
                ]);
                hasWorkCommits = log.length > 0;
            } catch {
                hasWorkCommits = false;
            }

            if (!hasWorkCommits) {
                // No commits on work branch → just switch back
                this.log('[Git] ℹ 작업 브랜치에 커밋이 없습니다.');
                this._execGit(['checkout', this._originalBranch]);
                if (autoDeleteBranch) {
                    try {
                        this._execGit(['branch', '-d', workBranch]);
                        this.log(`[Git] 🗑 빈 작업 브랜치 삭제: ${workBranch}`);
                    } catch { /* ignore */ }
                }
                this._restoreStash();
                this._workBranch = null;
                return { success: true, merged: false };
            }

            // Merge work branch into original
            this.log(`[Git] 🔀 ${workBranch} → ${this._originalBranch} 머지 중...`);
            this._execGit(['checkout', this._originalBranch]);

            try {
                this._execGit(['merge', workBranch, '--no-ff', '-m',
                    `[Ralph] 작업 완료: ${workBranch} → ${this._originalBranch}`]);
                this.log('[Git] ✅ 머지 완료');

                // Delete work branch after merge (if option enabled)
                if (autoDeleteBranch) {
                    try {
                        this._execGit(['branch', '-d', workBranch]);
                        this.log(`[Git] 🗑 작업 브랜치 삭제: ${workBranch}`);
                    } catch { /* non-critical */ }
                } else {
                    this.log(`[Git] 📌 작업 브랜치 유지: ${workBranch}`);
                }

                this._restoreStash();
                this._workBranch = null;
                return { success: true, merged: true };

            } catch (mergeErr) {
                // Merge conflict
                this.log(`[Git] ⚠ 머지 충돌 발생: ${mergeErr.message}`);
                this.log(`[Git] ℹ 작업 브랜치 '${workBranch}'를 유지합니다. 수동으로 해결해주세요.`);

                try {
                    this._execGit(['merge', '--abort']);
                } catch { /* ignore */ }

                this._restoreStash();
                this._workBranch = null;
                return { success: false, merged: false, error: `Merge conflict: ${mergeErr.message}` };
            }

        } catch (e) {
            this.log(`[Git] ❌ 작업 브랜치 종료 중 에러: ${e.message}`);
            this._workBranch = null;
            return { success: false, merged: false, error: e.message };
        }
    }

    /**
     * Commit changes for the current task iteration
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
     * End the entire session — clean up if a task branch is still open.
     * Called on stop/emergencyStop.
     *
     * @param {{ autoDeleteBranch: boolean }} [options]
     * @returns {{ success: boolean, merged: boolean, error?: string }}
     */
    endSession(options = {}) {
        const { autoDeleteBranch = true } = options;

        // If there's an active task branch, end it
        if (this._workBranch) {
            const result = this.endTaskBranch(autoDeleteBranch);
            this._originalBranch = null;
            return result;
        }

        // No active task branch — just clean up
        this._originalBranch = null;
        this._workBranch = null;
        return { success: true, merged: false };
    }

    /**
     * Try to restore stashed changes on the original branch
     */
    _restoreStash() {
        try {
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
     * Get current session info for UI display
     * @returns {{ active: boolean, originalBranch?: string, workBranch?: string }}
     */
    getSessionInfo() {
        if (!this._originalBranch) {
            return { active: false };
        }
        return {
            active: true,
            originalBranch: this._originalBranch,
            workBranch: this._workBranch || null,
        };
    }
}

module.exports = { GitManager };
