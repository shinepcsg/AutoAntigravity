// AutoAntigravity — Ralph Loop Main Logic
// Iterative AI agent execution with persistent memory

const vscode = require('vscode');
const { TaskFileManager } = require('./TaskFileManager');
const { ProgressTracker } = require('./ProgressTracker');

/**
 * Ralph Loop states
 */
const LoopState = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    STOPPING: 'stopping'
};

class RalphLoopManager {
    /**
     * @param {Function} log - Logging function
     */
    constructor(log) {
        this.log = log;
        this.taskManager = new TaskFileManager(log);
        this.progressTracker = new ProgressTracker(log);

        this.state = LoopState.IDLE;
        this.currentIteration = 0;
        this.loopTimer = null;
        this.onStateChange = null; // callback for UI updates
    }

    /**
     * Get current loop state
     * @returns {string}
     */
    getState() {
        return this.state;
    }

    /**
     * Select task file via file picker
     */
    async selectTaskFile() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open. Open a folder first.');
            return;
        }

        const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFiles: true,
            canSelectFolders: false,
            defaultUri: workspaceFolders[0].uri,
            filters: {
                'Task Files': ['md', 'txt'],
                'All Files': ['*']
            },
            title: 'Select Ralph Loop Task File'
        });

        if (files && files.length > 0) {
            this.taskManager.setTaskFile(files[0].fsPath);
            const progress = this.taskManager.getProgress();
            vscode.window.showInformationMessage(
                `📋 Task file loaded: ${progress.total} tasks (${progress.completed} done, ${progress.remaining} remaining)`
            );
        }
    }

    /**
     * Start the Ralph Loop
     */
    async start() {
        if (this.state === LoopState.RUNNING) {
            vscode.window.showWarningMessage('Ralph Loop is already running.');
            return;
        }

        // Ensure workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }

        // Auto-resolve task file if not selected
        if (!this.taskManager.getTaskFile()) {
            const resolved = this.taskManager.resolveFromWorkspace();
            if (!resolved) {
                const action = await vscode.window.showErrorMessage(
                    'No task file selected or found. Please select a task file.',
                    'Select File'
                );
                if (action === 'Select File') {
                    await this.selectTaskFile();
                }
                if (!this.taskManager.getTaskFile()) return;
            }
        }

        // Check if there are tasks to do
        if (this.taskManager.allTasksCompleted()) {
            vscode.window.showInformationMessage('🎉 All tasks are already completed!');
            return;
        }

        this.state = LoopState.RUNNING;
        this.progressTracker.initializeProgressFile();
        this.currentIteration = this.progressTracker.getLastIteration();

        const progress = this.taskManager.getProgress();
        this.log(`[Ralph] Loop started — ${progress.remaining} tasks remaining`);
        vscode.window.showInformationMessage(
            `🔄 Ralph Loop started — ${progress.remaining} tasks remaining`
        );

        this._notifyStateChange();
        this._runNextIteration();
    }

    /**
     * Stop the Ralph Loop gracefully
     */
    stop() {
        if (this.state === LoopState.IDLE) return;

        this.state = LoopState.STOPPING;
        this.log('[Ralph] Loop stop requested — finishing current iteration...');

        if (this.loopTimer) {
            clearTimeout(this.loopTimer);
            this.loopTimer = null;
        }

        this.state = LoopState.IDLE;
        vscode.window.showInformationMessage('⏹ Ralph Loop stopped.');
        this._notifyStateChange();
    }

    /**
     * Emergency stop — immediate halt
     */
    emergencyStop() {
        this.log('[Ralph] ⚠ EMERGENCY STOP');

        if (this.loopTimer) {
            clearTimeout(this.loopTimer);
            this.loopTimer = null;
        }

        this.state = LoopState.IDLE;
        vscode.window.showWarningMessage('🛑 Ralph Loop EMERGENCY STOPPED');
        this._notifyStateChange();
    }

    /**
     * Dispose / cleanup
     */
    dispose() {
        this.emergencyStop();
    }

    // ─── Internal Loop Logic ──────────────────────────────────────────

    async _runNextIteration() {
        if (this.state !== LoopState.RUNNING) return;

        // Check max iterations
        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const maxIterations = config.get('ralphLoop.maxIterations', 50);

        if (this.currentIteration >= maxIterations) {
            this.log(`[Ralph] Max iterations (${maxIterations}) reached — stopping`);
            vscode.window.showInformationMessage(
                `🏁 Ralph Loop reached max iterations (${maxIterations}). Stopping.`
            );
            this.state = LoopState.IDLE;
            this._notifyStateChange();
            return;
        }

        // Get next task
        const task = this.taskManager.getNextTask();
        if (!task) {
            this.log('[Ralph] All tasks completed!');
            vscode.window.showInformationMessage('🎉 Ralph Loop: All tasks completed!');
            this.state = LoopState.IDLE;
            this._notifyStateChange();
            return;
        }

        this.currentIteration++;
        const progress = this.taskManager.getProgress();
        this.log(`[Ralph] ═══ Iteration ${this.currentIteration} ═══`);
        this.log(`[Ralph] Task: ${task.text}`);
        this.log(`[Ralph] Progress: ${progress.completed}/${progress.total}`);

        try {
            // Build the prompt for the agent
            const prompt = this._buildAgentPrompt(task, this.currentIteration, progress);

            // Send to Antigravity agent via chat
            await this._sendToAgent(prompt);

            // Mark task as complete and record progress
            this.taskManager.markTaskComplete(task.line);
            this.progressTracker.appendProgress(
                this.currentIteration,
                task.text,
                'completed'
            );

            // Auto-commit
            await this.progressTracker.autoCommit(this.currentIteration, task.text);

        } catch (e) {
            this.log(`[Ralph] Iteration ${this.currentIteration} error: ${e.message}`);
            this.progressTracker.appendProgress(
                this.currentIteration,
                task.text,
                'failed',
                e.message
            );
        }

        // Schedule next iteration
        if (this.state === LoopState.RUNNING) {
            const delay = config.get('ralphLoop.iterationDelayMs', 3000);
            this.log(`[Ralph] Next iteration in ${delay}ms...`);
            this.loopTimer = setTimeout(() => this._runNextIteration(), delay);
        }
    }

    /**
     * Build the prompt to send to the agent
     */
    _buildAgentPrompt(task, iteration, progress) {
        const progressFilePath = this.progressTracker.getProgressFilePath();
        const taskFilePath = this.taskManager.getTaskFile();

        let prompt = `# Ralph Loop — Iteration ${iteration}\n\n`;
        prompt += `## Current Task\n${task.text}\n\n`;
        prompt += `## Progress\n- Completed: ${progress.completed}/${progress.total}\n- Remaining: ${progress.remaining}\n\n`;
        prompt += `## Instructions\n`;
        prompt += `1. Read the task file at \`${taskFilePath}\` for full context\n`;
        prompt += `2. Check progress at \`${progressFilePath}\` for what's been done\n`;
        prompt += `3. Complete EXACTLY ONE task: "${task.text}"\n`;
        prompt += `4. Do NOT modify the progress file — it is managed automatically\n`;
        prompt += `5. When done, verify your changes work correctly\n`;

        return prompt;
    }

    /**
     * Send prompt to Antigravity agent
     * Uses VS Code chat API to spawn a new session
     */
    async _sendToAgent(prompt) {
        try {
            // Try using the Antigravity chat participant API
            // This creates a new chat session with fresh context
            await vscode.commands.executeCommand(
                'workbench.action.chat.open',
                { query: prompt }
            );

            this.log('[Ralph] Prompt sent to agent');

            // Wait for the agent to complete (monitor via heuristic)
            await this._waitForAgentCompletion();

        } catch (e) {
            this.log(`[Ralph] Failed to send to agent: ${e.message}`);
            // Fallback: try alternative command
            try {
                await vscode.commands.executeCommand('workbench.action.chat.newChat');
                await new Promise(r => setTimeout(r, 1000));
                await vscode.commands.executeCommand(
                    'workbench.action.chat.open',
                    { query: prompt }
                );
                await this._waitForAgentCompletion();
            } catch (e2) {
                this.log(`[Ralph] Fallback also failed: ${e2.message}`);
                throw e2;
            }
        }
    }

    /**
     * Wait for the agent to finish working
     * Uses a heuristic: monitor file system activity to detect completion
     */
    async _waitForAgentCompletion() {
        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const iterationDelay = config.get('ralphLoop.iterationDelayMs', 3000);

        // Simple heuristic: wait for a minimum period, then check for inactivity
        // The agent's Auto Accept feature will handle the step-by-step acceptance
        const MIN_WAIT_MS = 30000; // 30s minimum per task
        const MAX_WAIT_MS = 300000; // 5 min maximum per task
        const CHECK_INTERVAL_MS = 5000;
        const INACTIVITY_THRESHOLD_MS = 15000;

        let lastActivityTime = Date.now();
        let elapsed = 0;

        // Set up a file system watcher for activity detection
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolders[0], '**/*')
        );

        const updateActivity = () => { lastActivityTime = Date.now(); };
        watcher.onDidChange(updateActivity);
        watcher.onDidCreate(updateActivity);
        watcher.onDidDelete(updateActivity);

        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                elapsed += CHECK_INTERVAL_MS;
                const timeSinceActivity = Date.now() - lastActivityTime;

                // Stop conditions
                if (this.state !== LoopState.RUNNING) {
                    clearInterval(checkInterval);
                    watcher.dispose();
                    resolve();
                    return;
                }

                // Past minimum wait and agent seems idle
                if (elapsed >= MIN_WAIT_MS && timeSinceActivity >= INACTIVITY_THRESHOLD_MS) {
                    this.log(`[Ralph] Agent appears idle (${Math.round(timeSinceActivity / 1000)}s inactive)`);
                    clearInterval(checkInterval);
                    watcher.dispose();
                    resolve();
                    return;
                }

                // Maximum wait exceeded
                if (elapsed >= MAX_WAIT_MS) {
                    this.log('[Ralph] Max wait time exceeded — proceeding to next iteration');
                    clearInterval(checkInterval);
                    watcher.dispose();
                    resolve();
                    return;
                }

                if (elapsed % 30000 === 0) {
                    this.log(`[Ralph] Waiting for agent... (${Math.round(elapsed / 1000)}s elapsed)`);
                }
            }, CHECK_INTERVAL_MS);
        });
    }

    /**
     * Notify state change for UI updates
     */
    _notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange(this.state, this.currentIteration);
        }
    }
}

module.exports = { RalphLoopManager, LoopState };
