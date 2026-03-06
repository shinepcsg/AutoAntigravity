// AutoAntigravity — Telegram Bot Service
// Sends progress updates and receives commands via Telegram Bot API.

const https = require('https');

class TelegramService {
    constructor(log) {
        this._log = log || (() => { });
        this._botToken = null;
        this._chatId = null;
        this._polling = false;
        this._pollTimer = null;
        this._offset = 0;

        // External callback properties
        this.onMessageReceived = null;
        this.onStatusRequest = null;
        this.onStopRequest = null;
        this.onEmergencyRequest = null;
    }

    /** @returns {string|null} Current bot token */
    get botToken() { return this._botToken; }

    /** @returns {string|null} Current chat ID */
    get chatId() { return this._chatId; }

    /** @returns {boolean} Whether the service is actively polling */
    isConnected() { return this._polling; }

    /**
     * Start the Telegram bot service with the given token and chat ID.
     * Begins long polling and sends a connection message.
     */
    async start(botToken, chatId) {
        this._botToken = botToken;
        this._chatId = chatId;
        this._polling = true;

        await this.sendMessage('🤖 AutoAntigravity 텔레그램 봇 연결됨');
        this._poll();
        this._log('[Telegram] 봇 서비스 시작됨');
    }

    /** Stop polling and clear timers. */
    stop() {
        this._polling = false;
        if (this._pollTimer) {
            clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
        this._log('[Telegram] 봇 서비스 중지됨');
    }

    /** Dispose — stop and clean up. */
    dispose() {
        this.stop();
    }

    /**
     * Send a text message to the configured chat.
     * Splits into chunks if text exceeds 4096 characters.
     * Never throws — errors are logged silently.
     */
    async sendMessage(text) {
        try {
            if (!this._botToken || !this._chatId) return;

            const maxLen = 4096;
            if (text.length <= maxLen) {
                await this._telegramApiCall('sendMessage', {
                    chat_id: this._chatId,
                    text,
                    parse_mode: 'Markdown'
                });
            } else {
                // Split into chunks
                for (let i = 0; i < text.length; i += maxLen) {
                    const chunk = text.substring(i, i + maxLen);
                    await this._telegramApiCall('sendMessage', {
                        chat_id: this._chatId,
                        text: chunk,
                        parse_mode: 'Markdown'
                    });
                }
            }
        } catch (err) {
            this._log(`[Telegram] sendMessage 오류: ${err.message}`);
        }
    }

    /**
     * 개별 작업 완료 결과를 텔레그램으로 전송.
     * @param {string} taskText - 완료된 작업명
     * @param {number} iteration - 현재 반복 횟수
     * @param {{ completed: number, total: number }} progress - 진행률 (완료/전체)
     */
    async sendTaskResult(taskText, iteration, progress) {
        const { completed, total } = progress;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        const bar = '█'.repeat(Math.round(percent / 10)) + '░'.repeat(10 - Math.round(percent / 10));

        const message = [
            `✅ *작업 완료*`,
            ``,
            `📌 *작업:* ${taskText}`,
            `🔄 *반복:* ${iteration}회차`,
            `📊 *진행률:* ${completed}/${total} (${percent}%)`,
            `[${bar}]`,
        ].join('\n');

        await this.sendMessage(message);
    }

    /**
     * 전체 작업 완료 결과를 텔레그램으로 전송.
     * @param {number} totalTasks - 완료된 총 작업 수
     * @param {number} totalIterations - 총 반복 횟수
     */
    async sendAllTasksCompleted(totalTasks, totalIterations) {
        const message = [
            `🎉 *전체 작업 완료!*`,
            ``,
            `📋 *총 작업 수:* ${totalTasks}개`,
            `🔄 *총 반복 횟수:* ${totalIterations}회`,
            ``,
            `✅ 모든 작업이 성공적으로 완료되었습니다.`,
        ].join('\n');

        await this.sendMessage(message);
    }

    /**
     * Long-poll for incoming updates from Telegram.
     * Recursively calls itself via setTimeout.
     */
    async _poll() {
        if (!this._polling) return;

        try {
            const result = await this._telegramApiCall('getUpdates', {
                offset: this._offset,
                timeout: 30
            });

            if (result && Array.isArray(result)) {
                for (const update of result) {
                    this._offset = update.update_id + 1;
                    if (update.message) {
                        this._handleMessage(update.message);
                    }
                }
            }
        } catch (err) {
            this._log(`[Telegram] polling 오류: ${err.message}`);
        }

        // Schedule next poll
        if (this._polling) {
            this._pollTimer = setTimeout(() => this._poll(), 1000);
        }
    }

    /**
     * Handle an incoming message — dispatch commands or forward text.
     */
    _handleMessage(message) {
        if (!message || !message.text) return;

        const text = message.text.trim();

        if (text === '/status') {
            if (this.onStatusRequest) this.onStatusRequest();
        } else if (text === '/stop') {
            if (this.onStopRequest) this.onStopRequest();
        } else if (text === '/emergency') {
            if (this.onEmergencyRequest) this.onEmergencyRequest();
        } else {
            if (this.onMessageReceived) this.onMessageReceived(text);
        }
    }

    /**
     * Make a POST request to the Telegram Bot API.
     * @param {string} method - API method name (e.g. 'sendMessage', 'getUpdates')
     * @param {object} body - JSON body to send
     * @returns {Promise<any>} Parsed JSON result
     */
    _telegramApiCall(method, body) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify(body);

            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${this._botToken}/${method}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 35000 // 35s timeout for long polling
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.ok) {
                            resolve(parsed.result);
                        } else {
                            reject(new Error(`Telegram API error: ${parsed.description || 'Unknown'}`));
                        }
                    } catch (e) {
                        reject(new Error(`JSON parse error: ${e.message}`));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Ralph Loop log callback — only forwards important events to Telegram.
     * Filters by level ('error') or by presence of key emoji/markers in msg.
     */
    onRalphLog(logEntry) {
        if (!logEntry) return;

        const { msg, level } = logEntry;
        const importantMarkers = ['═══', '✅ 작업 완료', '✅ 모든 작업', '❌', '🚀', '⏹', '🎉'];

        const isImportant = level === 'error' || importantMarkers.some(marker => msg && msg.includes(marker));

        if (isImportant) {
            const prefix = level === 'error' ? '🔴 ' : '';
            this.sendMessage(`${prefix}${msg}`);
        }
    }
}

module.exports = { TelegramService };
