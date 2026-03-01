// AutoAntigravity — Self-Updater Module
// Checks Gitea releases for new versions and auto-installs VSIX updates

const vscode = require('vscode');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
     * Check for updates from Gitea releases
     */
    async checkForUpdates() {
        if (this._checking) return;
        this._checking = true;

        try {
            const currentVersion = this.getCurrentVersion();
            this.log(`[Updater] Checking for updates... (current: v${currentVersion})`);

            // 1. Fetch latest release from Gitea API
            const release = await this._fetchLatestRelease();
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
                await this._performUpdate(vsixAsset, latestVersion);
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
    async _performUpdate(vsixAsset, version) {
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
                    const downloadUrl = vsixAsset.browser_download_url;

                    this.log(`[Updater] Downloading: ${downloadUrl}`);
                    await this._downloadFile(downloadUrl, vsixPath);
                    this.log(`[Updater] Downloaded to: ${vsixPath}`);

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
     * @returns {Object|null}
     */
    _fetchLatestRelease() {
        return new Promise((resolve, reject) => {
            const url = `${GITEA_URL}/api/v1/repos/${REPO}/releases/latest`;
            this._httpGet(url, (err, data) => {
                if (err) {
                    // If /latest 404s, try listing releases
                    this._fetchReleasesList().then(resolve).catch(reject);
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
     * @returns {Object|null}
     */
    _fetchReleasesList() {
        return new Promise((resolve, reject) => {
            const url = `${GITEA_URL}/api/v1/repos/${REPO}/releases?limit=5`;
            this._httpGet(url, (err, data) => {
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
     * Simple HTTP GET (follows redirects)
     */
    _httpGet(url, callback, maxRedirects = 5) {
        if (maxRedirects <= 0) {
            callback(new Error('Too many redirects'));
            return;
        }

        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;

        const req = client.get(url, { timeout: 10000 }, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
                }
                res.resume(); // consume response
                this._httpGet(redirectUrl, callback, maxRedirects - 1);
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
     * Download a file (follows redirects)
     * @param {string} url
     * @param {string} destPath
     */
    _downloadFile(url, destPath) {
        return new Promise((resolve, reject) => {
            this._downloadFileInternal(url, destPath, 5, resolve, reject);
        });
    }

    _downloadFileInternal(url, destPath, maxRedirects, resolve, reject) {
        if (maxRedirects <= 0) {
            reject(new Error('Too many redirects'));
            return;
        }

        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;

        const req = client.get(url, { timeout: 30000 }, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
                }
                res.resume();
                this._downloadFileInternal(redirectUrl, destPath, maxRedirects - 1, resolve, reject);
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
