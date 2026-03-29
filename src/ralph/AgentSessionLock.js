// AgentSessionLock — Agent 실행 상태를 임시 파일로 추적
// 워크스페이스 루트에 .agent-running 숨김 파일을 생성/삭제하여 Agent 실행 여부를 관리
// 크래시 등으로 파일이 잔존할 경우 PID 검증으로 stale 파일을 자동 감지/정리

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vscode = require('vscode');

const LOCK_FILENAME = '.agent-running';

class AgentSessionLock {
    /**
     * @param {Function} log - Logging function
     */
    constructor(log) {
        this.log = log;
        this._sessionId = null;
    }

    /**
     * 워크스페이스 루트 경로 반환
     * @returns {string|null}
     */
    _getWorkspaceRoot() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) return null;
        return folders[0].uri.fsPath;
    }

    /**
     * 락 파일 경로 반환
     * @returns {string|null}
     */
    _getLockPath() {
        const root = this._getWorkspaceRoot();
        if (!root) return null;
        return path.join(root, LOCK_FILENAME);
    }

    /**
     * 락 파일 생성 (Agent 실행 시작 시 호출)
     * @param {number} iteration - 현재 반복 번호
     * @param {string} taskText - 현재 작업 텍스트
     * @returns {{ success: boolean, error?: string }}
     */
    acquire(iteration, taskText) {
        const lockPath = this._getLockPath();
        if (!lockPath) {
            return { success: false, error: '워크스페이스 폴더 없음' };
        }

        try {
            this._sessionId = crypto.randomUUID();
            const lockData = {
                sessionId: this._sessionId,
                pid: process.pid,
                startedAt: new Date().toISOString(),
                iteration: iteration,
                task: taskText
            };

            fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), 'utf-8');
            this.log(`[SessionLock] 🔒 락 파일 생성 — 세션: ${this._sessionId.substring(0, 8)}..., 반복 ${iteration}`);
            return { success: true };
        } catch (e) {
            this.log(`[SessionLock] ⚠ 락 파일 생성 실패: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    /**
     * 락 파일 삭제 (Agent 실행 완료/중단 시 호출)
     * @returns {{ success: boolean, error?: string }}
     */
    release() {
        const lockPath = this._getLockPath();
        if (!lockPath) {
            return { success: false, error: '워크스페이스 폴더 없음' };
        }

        try {
            if (fs.existsSync(lockPath)) {
                fs.unlinkSync(lockPath);
                this.log(`[SessionLock] 🔓 락 파일 삭제 — 세션: ${this._sessionId ? this._sessionId.substring(0, 8) + '...' : 'N/A'}`);
            }
            this._sessionId = null;
            return { success: true };
        } catch (e) {
            this.log(`[SessionLock] ⚠ 락 파일 삭제 실패: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    /**
     * 락 파일 정보 읽기
     * @returns {object|null} 락 파일 데이터 또는 null (파일 없음)
     */
    getInfo() {
        const lockPath = this._getLockPath();
        if (!lockPath) return null;

        try {
            if (!fs.existsSync(lockPath)) return null;
            const raw = fs.readFileSync(lockPath, 'utf-8');
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    /**
     * 락 파일의 유효성 검사 (PID가 살아있는지 확인)
     * @returns {{ exists: boolean, valid: boolean, info?: object }}
     */
    isValid() {
        const info = this.getInfo();
        if (!info) {
            return { exists: false, valid: false };
        }

        // PID 생존 확인
        const pidAlive = this._isPidAlive(info.pid);
        return { exists: true, valid: pidAlive, info };
    }

    /**
     * 유효하지 않은(stale) 락 파일 강제 삭제
     * PID가 죽었거나 세션이 만료된 경우에만 삭제
     * @returns {{ cleaned: boolean, reason?: string }}
     */
    forceClean() {
        const validity = this.isValid();

        if (!validity.exists) {
            return { cleaned: false, reason: '락 파일 없음' };
        }

        if (validity.valid) {
            // PID가 살아있다면 정상 실행 중으로 판단 — 삭제하지 않음
            return { cleaned: false, reason: `PID ${validity.info.pid}가 활성 상태 — 정상 실행 중` };
        }

        // PID가 죽었다면 stale 파일 — 삭제
        const lockPath = this._getLockPath();
        try {
            fs.unlinkSync(lockPath);
            this.log(`[SessionLock] 🧹 stale 락 파일 정리 — 세션: ${validity.info.sessionId.substring(0, 8)}..., PID: ${validity.info.pid} (종료됨), 시작: ${validity.info.startedAt}`);
            return { cleaned: true, reason: `PID ${validity.info.pid} 종료됨 — stale 락 파일 삭제` };
        } catch (e) {
            return { cleaned: false, reason: `삭제 실패: ${e.message}` };
        }
    }

    /**
     * 특정 PID가 살아있는지 확인
     * @param {number} pid
     * @returns {boolean}
     */
    _isPidAlive(pid) {
        try {
            // process.kill(pid, 0)은 실제로 프로세스를 죽이지 않고 존재 여부만 확인
            process.kill(pid, 0);
            return true;
        } catch (e) {
            // ESRCH = 프로세스 없음, EPERM = 권한 없음 (프로세스는 존재)
            return e.code === 'EPERM';
        }
    }
}

module.exports = { AgentSessionLock, LOCK_FILENAME };
