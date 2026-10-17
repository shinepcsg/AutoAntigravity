'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const http = require('http');
const crypto = require('crypto');
let configuredPort = 9559;

// Stub 'vscode' so extension modules load cleanly under node --test
const origLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === 'vscode') {
        return {
            env: { language: 'en' },
            workspace: {
                workspaceFolders: [],
                getConfiguration: () => ({ get: (k, d) => k === 'autoAccept.cdpPort' ? configuredPort : d })
            }
        };
    }
    return origLoad.call(this, request, ...rest);
};

const {
    parseDevToolsActivePort,
    getCandidateDirectories,
    getDevToolsActivePort
} = require('../src/cdp/devToolsActivePort');
const { ConnectionManager } = require('../src/cdp/ConnectionManager');
const { AutoAcceptManager } = require('../src/autoAccept');

// Local HTTP + WebSocket fixture: exercises discovery, upgrade, and real CDP messages.
async function endpoint(t, mode = 'fail') {
    const sockets = new Set();
    const methods = [];
    let requests = 0;
    const server = http.createServer((req, res) => {
        requests++;
        if (mode === 'fail') return req.socket.destroy();
        if (mode === 'hang') return;
        res.statusCode = mode === 'status' ? 503 : 200;
        if (typeof mode === 'object') return res.end(JSON.stringify({ webSocketDebuggerUrl: mode.url(server.address().port) }));
        res.end(mode === 'valid' || mode === 'status'
            ? JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/browser/test` })
            : mode === 'empty' ? '{}' : mode === 'remote'
                ? '{"webSocketDebuggerUrl":"ws://example.com:9558/devtools/browser/test"}' : 'invalid json');
    });
    server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
    server.on('upgrade', (req, socket) => {
        if (req.url !== '/devtools/browser/test') return socket.destroy();
        const accept = mode.badHandshake ? 'invalid' : crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        let buffer = Buffer.alloc(0);
        socket.on('data', chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= 6) {
                const opcode = buffer[0] & 15;
                let len = buffer[1] & 127, off = 2;
                if (len === 126) { if (buffer.length < 8) return; len = buffer.readUInt16BE(2); off = 4; }
                if (buffer.length < off + 4 + len) return;
                const mask = buffer.subarray(off, off + 4);
                const payload = Buffer.from(buffer.subarray(off + 4, off + 4 + len));
                buffer = buffer.subarray(off + 4 + len);
                if (opcode === 8) { socket.end(); return; }
                for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
                const msg = JSON.parse(payload.toString());
                methods.push(msg.method);
                const result = msg.method === 'Target.getTargets' ? { targetInfos: [] } : {};
                const reply = Buffer.from(JSON.stringify({ id: msg.id, result }));
                socket.write(Buffer.concat([Buffer.from([0x81, reply.length]), reply]));
            }
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { for (const s of sockets) s.destroy(); await new Promise(r => server.close(r)); });
    return { port: server.address().port, methods, get requests() { return requests; } };
}

function userData(t, content) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aa-cdp-test-'));
    const file = path.join(dir, 'DevToolsActivePort');
    if (content !== undefined) fs.writeFileSync(file, content);
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return { dir, file };
}

function manager(t, port, dirs) {
    const cm = new ConnectionManager({ log: () => {}, getPort: () => port, getCustomTexts: () => [], getDevToolsDirs: () => dirs });
    t.after(() => cm.stop());
    return cm;
}

async function connected(cm) {
    cm.isRunning = true;
    await cm.connect();
    assert.strictEqual(cm.ws?.readyState, 1);
}

for (const mode of ['valid', 'fail', 'hang', 'empty', 'invalid', 'status', 'remote']) {
    test(`startup and connect recover with real ${mode} HTTP and a healthy file WebSocket`, async t => {
        const ep = await endpoint(t, mode);
        const ud = userData(t, `${ep.port}\n/devtools/browser/test\n`);
        configuredPort = ep.port;
        const aa = new AutoAcceptManager(() => {});
        aa.initialize({ globalStorageUri: { fsPath: path.join(ud.dir, 'User', 'globalStorage', 'extension') }, globalState: { update() {}, get: (_k, d) => d } });
        t.after(() => aa.dispose());
        aa._applyWindowsPatch = () => assert.fail('healthy WebSocket must avoid shortcut patching');
        assert.strictEqual(await aa.checkAndFixCDP(1), true);
        assert.strictEqual(aa.cdpAvailable, true);
        // Exercise the actual enable/start gate, without injecting discovery state.
        aa.enable();
        const deadline = Date.now() + 5000;
        while (!ep.methods.includes('Target.getTargets') && Date.now() < deadline) await new Promise(r => setTimeout(r, 10));
        assert.strictEqual(aa.connectionManager.ws?.readyState, 1);
        assert.ok(ep.methods.includes('Target.getTargets'));
        assert.strictEqual(aa.connectionManager.getActivePort(), ep.port);
    });
}

test('empty configured HTTP does not hide a different working file port', async t => {
    const config = await endpoint(t, 'empty'), ep = await endpoint(t);
    const ud = userData(t, `${ep.port}\n/devtools/browser/test`);
    const cm = manager(t, config.port, [ud.dir]);
    await connected(cm);
    assert.strictEqual(cm.getActivePort(), ep.port);
});

test('working configured endpoint wins over file and cached endpoint, including config changes', async t => {
    const config = await endpoint(t, 'valid'), other = await endpoint(t, 'valid');
    const ud = userData(t, `${other.port}\n/devtools/browser/test`);
    const cm = manager(t, config.port, [ud.dir]);
    cm.activeCdpPort = other.port;
    await connected(cm);
    assert.strictEqual(cm.getActivePort(), config.port);
    assert.strictEqual(other.requests, 0);
    cm.stop();
    cm.getPort = () => other.port;
    await connected(cm);
    assert.strictEqual(cm.getActivePort(), other.port);
});

test('file port/path changes invalidate cached fallback and a deleted file clears it', async t => {
    const config = await endpoint(t, 'empty'), first = await endpoint(t), second = await endpoint(t);
    const ud = userData(t, `${first.port}\n/devtools/browser/test`);
    const cm = manager(t, config.port, [ud.dir]);
    await connected(cm);
    cm.stop();
    fs.writeFileSync(ud.file, `${second.port}\n/devtools/browser/test`);
    await connected(cm);
    assert.strictEqual(cm.getActivePort(), second.port);
    cm.stop();
    fs.unlinkSync(ud.file);
    assert.strictEqual(await cm._findActivePort(), null);
    assert.strictEqual(cm.devToolsInfo, null);
    assert.strictEqual(cm.activeCdpPort, null);
});

test('stale first candidate cannot hide a later healthy candidate', async t => {
    const ep = await endpoint(t);
    const stale = userData(t, `${ep.port}\n/devtools/browser/stale`);
    const good = userData(t, `${ep.port}\n/devtools/browser/test`);
    const cm = manager(t, ep.port, [stale.dir, good.dir]);
    await connected(cm);
    assert.strictEqual(cm.devToolsInfo.filePath, good.file);
});

test('strict file ports reject suffixes, decimals, signs, exponents and blank first lines', () => {
    for (const port of ['9558junk', '9558.5', '+9558', '9e3', '0x2556', '\n9558']) {
        assert.strictEqual(parseDevToolsActivePort(`${port}\n/devtools/browser/test`), null, port);
    }
});

test('invalid paths cannot become fallback URLs and no other directories or nearby ports are guessed', async t => {
    const ep = await endpoint(t, 'empty');
    for (const wsPath of ['//example.com/x', '/other', '/devtools/browser/x?query', '/devtools/browser/x#hash', '/devtools/browser/x/extra']) {
        const ud = userData(t, `${ep.port}\n${wsPath}`);
        const cm = manager(t, ep.port, [ud.dir]);
        assert.strictEqual(await cm._findActivePort(), null, wsPath);
    }
    const cm = manager(t, ep.port, []);
    assert.strictEqual(await cm._findActivePort(), null);
});

test('HTTP debugger URLs must be local browser endpoints on the requested port', async t => {
    const unrelated = await endpoint(t, 'valid');
    const urls = [
        () => `ws://127.0.0.1:${unrelated.port}/devtools/browser/test`,
        p => `ws://example.com:${p}/devtools/browser/test`,
        p => `ws://127.0.0.2:${p}/devtools/browser/test`,
        p => `wss://127.0.0.1:${p}/devtools/browser/test`,
        p => `ws://user:pass@127.0.0.1:${p}/devtools/browser/test`,
        p => `ws://127.0.0.1:${p}/devtools/page/test`,
        p => `ws://127.0.0.1:${p}/devtools/browser/test?x`,
        p => `ws://127.0.0.1:${p}/devtools/browser/test#x`
    ];
    for (const url of urls) {
        const ep = await endpoint(t, { url });
        const cm = manager(t, ep.port, []);
        assert.strictEqual(await cm._findActivePort(), null, url(ep.port));
    }
    assert.strictEqual(unrelated.requests, 0);
});

test('malformed configured ports are rejected before network use but file recovery remains available', async t => {
    const ep = await endpoint(t);
    const ud = userData(t, `${ep.port}\n/devtools/browser/test`);
    for (const port of ['9558junk', '9558.5', 9558.5, -1, 65536, null, {}, Infinity]) {
        const cm = manager(t, port, [ud.dir]);
        assert.strictEqual(await cm._findActivePort(), ep.port);
    }
});

test('stale path on the same port and missing current IDE directory do not reuse old fallback', async t => {
    const ep = await endpoint(t);
    const ud = userData(t, `${ep.port}\n/devtools/browser/test`);
    const cm = manager(t, ep.port, [ud.dir]);
    await connected(cm);
    cm.stop();
    fs.writeFileSync(ud.file, `${ep.port}\n/devtools/browser/stale`);
    assert.strictEqual(await cm._findActivePort(), null);
    assert.strictEqual(cm.devToolsInfo, null);
    cm.getDevToolsDirs = () => null;
    assert.strictEqual(await cm._findActivePort(), null);
});

test('an invalid WebSocket upgrade cannot mark CDP available', async t => {
    const ep = await endpoint(t, { badHandshake: true, url: p => `ws://127.0.0.1:${p}/devtools/browser/test` });
    const ud = userData(t, `${ep.port}\n/devtools/browser/test`);
    const cm = manager(t, ep.port, [ud.dir]);
    assert.strictEqual(await cm._findActivePort(), null);
});

test('a reused stale file port cannot select another browser identity from HTTP', async t => {
    const config = await endpoint(t, 'empty');
    const other = await endpoint(t, 'valid');
    const good = await endpoint(t);
    const stale = userData(t, `${other.port}\n/devtools/browser/old-browser`);
    const current = userData(t, `${good.port}\n/devtools/browser/test`);
    const cm = manager(t, config.port, [stale.dir, current.dir]);
    await connected(cm);
    assert.strictEqual(cm.getActivePort(), good.port);
    assert.deepStrictEqual(other.methods, []);
});

test('parseDevToolsActivePort parses standard 2-line DevToolsActivePort files', () => {
    const raw = '9558\r\n/devtools/browser/ea333616-3e8a-4de7-a951-a4cd87f58795\r\n';
    const res = parseDevToolsActivePort(raw);
    assert.deepStrictEqual(res, {
        port: 9558,
        wsPath: '/devtools/browser/ea333616-3e8a-4de7-a951-a4cd87f58795'
    });
});

test('parseDevToolsActivePort handles port-only files and whitespace', () => {
    const raw = '  9222  \n';
    const res = parseDevToolsActivePort(raw);
    assert.deepStrictEqual(res, {
        port: 9222,
        wsPath: null
    });
});

test('parseDevToolsActivePort rejects invalid ports, negative numbers, or non-numeric strings', () => {
    assert.strictEqual(parseDevToolsActivePort(''), null);
    assert.strictEqual(parseDevToolsActivePort('not_a_number\n/path'), null);
    assert.strictEqual(parseDevToolsActivePort('-10\n/path'), null);
    assert.strictEqual(parseDevToolsActivePort('0\n/path'), null);
    assert.strictEqual(parseDevToolsActivePort('70000\n/path'), null);
    assert.strictEqual(parseDevToolsActivePort(null), null);
});

test('getCandidateDirectories returns non-empty list of paths for current platform', () => {
    const dirs = getCandidateDirectories();
    assert.ok(Array.isArray(dirs));
    assert.ok(dirs.length >= 1);
    // Only Antigravity's own dir: another IDE's DevToolsActivePort would attach AutoAccept to that IDE
    assert.ok(dirs.every(d => path.basename(d) === 'Antigravity'));
});

test('getDevToolsActivePort reads and resolves port from temporary test directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aa-cdp-test-'));
    try {
        const dummyFile = path.join(tempDir, 'DevToolsActivePort');
        fs.writeFileSync(dummyFile, '9558\n/devtools/browser/test-uuid-1234\n', 'utf8');

        const found = getDevToolsActivePort([tempDir]);
        assert.ok(found);
        assert.strictEqual(found.port, 9558);
        assert.strictEqual(found.wsPath, '/devtools/browser/test-uuid-1234');
        assert.strictEqual(found.filePath, dummyFile);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
