// AutoAntigravity — DOM Observer Payload
// Generates a self-contained script injected ONCE per CDP session.
// Uses MutationObserver for zero-polling, event-driven button clicking.

/**
 * Generates the MutationObserver-based DOM clicker script.
 * @param {string[]} customTexts - Additional button texts from user config
 * @returns {string} JavaScript source to evaluate via CDP Runtime.evaluate
 */
function buildDOMObserverScript(customTexts) {
    const allTexts = [
        'run', '실행', '実行', '运行', 'ausführen', 'ejecutar', 'exécuter',
        'accept', '수락', '承認', '接受',
        'always allow', '항상 허용', '常に許可', '始终允许',
        'allow this conversation', '이 대화 허용', 'この会話を許可', '允许此对话',
        'allow', '허용', '許可', '允许',
        'retry', '재시도', '再試行', '重试',
        'continue', '계속', '続行', '继续',
        ...customTexts
    ];
    const expandTexts = [
        'expand', '확장', '展開', '展开',
        'requires input', '입력 필요', '入力が必要です', '需要输入'
    ];

    return `
(function() {
    if (window.__AA_OBSERVER_ACTIVE) return 'already-active';
    window.__AA_OBSERVER_ACTIVE = true;

    function isAgentPanel() {
        return !!(document.querySelector('.react-app-container') ||
            document.querySelector('[class*="agent"]') ||
            document.querySelector('[data-vscode-context]'));
    }

    var BUTTON_TEXTS = ${JSON.stringify(allTexts)};
    var EXPAND_TEXTS = ${JSON.stringify(expandTexts)};
    var COOLDOWN_MS = 5000;
    var EXPAND_COOLDOWN_MS = 8000;
    var clickCooldowns = {};

    function _domPath(el) {
        var parts = [];
        var curr = el;
        for (var i = 0; i < 4 && curr && curr !== document.body; i++) {
            var idx = 0;
            var child = curr.parentElement ? curr.parentElement.firstElementChild : null;
            while (child) {
                if (child === curr) break;
                idx++;
                child = child.nextElementSibling;
            }
            parts.unshift((curr.tagName || '') + '[' + idx + ']');
            curr = curr.parentElement;
        }
        return parts.join('/');
    }

    function closestClickable(node) {
        var el = node;
        while (el && el !== document.body) {
            var tag = (el.tagName || '').toLowerCase();
            if (tag === 'button' || tag.includes('button') || tag.includes('btn') ||
                el.getAttribute('role') === 'button' || el.classList.contains('cursor-pointer') ||
                el.onclick || el.getAttribute('tabindex') === '0') {
                return el;
            }
            el = el.parentElement;
        }
        return node;
    }

    function findButton(root, text) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        var node;
        while ((node = walker.nextNode())) {
            if (node.shadowRoot) {
                var result = findButton(node.shadowRoot, text);
                if (result) return result;
            }
            var testId = (node.getAttribute('data-testid') || node.getAttribute('data-action') || '').toLowerCase();
            if (testId.includes('alwaysallow') || testId.includes('always-allow') || testId.includes('allow')) {
                var tag1 = (node.tagName || '').toLowerCase();
                if (tag1 === 'button' || tag1.includes('button') || node.getAttribute('role') === 'button' || tag1.includes('btn')) {
                    return node;
                }
            }
            var nodeText = (node.textContent || '').trim().toLowerCase();
            if (nodeText.length > 50) continue;
            var isMatch = nodeText === text ||
                (text.length >= 5 && nodeText.startsWith(text) && nodeText.length <= text.length * 3) ||
                (nodeText.startsWith(text + ' ') && nodeText.length <= text.length * 5);
            if (isMatch) {
                var clickable = closestClickable(node);
                var tag2 = (clickable.tagName || '').toLowerCase();
                if (tag2 === 'button' || tag2.includes('button') || clickable.getAttribute('role') === 'button' ||
                    tag2.includes('btn') || clickable.classList.contains('cursor-pointer') ||
                    clickable.onclick || clickable.getAttribute('tabindex') === '0' ||
                    text === 'expand' || text === 'requires input') {
                    if (clickable.disabled || clickable.getAttribute('aria-disabled') === 'true' ||
                        clickable.classList.contains('loading') || clickable.querySelector('.codicon-loading')) {
                        continue;
                    }
                    var btnKey = _domPath(clickable) + ':' + (clickable.textContent || '').trim().toLowerCase().substring(0, 30);
                    var cooldown = (text === 'expand' || text === 'requires input') ? EXPAND_COOLDOWN_MS : COOLDOWN_MS;
                    var lastClick = clickCooldowns[btnKey] || 0;
                    if (lastClick && (Date.now() - lastClick < cooldown)) {
                        continue;
                    }
                    return clickable;
                }
            }
        }
        return null;
    }

    var lastPrune = Date.now();
    var PRUNE_INTERVAL_MS = 30000;

    function pruneCooldowns() {
        var now = Date.now();
        if (now - lastPrune < PRUNE_INTERVAL_MS) return;
        lastPrune = now;
        var maxAge = EXPAND_COOLDOWN_MS * 2;
        var keys = Object.keys(clickCooldowns);
        for (var i = 0; i < keys.length; i++) {
            if (now - clickCooldowns[keys[i]] > maxAge) {
                delete clickCooldowns[keys[i]];
            }
        }
    }

    function scanAndClick() {
        pruneCooldowns();
        if (!isAgentPanel()) return null;

        for (var t = 0; t < BUTTON_TEXTS.length; t++) {
            var btn = findButton(document.body, BUTTON_TEXTS[t]);
            if (btn) {
                var key = _domPath(btn) + ':' + (btn.textContent || '').trim().toLowerCase().substring(0, 30);
                clickCooldowns[key] = Date.now();
                btn.click();
                return 'clicked:' + BUTTON_TEXTS[t];
            }
        }
        for (var e = 0; e < EXPAND_TEXTS.length; e++) {
            var expBtn = findButton(document.body, EXPAND_TEXTS[e]);
            if (expBtn) {
                var key = _domPath(expBtn) + ':' + (expBtn.textContent || '').trim().toLowerCase().substring(0, 30);
                clickCooldowns[key] = Date.now();
                expBtn.click();
                return 'clicked:' + EXPAND_TEXTS[e];
            }
        }
        return null;
    }

    // Expose for CDP-driven active polling (bypass inactive tab throttling)
    window.__AA_FORCE_SCAN = scanAndClick;

    scanAndClick();

    // Use microtask-based debounce instead of setTimeout to avoid
    // inactive tab throttling (setTimeout is clamped to >=1s in background tabs)
    var debounceScheduled = false;
    var observer = new MutationObserver(function() {
        if (debounceScheduled) return;
        debounceScheduled = true;
        Promise.resolve().then(function() {
            debounceScheduled = false;
            scanAndClick();
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Fallback: periodic scan every 2s using setInterval as a safety net.
    // Even if setInterval is throttled in background tabs, it still fires
    // (at reduced rate ~1/sec) unlike setTimeout chains which can stall.
    setInterval(function() {
        scanAndClick();
    }, 2000);

    return 'observer-installed';
})()
`;
}

module.exports = { buildDOMObserverScript };
