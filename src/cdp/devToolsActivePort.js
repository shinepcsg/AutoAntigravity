'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Parses the content of a Chromium/Electron DevToolsActivePort file.
 * The file format has 2 lines:
 *   Line 1: Port number (e.g. "9558")
 *   Line 2: WebSocket browser endpoint path (e.g. "/devtools/browser/uuid")
 *
 * @param {string} content - Raw content of the DevToolsActivePort file
 * @returns {{ port: number, wsPath: string|null }|null}
 */
function parseDevToolsActivePort(content) {
    if (typeof content !== 'string') return null;
    const lines = content.split(/\r?\n/).map(l => l.trim());
    if (lines.length === 0) return null;

    const port = parsePort(lines[0]);
    if (port === null) {
        return null;
    }

    const wsPath = isBrowserPath(lines[1]) ? lines[1] : null;
    return { port, wsPath };
}

function parsePort(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (!/^\d+$/.test(String(value))) return null;
    const port = Number(value);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function isBrowserPath(value) {
    return typeof value === 'string' && /^\/devtools\/browser\/[A-Za-z0-9_-]+$/.test(value);
}

function validateBrowserWsUrl(value, port) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'ws:' || url.username || url.password || url.search || url.hash) return null;
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return null;
        if (Number(url.port || 80) !== port || !isBrowserPath(url.pathname)) return null;
        return url.href;
    } catch (_) { return null; }
}

/**
 * Returns the default Antigravity user data directory for this platform
 * (fallback when the running IDE's own userData dir is unknown).
 *
 * @param {string|null} customDir - Optional user-specified directory
 * @returns {string[]}
 */
function getCandidateDirectories(customDir = null) {
    const candidates = [];
    if (customDir && typeof customDir === 'string') {
        candidates.push(customDir);
    }

    const home = os.homedir();
    const platform = process.platform;
    // Antigravity only: reading another IDE's file could attach AutoAccept to that IDE.
    const appNames = ['Antigravity'];

    if (platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        for (const name of appNames) {
            candidates.push(path.join(appData, name));
        }
    } else if (platform === 'darwin') {
        const appSupport = path.join(home, 'Library', 'Application Support');
        for (const name of appNames) {
            candidates.push(path.join(appSupport, name));
        }
    } else {
        const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
        for (const name of appNames) {
            candidates.push(path.join(configHome, name));
        }
    }

    return candidates;
}

/**
 * Scans candidate directories for an active DevToolsActivePort file and parses it.
 *
 * @param {string[]|string|null} customDirs - Optional directory or directories to search first
 * @returns {{ port: number, wsPath: string|null, filePath: string }|null}
 */
function getDevToolsActivePort(customDirs = null) {
    return getDevToolsActivePorts(customDirs)[0] || null;
}

// Return all explicitly supplied candidates so a stale first file cannot mask a live one.
function getDevToolsActivePorts(customDirs = null) {
    const searchDirs = Array.isArray(customDirs)
        ? customDirs
        : (customDirs ? [customDirs] : getCandidateDirectories());

    const results = [];
    for (const dir of searchDirs) {
        try {
            const portFile = path.join(dir, 'DevToolsActivePort');
            if (fs.existsSync(portFile)) {
                const content = fs.readFileSync(portFile, 'utf8');
                const parsed = parseDevToolsActivePort(content);
                if (parsed) {
                    results.push({
                        port: parsed.port,
                        wsPath: parsed.wsPath,
                        filePath: portFile
                    });
                }
            }
        } catch (e) {
            // Ignore filesystem permission or read errors and continue searching
        }
    }

    return results;
}

module.exports = {
    parseDevToolsActivePort,
    getCandidateDirectories,
    getDevToolsActivePort,
    getDevToolsActivePorts,
    parsePort,
    isBrowserPath,
    validateBrowserWsUrl
};
