// AutoAntigravity — Task File Manager
// Parses PRD.md (or custom task file) with checkbox format

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

class TaskFileManager {
    /**
     * @param {Function} log - Logging function
     */
    constructor(log) {
        this.log = log;
        this.taskFilePath = null;
    }

    /**
     * Set the task file path
     * @param {string} filePath - Absolute path to the task file
     */
    setTaskFile(filePath) {
        this.taskFilePath = filePath;
        this.log(`[Ralph] Task file set: ${filePath}`);
    }

    /**
     * Get the current task file path
     * @returns {string|null}
     */
    getTaskFile() {
        return this.taskFilePath;
    }

    /**
     * Resolve task file path from workspace
     * @returns {string|null}
     */
    resolveFromWorkspace() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const config = vscode.workspace.getConfiguration('autoAntigravity');
        const taskFileName = config.get('ralphLoop.taskFile', 'PRD.md');
        const resolved = path.join(workspaceFolders[0].uri.fsPath, taskFileName);

        if (fs.existsSync(resolved)) {
            this.taskFilePath = resolved;
            return resolved;
        }

        return null;
    }

    /**
     * Parse task file and return all tasks
     * @returns {Array<{line: number, text: string, completed: boolean}>}
     */
    parseTasks() {
        if (!this.taskFilePath || !fs.existsSync(this.taskFilePath)) {
            this.log('[Ralph] Task file not found');
            return [];
        }

        const content = fs.readFileSync(this.taskFilePath, 'utf-8');
        const lines = content.split('\n');
        const tasks = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Match checkbox patterns: - [ ] task or - [x] task or - [X] task
            const uncheckedMatch = line.match(/^[-*]\s*\[\s*\]\s+(.+)$/);
            const checkedMatch = line.match(/^[-*]\s*\[[xX]\]\s+(.+)$/);

            if (uncheckedMatch) {
                tasks.push({
                    line: i,
                    text: uncheckedMatch[1].trim(),
                    completed: false
                });
            } else if (checkedMatch) {
                tasks.push({
                    line: i,
                    text: checkedMatch[1].trim(),
                    completed: true
                });
            }
        }

        return tasks;
    }

    /**
     * Get the next incomplete task
     * @returns {{line: number, text: string, completed: boolean}|null}
     */
    getNextTask() {
        const tasks = this.parseTasks();
        return tasks.find(t => !t.completed) || null;
    }

    /**
     * Mark a task as completed in the file
     * @param {number} lineNumber - Line number to mark as done
     */
    markTaskComplete(lineNumber) {
        if (!this.taskFilePath || !fs.existsSync(this.taskFilePath)) return;

        const content = fs.readFileSync(this.taskFilePath, 'utf-8');
        const lines = content.split('\n');

        if (lineNumber >= 0 && lineNumber < lines.length) {
            lines[lineNumber] = lines[lineNumber].replace(/\[\s*\]/, '[x]');
            fs.writeFileSync(this.taskFilePath, lines.join('\n'), 'utf-8');
            this.log(`[Ralph] Marked task complete at line ${lineNumber + 1}`);
        }
    }

    /**
     * Check if all tasks are completed
     * @returns {boolean}
     */
    allTasksCompleted() {
        const tasks = this.parseTasks();
        if (tasks.length === 0) return true;
        return tasks.every(t => t.completed);
    }

    /**
     * Get progress summary
     * @returns {{total: number, completed: number, remaining: number}}
     */
    getProgress() {
        const tasks = this.parseTasks();
        const completed = tasks.filter(t => t.completed).length;
        return {
            total: tasks.length,
            completed,
            remaining: tasks.length - completed
        };
    }
}

module.exports = { TaskFileManager };
