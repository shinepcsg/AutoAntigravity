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
        'run all', '모두 실행', '항상 실행', '전부 실행', 'all run', 'run all commands',
        'run', '실행', '実行', '运行', 'ausführen', 'ejecutar', 'exécuter',
        'accept', '수락', '承認', '接受',
        'always allow', '항상 허용', '常に許可', '始终允许',
        'allow this conversation', '이 대화 허용', 'この会話を許可', '允许此对话',
        'allow', '허용', '許可', '允许',
        'retry', '재시도', '再試行', '重试',
        'continue', '계속', '続行', '继续',
        'ok', '확인', 'OK',
        'confirm', '승인', '확인',
        'approve', '승인',
        'yes', '예', 'はい', '是',
        ...customTexts
    ];
    const expandTexts = [
        'expand', '확장', '展開', '展开',
        'requires input', '입력 필요', '入力が必要です', '需要输入'
    ];

    return `
(function() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return 'not-a-browser-window';
    
    // Support hot-reloading for extension debug (F5) sessions!
    if (window.__AA_OBSERVER_ACTIVE && typeof window.__AA_CLEANUP === 'function') {
        try { window.__AA_CLEANUP(); } catch(e) {}
    }
    window.__AA_OBSERVER_ACTIVE = true;

    function isAgentPanel() {
        var urlCheck = !!(location.href.includes('webview') || 
            location.href.includes('agent') || 
            location.href.includes('jetski') || 
            location.href.includes('workbench.html') || 
            location.href.includes('antigravity'));
            
        if (urlCheck) return 'Matched URL: ' + location.href;

        var selectors = ['.react-app-container', '[class*="agent"]', '[class*="webview"]', 
                         '[class*="chat"]', '[class*="composer"]', '[class*="antigravity"]', 
                         '[data-vscode-context]', '.vscode-body', '.monaco-workbench'];
        
        for (var s = 0; s < selectors.length; s++) {
            if (document.querySelector(selectors[s])) return 'Matched selector: ' + selectors[s];
        }

        // Generic VS Code theme markers
        var bodyClass = document.body.className || '';
        if (bodyClass.includes('vscode-') || bodyClass.includes('monaco-')) return 'Matched bodyClass: ' + bodyClass;
        
        // Final fallback for workbench targets: always scan if we attached successfully
        if (location.href.includes('workbench')) return 'Workbench fallback';

        try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                var cDoc = iframes[i].contentDocument;
                if (cDoc && cDoc.body) {
                    for (var s = 0; s < selectors.length; s++) {
                        if (cDoc.querySelector(selectors[s])) return 'Matched iframe selector: ' + selectors[s];
                    }
                    var iBodyClass = cDoc.body.className || '';
                    if (iBodyClass.includes('vscode-') || iBodyClass.includes('monaco-')) return 'Matched iframeBodyClass: ' + iBodyClass;
                }
            }
        } catch(e) {}
        return false;
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
            var nodeTag = (node.tagName || '').toLowerCase();
            
            if (node.shadowRoot) {
                var result = findButton(node.shadowRoot, text);
                if (result) return result;
            }
            if (nodeTag === 'iframe') {
                try {
                    if (node.contentDocument && node.contentDocument.body) {
                        var result = findButton(node.contentDocument.body, text);
                        if (result) return result;
                    }
                } catch(e) {}
            }

            // Check data-testid and data-action first (high confidence)
            var testId = (node.getAttribute('data-testid') || node.getAttribute('data-action') || '').toLowerCase();
            if (testId.includes('alwaysallow') || testId.includes('always-allow') || testId.includes('allow')) {
                var btnTag = (node.tagName || '').toLowerCase();
                if (btnTag === 'button' || btnTag.includes('button') || node.getAttribute('role') === 'button' || btnTag.includes('btn')) {
                    return node;
                }
            }

            // Check visible text, title, and aria-label
            var nodeText = (node.textContent || '').trim().toLowerCase();
            var nodeTitle = (node.getAttribute('title') || '').trim().toLowerCase();
            var nodeAria = (node.getAttribute('aria-label') || '').trim().toLowerCase();

            var tests = [nodeText];
            if (nodeTitle) tests.push(nodeTitle);
            if (nodeAria) tests.push(nodeAria);

            var isMatch = tests.some(function(t) {
                if (!t || t.length > 60) return false;
                if (t === text) return true;
                if (t.startsWith(text)) {
                    // For short keywords (CJK or 'run'), match if next char is non-alphanumeric
                    if (text.length < 5) {
                        var nextChar = t[text.length];
                        return !nextChar || !/[a-zA-Z0-9]/.test(nextChar);
                    }
                    // For longer keywords, allow some suffix (e.g. 'always allow this')
                    return t.length <= text.length * 3;
                }
                return false;
            });

            if (isMatch) {
                var clickable = closestClickable(node);
                var tag2 = (clickable.tagName || '').toLowerCase();
                
                var isValidButton = tag2 === 'button' || tag2.includes('button') || clickable.getAttribute('role') === 'button' ||
                    tag2.includes('btn') || clickable.classList.contains('cursor-pointer') ||
                    clickable.onclick || clickable.getAttribute('tabindex') === '0' ||
                    text === 'expand' || text === 'requires input';
                
                if (isValidButton) {
                    
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
        var isPanelMsg = isAgentPanel();
        if (!isPanelMsg) {
            // Check once if this really is something with buttons
            for (var t = 0; t < BUTTON_TEXTS.length; t++) {
                if (findButton(document.body, BUTTON_TEXTS[t])) {
                    isPanelMsg = 'Force-bypass (found button)';
                    break;
                }
            }
        }

        if (!isPanelMsg) {
            return null;
        }

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

    // Only run initial scan if this is an agent panel
    if (isAgentPanel()) scanAndClick();

    // Use requestAnimationFrame-based debounce to limit scan rate to display
    // refresh rate (~60fps max) and avoid overwhelming CPU during rapid DOM changes.
    // Falls back to microtask if rAF is not available (unlikely in webview).
    var debounceScheduled = false;
    var scheduleScan = typeof requestAnimationFrame === 'function'
        ? function() { requestAnimationFrame(function() { debounceScheduled = false; scanAndClick(); }); }
        : function() { Promise.resolve().then(function() { debounceScheduled = false; scanAndClick(); }); };

    var observer = new MutationObserver(function() {
        if (debounceScheduled) return;
        // Skip scan entirely if this is not an agent panel (e.g. code editor)
        // This prevents expensive DOM traversal on every keystroke in editor tabs.
        if (!isAgentPanel()) return;
        debounceScheduled = true;
        scheduleScan();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Fallback: periodic scan every 4s using setInterval as a safety net.
    // Even if setInterval is throttled in background tabs, it still fires
    // (at reduced rate ~1/sec) unlike setTimeout chains which can stall.
    var fallbackTimer = setInterval(function() {
        scanAndClick();
    }, 4000);

    // Cleanup function — called via CDP when AutoAccept is disabled.
    // Disconnects MutationObserver, clears interval, and resets flags
    // so that the injected script no longer consumes CPU.
    window.__AA_CLEANUP = function() {
        observer.disconnect();
        clearInterval(fallbackTimer);
        window.__AA_OBSERVER_ACTIVE = false;
        window.__AA_FORCE_SCAN = null;
        window.__AA_CLEANUP = null;
        return 'cleaned-up';
    };

    return 'observer-installed';
})()
`;
}

module.exports = { buildDOMObserverScript };
