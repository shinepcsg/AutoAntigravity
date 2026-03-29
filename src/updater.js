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
const GITHUB_API_URL = 'https://api.github.com';
const REPO = 'shinepcsg/AutoAntigravity';
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

        // ─── Update state (exposed for sidebar) ──────────────
        this.updateAvailable = false;
        this.latestVersion = null;
        this.latestAssetName = null;
        this.availableVersions = []; // [{ version, assetName, tagName }]
        this.onUpdateStateChange = null; // callback: () => void
        this._ralphLoop = null; // RalphLoopManager 참조 (실행 중 auto-install 방지)
    }

    /**
     * Set Ralph Loop manager reference for blocking auto-install during loop execution.
     * @param {Object} ralphLoop - RalphLoopManager instance
     */
    setRalphLoop(ralphLoop) {
        this._ralphLoop = ralphLoop;
    }

    /**
     * Check if Ralph Loop is currently active (running or quota_paused).
     * @returns {boolean}
     */
    _isRalphLoopBusy() {
        if (!this._ralphLoop) return false;
        const state = this._ralphLoop.getState();
        return state === 'running' || state === 'quota_paused' || state === 'stopping';
    }

    /**
     * Start the auto-updater (called on extension activation)
     */
    async start() {
        // 즉시 체크 (활성화되자마자 업데이트 확인)
        this.checkForUpdates();

        // 주기적 체크
        this.checkTimer = setInterval(() => this.checkForUpdates(), CHECK_INTERVAL_MS);
        this.log('[Updater] Auto-updater started (immediate check + interval: 30min)');
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
     * (Deprecated for public GitHub release, returns null)
     * @returns {string|null}
     */
    async _getAuthHeader() {
        return null;
    }

    /**
     * Check for updates from Gitea releases
     */
    /**
     * Get the current update state for sidebar display
     * @returns {{ available: boolean, version: string|null, asset: string|null, availableVersions: Array<{ version: string, assetName: string, tagName: string }> }}
     */
    getUpdateState() {
        return {
            available: this.updateAvailable,
            version: this.latestVersion,
            asset: this.latestAssetName,
            availableVersions: this.availableVersions
        };
    }

    /**
     * Trigger the update installation (called from sidebar)
     */
    async installUpdate() {
        if (!this.updateAvailable || !this.latestVersion) return;

        const authHeader = await this._getAuthHeader();
        const release = await this._fetchLatestRelease(authHeader);
        if (!release) return;

        const vsixAsset = (release.assets || []).find(a =>
            a.name && a.name.endsWith('.vsix')
        );
        if (!vsixAsset) return;

        await this._performUpdate(vsixAsset, this.latestVersion, authHeader, false);
    }

    /**
     * Install a specific version by fetching its release from Gitea API,
     * downloading the VSIX, installing it, and immediately reloading.
     * Called from sidebar version buttons — no confirmation dialog needed.
     * @param {string} version - Target version string (e.g. "1.2.3")
     */
    async installSpecificVersion(version) {
        try {
            this.log(`[Updater] Installing specific version: v${version}...`);

            const authHeader = await this._getAuthHeader();

            // Fetch releases list and find the matching version
            const release = await new Promise((resolve, reject) => {
                const url = `${GITHUB_API_URL}/repos/${REPO}/releases?per_page=50`;
                this._httpGet(url, authHeader, (err, data) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    try {
                        const releases = JSON.parse(data);
                        if (!Array.isArray(releases)) {
                            resolve(null);
                            return;
                        }
                        const match = releases.find(r => {
                            const v = (r.tag_name || '').replace(/^v/, '');
                            return v === version && !r.draft;
                        });
                        resolve(match || null);
                    } catch (e) {
                        reject(new Error(`Failed to parse releases: ${e.message}`));
                    }
                });
            });

            if (!release) {
                this.log(`[Updater] ⚠ Release v${version} not found`);
                vscode.window.showWarningMessage(`v${version} 릴리즈를 찾을 수 없습니다.`);
                return;
            }

            // Find the .vsix asset
            const vsixAsset = (release.assets || []).find(a =>
                a.name && a.name.endsWith('.vsix')
            );

            if (!vsixAsset) {
                this.log(`[Updater] ⚠ No .vsix asset in v${version} release`);
                vscode.window.showWarningMessage(`v${version} 릴리즈에 VSIX 파일이 없습니다.`);
                return;
            }

            // Install with autoReload = true (button click is intentional, no dialog)
            await this._performUpdate(vsixAsset, version, authHeader, true);

        } catch (e) {
            this.log(`[Updater] ❌ installSpecificVersion failed: ${e.message}`);
            vscode.window.showErrorMessage(`v${version} 설치 실패: ${e.message}`);
        }
    }

    /**
     * Update the exposed state and notify listeners
     */
    _setUpdateState(available, version, assetName) {
        this.updateAvailable = available;
        this.latestVersion = version;
        this.latestAssetName = assetName;
        if (!available) {
            this.availableVersions = [];
        }
        if (this.onUpdateStateChange) {
            try { this.onUpdateStateChange(); } catch (e) { /* ignore */ }
        }
    }

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
                this._setUpdateState(false, null, null);
                return;
            }

            const latestVersion = release.tag_name.replace(/^v/, '');
            this.log(`[Updater] Latest release: v${latestVersion}`);

            // 2. Compare versions
            if (this._semverCompare(latestVersion, currentVersion) <= 0) {
                this.log(`[Updater] Already up to date (v${currentVersion})`);
                this._setUpdateState(false, null, null);
                return;
            }

            // 3. Find VSIX asset
            const vsixAsset = (release.assets || []).find(a =>
                a.name && a.name.endsWith('.vsix')
            );

            if (!vsixAsset) {
                this.log('[Updater] ⚠ No .vsix asset found in latest release');
                this._setUpdateState(false, null, null);
                return;
            }

            this.log(`[Updater] 🆕 New version available: v${latestVersion} (asset: ${vsixAsset.name})`);

            // Update exposed state for sidebar
            this._setUpdateState(true, latestVersion, vsixAsset.name);

            // Fetch all available versions for sidebar version buttons
            try {
                this.availableVersions = await this.fetchAvailableVersions();
                this.log(`[Updater] Found ${this.availableVersions.length} available version(s)`);
            } catch (e) {
                this.log(`[Updater] ⚠ Failed to fetch available versions: ${e.message}`);
                this.availableVersions = [];
            }

            // 4. Check auto-install setting
            const config = vscode.workspace.getConfiguration('autoAntigravity');
            const autoInstall = config.get('updater.autoInstall', false);

            if (autoInstall) {
                // Ralph Loop 실행 중이면 자동 설치 보류 (다음 체크 주기에 재시도)
                if (this._isRalphLoopBusy()) {
                    this.log(`[Updater] ⏸ Ralph Loop 실행 중 — 자동 설치 보류 (v${latestVersion}). 다음 체크 시 재시도.`);
                    return;
                }
                this.log(`[Updater] Auto-install enabled — installing v${latestVersion}...`);
                await this._performUpdate(vsixAsset, latestVersion, authHeader, true);
                return;
            }

            // 5. Show notification to user
            const action = await vscode.window.showInformationMessage(
                `🚀 AutoAntigravity v${latestVersion} 업데이트 가능! (현재: v${currentVersion})`,
                '지금 업데이트',
                '나중에'
            );

            if (action === '지금 업데이트') {
                await this._performUpdate(vsixAsset, latestVersion, authHeader, false);
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
    async _performUpdate(vsixAsset, version, authHeader, autoReload = false) {
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

                    // GitHub Release assets have browser_download_url
                    const downloadUrl = vsixAsset.browser_download_url || `https://github.com/${REPO}/releases/download/${vsixAsset.name.includes(version) ? 'v' + version : vsixAsset.name}/${vsixAsset.name}`;
                    const fallbackUrl = downloadUrl;

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

            // Reload after update
            if (autoReload) {
                // autoInstall 활성화 시: 대화상자 없이 즉시 리로드
                this.log(`[Updater] Auto-reload: reloading window...`);
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            } else {
                // 수동 업데이트: 기존 대화상자 표시
                const reload = await vscode.window.showInformationMessage(
                    `✅ AutoAntigravity v${version} 설치 완료! IDE를 다시 로드해야 적용됩니다.`,
                    '지금 재시작',
                    '나중에'
                );

                if (reload === '지금 재시작') {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
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
            const url = `${GITHUB_API_URL}/repos/${REPO}/releases/latest`;
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
            const url = `${GITHUB_API_URL}/repos/${REPO}/releases?per_page=5`;
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
     * Fetch all available versions newer than the current one.
     * Uses the Gitea releases API with a higher limit to get more releases,
     * then filters to only those with a higher semver and a .vsix asset.
     * @returns {Promise<Array<{ version: string, assetName: string, tagName: string }>>}
     */
    async fetchAvailableVersions() {
        const authHeader = await this._getAuthHeader();
        const currentVersion = this.getCurrentVersion();

        return new Promise((resolve, reject) => {
            const url = `${GITHUB_API_URL}/repos/${REPO}/releases?per_page=50`;
            this._httpGet(url, authHeader, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                try {
                    const releases = JSON.parse(data);
                    if (!Array.isArray(releases) || releases.length === 0) {
                        resolve([]);
                        return;
                    }

                    const result = [];
                    for (const r of releases) {
                        // Skip drafts and prereleases
                        if (r.draft || r.prerelease) continue;

                        const version = (r.tag_name || '').replace(/^v/, '');
                        if (!version) continue;

                        // Only include versions higher than the current one
                        if (this._semverCompare(version, currentVersion) <= 0) continue;

                        // Must have a .vsix asset
                        const vsixAsset = (r.assets || []).find(a => a.name && a.name.endsWith('.vsix'));
                        if (!vsixAsset) continue;

                        result.push({
                            version,
                            assetName: vsixAsset.name,
                            tagName: r.tag_name
                        });
                    }

                    // Sort descending by version (newest first)
                    result.sort((a, b) => this._semverCompare(b.version, a.version));

                    resolve(result);
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
            headers: {
                'User-Agent': 'AutoAntigravity-Updater/1.0'
            }
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
            headers: {
                'User-Agent': 'AutoAntigravity-Updater/1.0'
            }
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
