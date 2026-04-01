// AutoAntigravity — Shared workflow scanner helper
// Scans workspace/global .agent/workflows/ directories and returns command metadata.

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    t
} = require('../i18n');

/**
 * Scan a single directory for workflow .md files, parse YAML frontmatter description.
 * Excludes 'write-prd'. Returns array of { command, description, originalName }.
 * @param {string} dirPath - Directory to scan
 * @returns {{ command: string, description: string, originalName: string }[]}
 */
function _scanDir(dirPath) {
    const commands = [];
    try {
        if (!fs.existsSync(dirPath)) return commands;
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const name = file.replace(/\.md$/, '');
            if (name === 'write-prd') continue;

            // Telegram command format: lowercase, alphanumeric + underscores only, 1-32 chars
            const cmdName = name.replace(/-/g, '_').replace(/[^a-z0-9_]/gi, '').toLowerCase().substring(0, 32);
            if (!cmdName) continue;

            // Read YAML frontmatter description
            let description = t('wf.default_desc', { name });
            try {
                const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
                const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                if (fmMatch) {
                    const descMatch = fmMatch[1].match(/description:\s*(.+)/i);
                    if (descMatch) {
                        description = descMatch[1].trim().substring(0, 256);
                    }
                }
            } catch (_) { /* ignore read errors */ }

            commands.push({ command: cmdName, description, originalName: name });
        }
    } catch (_) { /* ignore scan errors */ }
    return commands;
}

/**
 * Scan both workspace and global workflow directories.
 * Returns deduplicated array of { command, description, originalName }.
 * Workspace workflows take priority over global ones on name collision.
 * @param {string} [workspaceRoot] - Workspace root path
 * @returns {{ command: string, description: string, originalName: string }[]}
 */
function scanWorkflows(workspaceRoot) {
    const workflowMap = new Map(); // command name → { command, description, originalName }

    // 1) 워크스페이스 경로: <workspaceRoot>/.agent/workflows/
    if (workspaceRoot) {
        const wsDir = path.join(workspaceRoot, '.agent', 'workflows');
        for (const cmd of _scanDir(wsDir)) {
            workflowMap.set(cmd.command, cmd);
        }
    }

    // 2) 글로벌 경로: ~/.agent/workflows/
    const globalDir = path.join(os.homedir(), '.agent', 'workflows');
    for (const cmd of _scanDir(globalDir)) {
        if (!workflowMap.has(cmd.command)) {
            workflowMap.set(cmd.command, cmd);
        }
    }

    return Array.from(workflowMap.values());
}

module.exports = { scanWorkflows };
