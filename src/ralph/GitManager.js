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
        this._originalBranch = null;   // Branch name before Ralph Loop started (e.g. main)
        this._sessionName = null;      // Session name segment (session-{timestamp}-{label})
        this._sessionBranch = null;    // Session branch (ralph/{sessionName}/session)
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
     * Initialize session — record workspace root, original branch, and create a session branch.
     * The session branch serves as the integration branch for all task branches.
     * Flow: originalBranch(main) ← sessionBranch ← taskBranches
     *
     * @param {string} workspaceRoot - Workspace root path
     * @param {string} [sessionLabel=''] - Optional label to append to the session branch name
     * @returns {{ success: boolean, originalBranch?: string, sessionBranch?: string, error?: string }}
     */
    initSession(workspaceRoot, sessionLabel = '') {
        this._workspaceRoot = workspaceRoot;

        if (!this.isGitRepo()) {
            this.log('[Git] ⚠ Git 저장소가 아닙니다 — 브랜치 관리를 건너뜁니다.');
            return { success: false, error: 'Not a git repository' };
        }

        try {
            this._originalBranch = this.getCurrentBranch();
            this.log(`[Git] 📌 원본 브랜치 기록: ${this._originalBranch}`);

            // Stash any uncommitted changes before creating session branch
            if (this.hasUncommittedChanges()) {
                this.log('[Git] 📦 미커밋 변경사항을 스태시합니다...');
                this._execGit(['stash', 'push', '-m', `ralph-auto-stash-${Date.now()}`]);
                this.log('[Git] ✅ 스태시 완료');
            }

            // Create session branch from original branch
            const now = new Date();
            const timestamp = now.getFullYear().toString() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '-' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0');
            const sanitized = sessionLabel ? this._sanitizeBranchName(sessionLabel) : '';
            this._sessionName = sanitized
                ? `session-${timestamp}-${sanitized}`
                : `session-${timestamp}`;
            this._sessionBranch = `ralph/${this._sessionName}/session`;

            this._execGit(['checkout', '-b', this._sessionBranch]);
            this.log(`[Git] 🌿 세션 브랜치 생성: ${this._sessionBranch} (from ${this._originalBranch})`);

            return { success: true, originalBranch: this._originalBranch, sessionBranch: this._sessionBranch };
        } catch (e) {
            this.log(`[Git] ❌ 세션 초기화 실패: ${e.message}`);
            this._originalBranch = null;
            this._sessionName = null;
            this._sessionBranch = null;
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
     * Task branches are created from the session branch (not from original/main).
     *
     * @param {string} taskText - Task description
     * @param {number} iteration - Iteration number
     * @returns {{ success: boolean, workBranch?: string, error?: string }}
     */
    startTaskBranch(taskText, iteration) {
        // Use session branch as base; fall back to original branch if no session branch
        const baseBranch = this._sessionBranch || this._originalBranch;
        if (!baseBranch || !this._workspaceRoot) {
            return { success: false, error: 'Session not initialized (call initSession first)' };
        }

        // If a previous task branch is still active, end it first
        if (this._workBranch) {
            this.log(`[Git] ⚠ 이전 작업 브랜치(${this._workBranch})가 아직 활성 — 자동 정리합니다.`);
            this.endTaskBranch(true);
        }

        try {
            // Ensure we're on the base branch (session branch) before creating a new task branch
            const currentBranch = this.getCurrentBranch();
            if (currentBranch !== baseBranch) {
                this._execGit(['checkout', baseBranch]);
            }

            // Stash any uncommitted changes on the base branch
            if (this.hasUncommittedChanges()) {
                this.log('[Git] 📦 세션 브랜치의 미커밋 변경사항을 스태시합니다...');
                this._execGit(['stash', 'push', '-m', `ralph-auto-stash-${Date.now()}`]);
                this.log('[Git] ✅ 스태시 완료');
            }

            // Create branch name: ralph/{sessionName}/task-{iteration}-{sanitized_name}
            const sanitized = this._sanitizeBranchName(taskText);
            const prefix = this._sessionName ? `ralph/${this._sessionName}` : 'ralph';
            const branchName = sanitized
                ? `${prefix}/task-${iteration}-${sanitized}`
                : `${prefix}/task-${iteration}`;
            this._workBranch = branchName;

            this._execGit(['checkout', '-b', this._workBranch]);
            this.log(`[Git] 🌿 작업 브랜치 생성: ${this._workBranch} (from ${baseBranch})`);

            return { success: true, workBranch: this._workBranch };

        } catch (e) {
            this.log(`[Git] ❌ 작업 브랜치 생성 실패: ${e.message}`);
            this._workBranch = null;
            return { success: false, error: e.message };
        }
    }

    /**
     * End the current task branch: commit remaining changes, merge back to session branch.
     * Task branches are merged into the session branch (not directly into original/main).
     *
     * @param {boolean} [autoDeleteBranch=true] - Whether to delete the branch after merge
     * @returns {{ success: boolean, merged: boolean, error?: string }}
     */
    endTaskBranch(autoDeleteBranch = true) {
        // Use session branch as merge target; fall back to original branch
        const mergeTo = this._sessionBranch || this._originalBranch;
        if (!mergeTo || !this._workBranch) {
            return { success: true, merged: false };
        }

        const workBranch = this._workBranch;

        try {
            // Commit any remaining uncommitted changes on the work branch
            if (this.hasUncommittedChanges()) {
                this.commitAll(`final`);
            }

            // Check if there are any commits on the work branch vs merge target
            let hasWorkCommits = false;
            try {
                const log = this._execGit([
                    'log', `${mergeTo}..${workBranch}`, '--oneline'
                ]);
                hasWorkCommits = log.length > 0;
            } catch {
                hasWorkCommits = false;
            }

            if (!hasWorkCommits) {
                // No commits on work branch → just switch back
                this.log('[Git] ℹ 작업 브랜치에 커밋이 없습니다.');
                this._execGit(['checkout', mergeTo]);
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

            // Merge work branch into session branch
            this.log(`[Git] 🔀 ${workBranch} → ${mergeTo} 머지 중...`);
            this._execGit(['checkout', mergeTo]);

            try {
                this._execGit(['merge', workBranch, '--no-ff', '-m',
                    `merge ${workBranch}`]);
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
        const message = `#${iteration} ${shortTask}`;
        return this.commitAll(message);
    }

    /**
     * End the entire session:
     * 1. End active task branch (merge into session branch)
     * 2. Merge session branch into original branch (main)
     * Called on stop/all-tasks-completed.
     *
     * @param {{ autoDeleteBranch: boolean }} [options]
     * @returns {{ success: boolean, merged: boolean, sessionMerged: boolean, error?: string }}
     */
    endSession(options = {}) {
        const { autoDeleteBranch = true } = options;

        // 1. If there's an active task branch, end it (merge into session branch)
        if (this._workBranch) {
            this.endTaskBranch(autoDeleteBranch);
        }

        // 2. Merge session branch into original branch (main)
        if (this._sessionBranch && this._originalBranch) {
            const sessionBranch = this._sessionBranch;

            try {
                // Commit any remaining changes on session branch
                const currentBranch = this.getCurrentBranch();
                if (currentBranch !== sessionBranch) {
                    this._execGit(['checkout', sessionBranch]);
                }
                if (this.hasUncommittedChanges()) {
                    this.commitAll('session final');
                }

                // Check if session branch has commits ahead of original
                let hasSessionCommits = false;
                try {
                    const log = this._execGit([
                        'log', `${this._originalBranch}..${sessionBranch}`, '--oneline'
                    ]);
                    hasSessionCommits = log.length > 0;
                } catch {
                    hasSessionCommits = false;
                }

                if (!hasSessionCommits) {
                    this.log('[Git] ℹ 세션 브랜치에 머지할 커밋이 없습니다.');
                    this._execGit(['checkout', this._originalBranch]);
                    this.log(`[Git] 📌 세션 브랜치 유지: ${sessionBranch}`);
                    this._restoreStash();
                    this._originalBranch = null;
                    this._sessionName = null;
                    this._sessionBranch = null;
                    this._workBranch = null;
                    return { success: true, merged: false, sessionMerged: false };
                }

                // Merge session branch → original branch
                this.log(`[Git] 🔀 ${sessionBranch} → ${this._originalBranch} 머지 중...`);
                this._execGit(['checkout', this._originalBranch]);

                try {
                    this._execGit(['merge', sessionBranch, '--no-ff', '-m',
                        `merge ${sessionBranch}`]);
                    this.log(`[Git] ✅ 세션 브랜치 → 원본 브랜치 머지 완료`);

                    this.log(`[Git] 📌 세션 브랜치 유지: ${sessionBranch}`);

                    this._restoreStash();
                    this._originalBranch = null;
                    this._sessionName = null;
                    this._sessionBranch = null;
                    this._workBranch = null;
                    return { success: true, merged: true, sessionMerged: true };

                } catch (mergeErr) {
                    this.log(`[Git] ⚠ 세션 머지 충돌 발생: ${mergeErr.message}`);
                    this.log(`[Git] ℹ 세션 브랜치 '${sessionBranch}'를 유지합니다. 수동으로 해결해주세요.`);
                    try {
                        this._execGit(['merge', '--abort']);
                    } catch { /* ignore */ }

                    this._restoreStash();
                    this._originalBranch = null;
                    this._sessionName = null;
                    this._sessionBranch = null;
                    this._workBranch = null;
                    return { success: false, merged: false, sessionMerged: false, error: `Session merge conflict: ${mergeErr.message}` };
                }

            } catch (e) {
                this.log(`[Git] ❌ 세션 종료 중 에러: ${e.message}`);
                this._originalBranch = null;
                this._sessionName = null;
                this._sessionBranch = null;
                this._workBranch = null;
                return { success: false, merged: false, sessionMerged: false, error: e.message };
            }
        }

        // No session branch — just clean up
        this._originalBranch = null;
        this._sessionName = null;
        this._sessionBranch = null;
        this._workBranch = null;
        return { success: true, merged: false, sessionMerged: false };
    }

    // ─── Worktree 기반 병렬 작업 지원 ──────────────────────────────

    /**
     * Create a git worktree for parallel task execution.
     * Creates a new branch and checks it out in a separate directory.
     *
     * @param {string} taskText - Task description (used for branch name)
     * @param {number} taskIndex - Task index within the parallel group
     * @param {number} iteration - Current iteration number
     * @returns {{ success: boolean, worktreePath?: string, branchName?: string, error?: string }}
     */
    createWorktree(taskText, taskIndex, iteration) {
        if (!this._workspaceRoot) {
            return { success: false, error: 'Workspace root not set' };
        }

        // Use session branch as base; fall back to original branch
        const baseBranch = this._sessionBranch || this._originalBranch;

        const sanitized = this._sanitizeBranchName(taskText);
        const prefix = this._sessionName ? `ralph/${this._sessionName}` : 'ralph';
        const branchName = sanitized
            ? `${prefix}/parallel-${iteration}-${taskIndex}-${sanitized}`
            : `${prefix}/parallel-${iteration}-${taskIndex}`;

        // Worktree directory: .ralph-worktrees/<branchName> (folder structure preserved)
        const worktreeDir = path.join(this._workspaceRoot, '.ralph-worktrees', ...branchName.split('/'));

        try {
            // Ensure the parent directory exists
            const fs = require('fs');
            const parentDir = path.dirname(worktreeDir);
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }

            // Create worktree with a new branch based on session branch
            this._execGit(['worktree', 'add', '-b', branchName, worktreeDir, baseBranch]);
            this.log(`[Git] 🌿 워크트리 생성: ${branchName} → ${worktreeDir} (from ${baseBranch})`);

            return { success: true, worktreePath: worktreeDir, branchName };
        } catch (e) {
            this.log(`[Git] ❌ 워크트리 생성 실패: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    /**
     * Remove a git worktree and optionally delete the branch.
     *
     * @param {string} worktreePath - Path to the worktree directory
     * @param {string} [branchName] - Branch name to delete after removal
     * @param {boolean} [deleteBranch=true] - Whether to delete the branch
     */
    removeWorktree(worktreePath, branchName, deleteBranch = true) {
        try {
            this._execGit(['worktree', 'remove', worktreePath, '--force']);
            this.log(`[Git] 🗑 워크트리 제거: ${worktreePath}`);
        } catch (e) {
            this.log(`[Git] ⚠ 워크트리 제거 실패: ${e.message}`);
            // Try cleaning up the directory manually
            const fs = require('fs');
            try {
                if (fs.existsSync(worktreePath)) {
                    fs.rmSync(worktreePath, { recursive: true, force: true });
                }
                this._execGit(['worktree', 'prune']);
            } catch { /* ignore */ }
        }

        if (deleteBranch && branchName) {
            try {
                this._execGit(['branch', '-D', branchName]);
                this.log(`[Git] 🗑 브랜치 삭제: ${branchName}`);
            } catch { /* non-critical */ }
        }
    }

    /**
     * Commit all changes in a specific worktree directory.
     *
     * @param {string} worktreePath - Path to the worktree
     * @param {string} message - Commit message
     * @returns {boolean} true if committed
     */
    commitWorktree(worktreePath, message) {
        try {
            const result = cp.spawnSync('git', ['add', '-A'], {
                cwd: worktreePath, encoding: 'utf8', timeout: 30000, windowsHide: true
            });
            if (result.status !== 0) return false;

            const status = cp.spawnSync('git', ['status', '--porcelain'], {
                cwd: worktreePath, encoding: 'utf8', timeout: 30000, windowsHide: true
            });
            if (!status.stdout || !status.stdout.trim()) {
                this.log('[Git] 워크트리에 커밋할 변경사항이 없습니다.');
                return false;
            }

            const commit = cp.spawnSync('git', ['commit', '-m', message], {
                cwd: worktreePath, encoding: 'utf8', timeout: 30000, windowsHide: true
            });
            if (commit.status !== 0) {
                this.log(`[Git] ⚠ 워크트리 커밋 실패: ${(commit.stderr || '').trim()}`);
                return false;
            }

            this.log(`[Git] ✅ 워크트리 커밋 완료: ${message}`);
            return true;
        } catch (e) {
            this.log(`[Git] ⚠ 워크트리 커밋 에러: ${e.message}`);
            return false;
        }
    }

    /**
     * Merge a worktree branch into the session branch (or original branch as fallback).
     * Attempts automatic conflict resolution if conflicts occur.
     *
     * Strategy: For conflicting files, use "theirs" (worktree branch) version,
     * since each parallel task was designed to work in isolation.
     *
     * @param {string} branchName - Branch name to merge
     * @param {boolean} [autoResolve=true] - Attempt automatic conflict resolution
     * @returns {{ success: boolean, merged: boolean, conflictsResolved: number, error?: string }}
     */
    mergeWorktreeBranch(branchName, autoResolve = true) {
        // Use session branch as merge target; fall back to original branch
        const mergeTo = this._sessionBranch || this._originalBranch;
        if (!mergeTo) {
            return { success: false, merged: false, conflictsResolved: 0, error: 'No session/original branch' };
        }

        try {
            // Ensure we're on the merge target branch (session branch)
            const currentBranch = this.getCurrentBranch();
            if (currentBranch !== mergeTo) {
                this._execGit(['checkout', mergeTo]);
            }

            // Check if branch has any commits ahead of merge target
            let hasCommits = false;
            try {
                const log = this._execGit(['log', `${mergeTo}..${branchName}`, '--oneline']);
                hasCommits = log.length > 0;
            } catch {
                hasCommits = false;
            }

            if (!hasCommits) {
                this.log(`[Git] ℹ ${branchName}에 머지할 커밋이 없습니다.`);
                return { success: true, merged: false, conflictsResolved: 0 };
            }

            // Try normal merge first
            try {
                this._execGit(['merge', branchName, '--no-ff', '-m',
                    `merge ${branchName}`]);
                this.log(`[Git] ✅ ${branchName} 머지 완료 (충돌 없음)`);
                return { success: true, merged: true, conflictsResolved: 0 };
            } catch (mergeErr) {
                // Merge conflict detected
                if (!autoResolve) {
                    this.log(`[Git] ⚠ 머지 충돌 — 자동 해결 비활성화됨`);
                    try { this._execGit(['merge', '--abort']); } catch { /* ignore */ }
                    return { success: false, merged: false, conflictsResolved: 0, error: mergeErr.message };
                }

                this.log(`[Git] ⚠ 머지 충돌 감지 — 자동 해결 시도 중...`);
                return this._autoResolveConflicts(branchName);
            }
        } catch (e) {
            this.log(`[Git] ❌ 머지 실패: ${e.message}`);
            return { success: false, merged: false, conflictsResolved: 0, error: e.message };
        }
    }

    /**
     * Attempt to automatically resolve merge conflicts.
     * Strategy: Accept "theirs" (the branch being merged) for conflicting files,
     * since parallel tasks were designed to touch independent files.
     * If both sides modified the same file, prefer "theirs".
     *
     * @param {string} branchName - Branch being merged
     * @returns {{ success: boolean, merged: boolean, conflictsResolved: number, error?: string }}
     * @private
     */
    _autoResolveConflicts(branchName) {
        const fs = require('fs');
        let conflictsResolved = 0;

        try {
            // Get list of conflicted files
            const statusOutput = this._execGit(['status', '--porcelain']);
            const conflictedFiles = statusOutput
                .split('\n')
                .filter(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DU') || line.startsWith('UD'))
                .map(line => line.substring(3).trim());

            if (conflictedFiles.length === 0) {
                this.log('[Git] ℹ 충돌 파일이 없습니다 — 머지 계속');
                this._execGit(['commit', '--no-edit']);
                return { success: true, merged: true, conflictsResolved: 0 };
            }

            this.log(`[Git] 🔧 충돌 파일 ${conflictedFiles.length}개 자동 해결 시도...`);

            for (const file of conflictedFiles) {
                try {
                    const filePath = path.join(this._workspaceRoot, file);

                    // Check if deleted on one side
                    if (!fs.existsSync(filePath)) {
                        // File was deleted — accept theirs (merge branch version)
                        try {
                            this._execGit(['checkout', '--theirs', '--', file]);
                            this._execGit(['add', file]);
                        } catch {
                            // If theirs also doesn't exist, remove it
                            this._execGit(['rm', '--force', file]);
                        }
                        conflictsResolved++;
                        this.log(`[Git]   ✅ ${file} — 삭제 충돌 해결`);
                        continue;
                    }

                    // For content conflicts: use "theirs" version (parallel branch)
                    this._execGit(['checkout', '--theirs', '--', file]);
                    this._execGit(['add', file]);
                    conflictsResolved++;
                    this.log(`[Git]   ✅ ${file} — theirs 전략으로 해결`);

                } catch (fileErr) {
                    this.log(`[Git]   ❌ ${file} 해결 실패: ${fileErr.message}`);
                    // Abort the entire merge if any file can't be resolved
                    try { this._execGit(['merge', '--abort']); } catch { /* ignore */ }
                    return {
                        success: false,
                        merged: false,
                        conflictsResolved,
                        error: `파일 '${file}' 충돌 해결 실패: ${fileErr.message}`
                    };
                }
            }

            // All conflicts resolved — commit the merge
            this._execGit(['commit', '--no-edit']);
            this.log(`[Git] ✅ 머지 완료 — ${conflictsResolved}개 충돌 자동 해결`);
            return { success: true, merged: true, conflictsResolved };

        } catch (e) {
            this.log(`[Git] ❌ 자동 충돌 해결 실패: ${e.message}`);
            try { this._execGit(['merge', '--abort']); } catch { /* ignore */ }
            return { success: false, merged: false, conflictsResolved, error: e.message };
        }
    }

    /**
     * Clean up all ralph worktree directories.
     * Called during session cleanup.
     */
    cleanupWorktrees() {
        if (!this._workspaceRoot) return;

        const fs = require('fs');
        const worktreeDir = path.join(this._workspaceRoot, '.ralph-worktrees');

        try {
            // Prune any stale worktrees first
            this._execGit(['worktree', 'prune']);

            if (fs.existsSync(worktreeDir)) {
                fs.rmSync(worktreeDir, { recursive: true, force: true });
                this.log('[Git] 🗑 워크트리 디렉토리 정리 완료');
            }
        } catch (e) {
            this.log(`[Git] ⚠ 워크트리 정리 실패: ${e.message}`);
        }
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
            sessionBranch: this._sessionBranch || null,
            workBranch: this._workBranch || null,
        };
    }
}

module.exports = { GitManager };
