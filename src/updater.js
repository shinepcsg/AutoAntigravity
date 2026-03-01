// AutoAntigravity — Self-Updater Module
// Checks Gitea releases for new versions and auto-installs VSIX updates

const vscode = require('vscode');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

// ─── Configuration ────────────────────────────────────────────────────
const GITEA_URL = 'http://office.trollgames.co.kr:3000';
const REPO = 'trollgames/AutoAntigravity';
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30분마다 체크

class AutoUpdater {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {Function} log - Logging function
     */
    constructor(context, log) {
        this.context = context;
        this.log = log;
        this.checkTimer = null;
        this._checking = false;
        this._authHeader = null; // cached Basic Auth header
    }

    /**
     * Start the auto-updater (called on extension activation)
     * Checks immediately, then periodically
     */
    start() {
        // 첫 체크는 10초 후 (확장 활성화 직후 부하 방지)
        setTimeout(() => this.checkForUpdates(), 10000);

        // 주기적 체크
        this.checkTimer = setInterval(() => this.checkForUpdates(), CHECK_INTERVAL_MS);
        this.log('[Updater] Auto-updater started (check interval: 30min)');
    }

    /**
     * Stop the auto-updater
     */
    stop() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    }

    /**
     * Get current installed version
     * @returns {string}
     */
    getCurrentVersion() {
        return this.context.extension.packageJSON.version;
    }

    /**
     * Get or build the Authorization header from Git credentials
     * Uses `git credential fill` to fetch stored credentials for the Gitea server
     * @returns {string|null} Authorization header value, e.g. "Basic base64..."
     */
    async _getAuthHeader() {
        if (this._authHeader) return this._authHeader;

        try {
            const parsed = new URL(GITEA_URL);
            // Build credential query input
            const input = `protocol=${parsed.protocol.replace(':', '')}\nhost=${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}\n`;

            const result = await new Promise((resolve, reject) => {
                const proc = cp.spawn('git', ['credential', 'fill'], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    windowsHide: true,
                    timeout: 5000
                });

                let stdout = '';
                let stderr = '';
                proc.stdout.on('data', d => stdout += d.toString());
                proc.stderr.on('data', d => stderr += d.toString());
                proc.on('close', (code) => {
                    if (code === 0) resolve(stdout);
                    else reject(new Error(`git credential failed (code ${code}): ${stderr}`));
                });
                proc.on('error', reject);
                proc.stdin.write(input);
                proc.stdin.end();
            });

            // Parse the response
            const lines = result.split('\n');
            let username = '', password = '';
            for (const line of lines) {
                if (line.startsWith('username=')) username = line.substring(9).trim();
                if (line.startsWith('password=')) password = line.substring(9).trim();
            }

            if (username && password) {
                this._authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
                this.log(`[Updater] Git credential loaded for ${parsed.hostname}`);
                return this._authHeader;
            }

            this.log('[Updater] ⚠ No credentials found in git credential store');
            return null;
        } catch (e) {
            this.log(`[Updater] ⚠ Git credential lookup failed: ${e.message}`);
            return null;
        }
    }

    /**
     * Check for updates from Gitea releases
     */
    async checkForUpdates() {
        if (this._checking) return;
        this._checking = true;

        try {
            const currentVersion = this.getCurrentVersion();
            this.log(`[Updater] Checking for updates... (current: v${currentVersion})`);

            // Ensure we have auth
            const authHeader = await this._getAuthHeader();

            // 1. Fetch latest release from Gitea API
            const release = await this._fetchLatestRelease(authHeader);
            if (!release) {
                this.log('[Updater] No releases found');
                return;
            }

            const latestVersion = release.tag_name.replace(/^v/, '');
            this.log(`[Updater] Latest release: v${latestVersion}`);

            // 2. Compare versions
            if (this._semverCompare(latestVersion, currentVersion) <= 0) {
                this.log(`[Updater] Already up to date (v${currentVersion})`);
                return;
            }

            // 3. Find VSIX asset
            const vsixAsset = (release.assets || []).find(a =>
                a.name && a.name.endsWith('.vsix')
            );

            if (!vsixAsset) {
                this.log('[Updater] ⚠ No .vsix asset found in latest release');
                return;
            }

            this.log(`[Updater] 🆕 New version available: v${latestVersion} (asset: ${vsixAsset.name})`);

            // 4. Show notification to user
            const action = await vscode.window.showInformationMessage(
                `🚀 AutoAntigravity v${latestVersion} 업데이트 가능! (현재: v${currentVersion})`,
                '지금 업데이트',
                '나중에'
            );

            if (action === '지금 업데이트') {
                await this._performUpdate(vsixAsset, latestVersion, authHeader);
            } else {
                this.log('[Updater] User postponed update');
            }

        } catch (e) {
            this.log(`[Updater] Check failed: ${e.message}`);
        } finally {
            this._checking = false;
        }
    }

    /**
     * Download and install the VSIX update
     */
    async _performUpdate(vsixAsset, version, authHeader) {
        try {
            // Show progress
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `AutoAntigravity v${version} 업데이트 중...`,
                    cancellable: false
                },
                async (progress) => {
                    // 1. Download VSIX
                    progress.report({ message: 'VSIX 다운로드 중...' });
                    const tmpDir = os.tmpdir();
                    const vsixPath = path.join(tmpDir, vsixAsset.name);

                    // Use the download URL from the asset
                    // Gitea may return browser_download_url with a different hostname
                    // Reconstruct the download URL using our known GITEA_URL
                    const downloadUrl = `${GITEA_URL}/${REPO}/releases/download/${vsixAsset.name.includes(version) ? 'v' + version : vsixAsset.name}/${vsixAsset.name}`;
                    const fallbackUrl = vsixAsset.browser_download_url;

                    this.log(`[Updater] Downloading: ${downloadUrl}`);
                    try {
                        await this._downloadFile(downloadUrl, vsixPath, authHeader);
                    } catch (e) {
                        this.log(`[Updater] Primary download failed, trying fallback URL: ${fallbackUrl}`);
                        await this._downloadFile(fallbackUrl, vsixPath, authHeader);
                    }
                    this.log(`[Updater] Downloaded to: ${vsixPath}`);

                    // Verify file was actually downloaded
                    const stats = fs.statSync(vsixPath);
                    if (stats.size < 1000) {
                        throw new Error(`Downloaded file too small (${stats.size} bytes) — possibly an error page`);
                    }
                    this.log(`[Updater] VSIX size: ${(stats.size / 1024).toFixed(1)} KB`);

                    // 2. Install VSIX
                    progress.report({ message: '확장 설치 중...' });
                    this.log(`[Updater] Installing VSIX...`);

                    await vscode.commands.executeCommand(
                        'workbench.extensions.installExtension',
                        vscode.Uri.file(vsixPath)
                    );

                    this.log(`[Updater] ✅ v${version} 설치 완료!`);

                    // 3. Cleanup temp file
                    try { fs.unlinkSync(vsixPath); } catch (e) { /* ignore */ }

                    // 4. Prompt reload
                    progress.report({ message: '설치 완료!' });
                }
            );

            // Ask to reload
            const reload = await vscode.window.showInformationMessage(
                `✅ AutoAntigravity v${version} 설치 완료! IDE를 다시 로드해야 적용됩니다.`,
                '지금 재시작',
                '나중에'
            );

            if (reload === '지금 재시작') {
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            }

        } catch (e) {
            this.log(`[Updater] ❌ Update failed: ${e.message}`);
            vscode.window.showErrorMessage(`AutoAntigravity 업데이트 실패: ${e.message}`);
        }
    }

    // ─── HTTP Helpers ─────────────────────────────────────────────────

    /**
     * Fetch latest release from Gitea API
     * @param {string|null} authHeader
     * @returns {Object|null}
     */
    _fetchLatestRelease(authHeader) {
        return new Promise((resolve, reject) => {
            const url = `${GITEA_URL}/api/v1/repos/${REPO}/releases/latest`;
            this._httpGet(url, authHeader, (err, data) => {
                if (err) {
                    // If /latest 404s, try listing releases
                    this._fetchReleasesList(authHeader).then(resolve).catch(reject);
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse release data: ${e.message}`));
                }
            });
        });
    }

    /**
     * Fallback: fetch list of releases and return the newest non-draft one
     * @param {string|null} authHeader
     * @returns {Object|null}
     */
    _fetchReleasesList(authHeader) {
        return new Promise((resolve, reject) => {
            const url = `${GITEA_URL}/api/v1/repos/${REPO}/releases?limit=5`;
            this._httpGet(url, authHeader, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                try {
                    const releases = JSON.parse(data);
                    if (!Array.isArray(releases) || releases.length === 0) {
                        resolve(null);
                        return;
                    }
                    // Find the first non-draft, non-prerelease
                    const latest = releases.find(r => !r.draft && !r.prerelease) || releases[0];
                    resolve(latest);
                } catch (e) {
                    reject(new Error(`Failed to parse releases list: ${e.message}`));
                }
            });
        });
    }

    /**
     * HTTP GET with optional auth and redirect following
     * @param {string} url
     * @param {string|null} authHeader - Authorization header value
     * @param {Function} callback - (err, data)
     * @param {number} maxRedirects
     */
    _httpGet(url, authHeader, callback, maxRedirects = 5) {
        if (maxRedirects <= 0) {
            callback(new Error('Too many redirects'));
            return;
        }

        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;

        const options = {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            timeout: 10000,
            headers: {}
        };

        if (authHeader) {
            options.headers['Authorization'] = authHeader;
        }

        const req = client.get(options, (res) => {
            // Handle redirects — carry auth only if same host
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
                }
                res.resume();
                // Carry auth header even to redirected host (same Gitea server, different DNS)
                this._httpGet(redirectUrl, authHeader, callback, maxRedirects - 1);
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                callback(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => callback(null, data));
        });

        req.on('error', (err) => callback(err));
        req.on('timeout', () => {
            req.destroy();
            callback(new Error('Request timeout'));
        });
    }

    /**
     * Download a file with auth (follows redirects)
     * @param {string} url
     * @param {string} destPath
     * @param {string|null} authHeader
     */
    _downloadFile(url, destPath, authHeader) {
        return new Promise((resolve, reject) => {
            this._downloadFileInternal(url, destPath, authHeader, 5, resolve, reject);
        });
    }

    _downloadFileInternal(url, destPath, authHeader, maxRedirects, resolve, reject) {
        if (maxRedirects <= 0) {
            reject(new Error('Too many redirects'));
            return;
        }

        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;

        const options = {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            timeout: 30000,
            headers: {}
        };

        if (authHeader) {
            options.headers['Authorization'] = authHeader;
        }

        const req = client.get(options, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
                }
                res.resume();
                this._downloadFileInternal(redirectUrl, destPath, authHeader, maxRedirects - 1, resolve, reject);
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });

            fileStream.on('error', (err) => {
                fs.unlink(destPath, () => { }); // cleanup on error
                reject(err);
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Download timeout'));
        });
    }

    // ─── Semver Comparison ────────────────────────────────────────────

    /**
     * Compare two semver strings
     * @returns {number} positive if a > b, negative if a < b, 0 if equal
     */
    _semverCompare(a, b) {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            const na = pa[i] || 0;
            const nb = pb[i] || 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    }

    /**
     * Dispose / cleanup
     */
    dispose() {
        this.stop();
    }
}

module.exports = { AutoUpdater };
