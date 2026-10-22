// content.js

// ============================================================================
// 1. 定数・セレクタ定義
// ============================================================================

const TIMING = {
  SETUP_DEBOUNCE_MS: 100,
  METRICS_DEBOUNCE_MS: 150,
  METRICS_RETRY_INTERVAL_MS: 500,
  METRICS_MAX_RETRIES: 15,
};

const SELECTORS = {
  SECONDARY: '#secondary',
  SECONDARY_INNER: '#secondary-inner',
  RELATED: '#related',
  COMMENTS: '#comments',
  TABS_PANEL: '#yt-tabs-panel',
  TAB_RELATED_BTN: '#tab-related',
  TAB_COMMENTS_BTN: '#tab-comments',
  LIVE_CHAT_BLOCK_CLASS: 'yt-live-chat-block',
  PLAYLIST_BLOCK_CLASS: 'yt-playlist-block',
  HAS_LIVE_CHAT_CLASS: 'yt-has-live-chat',
  HAS_PLAYLIST_CLASS: 'yt-has-playlist',
  TABS_ACTIVE_CLASS: 'yt-tabs-active',
  LIVE_CHAT_CANDIDATES: [
    'ytd-live-chat-frame',
    'yt-live-chat-renderer',
    'yt-live-chat-app',
    '#chatframe',
    'iframe#chatframe',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-live-chat"]',
  ].join(','),
  PLAYLIST_CANDIDATES: [
    'ytd-playlist-panel-renderer',
    '#playlist',
  ].join(','),
  WATCH_METADATA: 'ytd-watch-metadata',
  LIKE_BUTTONS: [
    'button[aria-label*="いいね"]',
    'button[aria-label*="高評価"]',
    'button[aria-label*="高く評価"]',
  ].join(', '),
  LIKE_TEXT_CANDIDATES: [
    '.yt-core-attributed-string',
    '.yt-spec-button-shape-next__button-text-content',
    'div:not([class])',
  ].join(', '),
  UPLOAD_DATE_META: 'meta[itemprop="uploadDate"], meta[itemprop="datePublished"]',
  DESCRIPTION_TOOLTIP: 'ytd-watch-metadata #description tp-yt-paper-tooltip',
  DESCRIPTION_SPANS: 'ytd-watch-metadata #description-inner span',
};

const PATTERNS = {
  EXACT_NUMBER: /[\d,]+/,
  ABBREVIATED_UNIT: /[万億]/,
  DATE_ONLY: /^(\d{4})-(\d{2})-(\d{2})$/,
  EXACT_VIEWS: /[\d,]+\s*回視聴/,
  DATE_TEXT: /\d{4}(年|\/)\d{1,2}(月|\/)\d{1,2}/,
};


// ============================================================================
// 2. DOM操作ヘルパー（不要なMutation発火を防ぐべき等更新）
// ============================================================================

function isWatchPage() {
  return window.location.pathname.startsWith('/watch');
}

function setAttributeIfChanged(element, attr, value) {
  if (element.getAttribute(attr) !== value) {
    element.setAttribute(attr, value);
  }
}

function setStyleDisplayIfChanged(element, displayValue) {
  if (element.style.display !== displayValue) {
    element.style.display = displayValue;
  }
}

function setTextContentIfChanged(element, text) {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function toggleClassIfChanged(element, className, shouldHave) {
  if (element.classList.contains(className) !== shouldHave) {
    element.classList.toggle(className, shouldHave);
  }
}


// ============================================================================
// 3. サイドバータブ UI 機能
// ============================================================================

function setupTabsUI() {
  const secondary = document.querySelector(SELECTORS.SECONDARY);
  const secondaryInner = document.querySelector(SELECTORS.SECONDARY_INNER);
  const sidebar = secondary || secondaryInner;
  const comments = document.querySelector(SELECTORS.COMMENTS);
  const related = document.querySelector(SELECTORS.RELATED);
  if (!sidebar || !related || !comments || !related.isConnected || !comments.isConnected) {
    updateTabsObserverTarget(null);
    return;
  }

  const tabsPanel = ensureTabsPanel();

  // Forced Synchronous Layout（強制同期リフロー）を防ぐため、
  // DOMへの書き込み（appendChild等）を行う前にライブチャットやプレイリストの可視判定（DOM読み取り）を実施する
  const liveChat = findVisibleSidebarElement(sidebar, tabsPanel, SELECTORS.LIVE_CHAT_CANDIDATES);
  const hasLiveChat = Boolean(liveChat);
  const chatBlock = hasLiveChat ? resolveSidebarTopBlock(liveChat, sidebar, secondaryInner) : null;

  const playlist = findVisibleSidebarElement(sidebar, tabsPanel, SELECTORS.PLAYLIST_CANDIDATES);
  const hasPlaylist = Boolean(playlist);
  const playlistBlock = hasPlaylist ? resolveSidebarTopBlock(playlist, sidebar, secondaryInner) : null;

  // --- 以下、DOM書き込み処理 ---
  const layoutRoot = secondary || sidebar;
  toggleClassIfChanged(layoutRoot, SELECTORS.TABS_ACTIVE_CLASS, true);

  if (tabsPanel.parentElement !== sidebar) {
    sidebar.appendChild(tabsPanel);
  }
  if (related.parentElement !== tabsPanel) {
    tabsPanel.appendChild(related);
  }
  if (comments.parentElement !== tabsPanel) {
    tabsPanel.appendChild(comments);
  }

  const previouslyHadLiveChat = layoutRoot.dataset.ytHadLiveChat === 'true';
  toggleClassIfChanged(layoutRoot, SELECTORS.HAS_LIVE_CHAT_CLASS, hasLiveChat);
  toggleClassIfChanged(layoutRoot, SELECTORS.HAS_PLAYLIST_CLASS, hasPlaylist);
  syncSidebarBlockClass(sidebar, SELECTORS.LIVE_CHAT_BLOCK_CLASS, chatBlock);
  syncSidebarBlockClass(sidebar, SELECTORS.PLAYLIST_BLOCK_CLASS, playlistBlock);

  const relatedButton = tabsPanel.querySelector(SELECTORS.TAB_RELATED_BTN);
  const commentsButton = tabsPanel.querySelector(SELECTORS.TAB_COMMENTS_BTN);
  bindTabButtons(relatedButton, commentsButton);

  if (previouslyHadLiveChat && !hasLiveChat) {
    setSidebarTabState(relatedButton, commentsButton, related, comments, 'related');
  } else {
    const activeTab = relatedButton.classList.contains('active') ? 'related' : 'comments';
    setSidebarTabState(relatedButton, commentsButton, related, comments, activeTab);
  }

  const nextHadLiveChat = String(hasLiveChat);
  if (layoutRoot.dataset.ytHadLiveChat !== nextHadLiveChat) {
    layoutRoot.dataset.ytHadLiveChat = nextHadLiveChat;
  }

  // タブパネルへの格納が完了したら、MutationObserverの監視対象をサイドバーのみに絞り込む
  updateTabsObserverTarget(sidebar);
}

function ensureTabsPanel() {
  let tabsPanel = document.getElementById('yt-tabs-panel');
  if (!tabsPanel) {
    tabsPanel = document.createElement('section');
    tabsPanel.id = 'yt-tabs-panel';
    tabsPanel.innerHTML = `
      <div id="yt-custom-tabs" role="tablist">
        <button id="tab-related" class="yt-tab-btn active" type="button" role="tab" aria-selected="true">関連動画</button>
        <button id="tab-comments" class="yt-tab-btn" type="button" role="tab" aria-selected="false">コメント</button>
      </div>
    `;
  }
  return tabsPanel;
}

function findVisibleSidebarElement(sidebar, tabsPanel, selector) {
  const candidates = Array.from(sidebar.querySelectorAll(selector))
    .filter(element => !tabsPanel || !tabsPanel.contains(element));

  return candidates.find(element => isElementVisibleInSidebar(element, sidebar)) || null;
}

function isElementVisibleInSidebar(element, sidebar) {
  if (element.hidden || element.hasAttribute('hidden')) {
    return false;
  }

  // Chrome標準のネイティブC++実装 checkVisibility() を優先利用し、
  // JSループによる getComputedStyle の繰り返し呼び出しを回避する
  if (typeof element.checkVisibility === 'function') {
    if (!element.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) {
      return false;
    }
  } else {
    let ancestor = element;
    while (ancestor && ancestor !== sidebar.parentElement) {
      if (ancestor.hidden || ancestor.hasAttribute('hidden')) {
        return false;
      }
      const style = window.getComputedStyle(ancestor);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.contentVisibility === 'hidden'
      ) {
        return false;
      }
      if (ancestor === sidebar) break;
      ancestor = ancestor.parentElement;
    }
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function resolveSidebarTopBlock(element, sidebar, secondaryInner) {
  let block = element;
  while (
    block.parentElement &&
    block.parentElement !== sidebar &&
    block.parentElement !== secondaryInner
  ) {
    block = block.parentElement;
  }
  if (block.parentElement === sidebar || block.parentElement === secondaryInner) {
    return block;
  }
  return null;
}

function syncSidebarBlockClass(sidebar, className, activeBlock) {
  sidebar.querySelectorAll(`.${className}`).forEach(element => {
    if (element !== activeBlock) {
      element.classList.remove(className);
    }
  });
  if (activeBlock && !activeBlock.classList.contains(className)) {
    activeBlock.classList.add(className);
  }
}

function bindTabButtons(relatedButton, commentsButton) {
  if (relatedButton.dataset.ytTabsBound !== 'true') {
    relatedButton.addEventListener('click', () => activateSidebarTab('related'));
    relatedButton.dataset.ytTabsBound = 'true';
  }
  if (commentsButton.dataset.ytTabsBound !== 'true') {
    commentsButton.addEventListener('click', () => activateSidebarTab('comments'));
    commentsButton.dataset.ytTabsBound = 'true';
  }
}

function setSidebarTabState(relatedButton, commentsButton, related, comments, activeTab) {
  const showRelated = activeTab === 'related';
  toggleClassIfChanged(relatedButton, 'active', showRelated);
  toggleClassIfChanged(commentsButton, 'active', !showRelated);
  setAttributeIfChanged(relatedButton, 'aria-selected', String(showRelated));
  setAttributeIfChanged(commentsButton, 'aria-selected', String(!showRelated));
  setStyleDisplayIfChanged(related, showRelated ? 'block' : 'none');
  setStyleDisplayIfChanged(comments, showRelated ? 'none' : 'block');
}

function activateSidebarTab(activeTab) {
  const tabsPanel = document.getElementById('yt-tabs-panel');
  const relatedButton = tabsPanel && tabsPanel.querySelector(SELECTORS.TAB_RELATED_BTN);
  const commentsButton = tabsPanel && tabsPanel.querySelector(SELECTORS.TAB_COMMENTS_BTN);
  const related = document.querySelector(SELECTORS.RELATED);
  const comments = document.querySelector(SELECTORS.COMMENTS);
  if (!relatedButton || !commentsButton || !related || !comments) return;

  setSidebarTabState(relatedButton, commentsButton, related, comments, activeTab);

  // 非表示だったコメント欄を表示した際、YouTube側の遅延読み込み（Intersection/Layout）を促す
  if (activeTab === 'comments') {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    }));
  }
}


// ============================================================================
// 4. メトリクス厳密表示機能（高評価数・投稿日時・再生回数）
// ============================================================================

let cachedRawUploadDate = null;
let cachedFormattedUploadDate = null;

function replaceMetricsToExact() {
  const metadataRoot = document.querySelector(SELECTORS.WATCH_METADATA);
  if (metadataRoot) {
    observeMetadataRoot(metadataRoot);
  }

  const likesResolved = updateExactLikes(metadataRoot || document);
  const exactDateTime = getExactUploadDateTime();
  const exactViews = getExactViewCount();
  if (!exactDateTime && !exactViews) {
    return false;
  }

  const descriptionResolved = updateDescriptionMetrics(exactViews, exactDateTime);
  return likesResolved && descriptionResolved;
}

function updateExactLikes(root) {
  const likeButtons = root.querySelectorAll(SELECTORS.LIKE_BUTTONS);
  if (likeButtons.length === 0) return false;

  let hasValidLikes = false;
  likeButtons.forEach(btn => {
    const label = btn.getAttribute('aria-label') || '';
    const exactMatch = label.match(PATTERNS.EXACT_NUMBER);
    if (!exactMatch) return;

    hasValidLikes = true;
    const exactLikes = exactMatch[0];
    const textElem = btn.querySelector(SELECTORS.LIKE_TEXT_CANDIDATES);
    if (textElem && PATTERNS.ABBREVIATED_UNIT.test(textElem.textContent)) {
      setTextContentIfChanged(textElem, exactLikes);
    }
  });
  return hasValidLikes;
}

function getExactUploadDateTime() {
  const dateMeta = document.querySelector(SELECTORS.UPLOAD_DATE_META);
  if (!dateMeta || !dateMeta.content) return null;

  const rawDate = dateMeta.content.trim();
  if (rawDate === cachedRawUploadDate) {
    return cachedFormattedUploadDate;
  }

  const dateOnlyMatch = rawDate.match(PATTERNS.DATE_ONLY);
  const dateObj = new Date(rawDate);
  if (isNaN(dateObj.getTime())) return null;

  // YYYY-MM-DD のみのメタデータはタイムゾーン変換による日付ずれを防ぐためそのまま保持する
  const y = dateOnlyMatch ? dateOnlyMatch[1] : dateObj.getFullYear();
  const m = dateOnlyMatch ? dateOnlyMatch[2] : String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = dateOnlyMatch ? dateOnlyMatch[3] : String(dateObj.getDate()).padStart(2, '0');
  const h = String(dateObj.getHours()).padStart(2, '0');
  const min = String(dateObj.getMinutes()).padStart(2, '0');

  cachedRawUploadDate = rawDate;
  cachedFormattedUploadDate = `${y}/${m}/${d} ${h}:${min}`;
  return cachedFormattedUploadDate;
}

function getExactViewCount() {
  const tooltipElem = document.querySelector(SELECTORS.DESCRIPTION_TOOLTIP);
  if (!tooltipElem) return null;

  const fullText = tooltipElem.textContent.trim();
  const viewMatch = fullText.match(PATTERNS.EXACT_VIEWS);
  return viewMatch ? viewMatch[0] : null;
}

function updateDescriptionMetrics(exactViews, exactDateTime) {
  const spans = document.querySelectorAll(SELECTORS.DESCRIPTION_SPANS);
  if (spans.length === 0) return false;

  let viewsUpdated = !exactViews;
  let dateUpdated = !exactDateTime;

  spans.forEach(span => {
    const text = span.textContent;
    if (exactViews && text.includes('回視聴')) {
      if (PATTERNS.ABBREVIATED_UNIT.test(text)) {
        setTextContentIfChanged(span, exactViews);
      }
      viewsUpdated = true;
    }
    if (exactDateTime) {
      if (text === exactDateTime) {
        dateUpdated = true;
      } else if (text.includes('前') || text.includes('昨日') || PATTERNS.DATE_TEXT.test(text)) {
        setTextContentIfChanged(span, exactDateTime);
        dateUpdated = true;
      }
    }
  });

  return viewsUpdated && dateUpdated;
}


// ============================================================================
// 5. エントリポイント・イベントおよびDOM監視制御（動的スコープ＆自動停止）
// ============================================================================

let tabsSetupTimer = null;
let currentObservedSidebar = null;

const TABS_OBSERVER_OPTIONS = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['hidden', 'collapsed'],
};

function scheduleTabsSetup() {
  if (tabsSetupTimer !== null) window.clearTimeout(tabsSetupTimer);
  tabsSetupTimer = window.setTimeout(() => {
    tabsSetupTimer = null;
    if (!isWatchPage()) return;
    try {
      setupTabsUI();
    } catch (e) {
      console.error('Tab UI Error:', e);
    }
  }, TIMING.SETUP_DEBOUNCE_MS);
}

function isIgnorableInnerMutation(target, related, comments) {
  if (!(target instanceof Element)) return false;

  // 1. 関連動画・コメント欄内部のスクロール追加等は無視
  if (
    (related && target !== related && related.contains(target)) ||
    (comments && target !== comments && comments.contains(target))
  ) {
    return true;
  }

  // 2. プレイリストのアイテムリスト(#items)内部やライブチャット内部の要素更新は無視
  if (target.closest('#items.playlist-items, ytd-live-chat-renderer, yt-live-chat-app')) {
    return true;
  }

  return false;
}

function handleTabsMutation(mutations) {
  if (!isWatchPage()) return;

  const tabsPanel = document.getElementById('yt-tabs-panel');
  if (tabsPanel && tabsPanel.isConnected) {
    const related = document.querySelector(SELECTORS.RELATED);
    const comments = document.querySelector(SELECTORS.COMMENTS);
    const hasRelevantChange = mutations.some(mutation => {
      const target = mutation.target;
      const elementTarget = target instanceof Element ? target : target.parentElement;
      return !isIgnorableInnerMutation(elementTarget, related, comments);
    });
    if (!hasRelevantChange) return;
  }

  scheduleTabsSetup();
}

const tabsObserver = new MutationObserver(handleTabsMutation);

function updateTabsObserverTarget(sidebar) {
  const target = sidebar && sidebar.isConnected ? sidebar : document.documentElement;
  if (!target || currentObservedSidebar === target) return;

  tabsObserver.disconnect();
  tabsObserver.observe(target, TABS_OBSERVER_OPTIONS);
  currentObservedSidebar = target;
}

// --- メトリクス用のスコープ限定Observerと完了時自動停止タイマー ---
let metricsTimer = null;
let metricsRetryTimer = null;
let currentObservedMetadata = null;

function scheduleMetricsUpdate() {
  if (metricsTimer !== null) window.clearTimeout(metricsTimer);
  metricsTimer = window.setTimeout(() => {
    metricsTimer = null;
    if (document.hidden || !isWatchPage()) return;
    try {
      replaceMetricsToExact();
    } catch (e) {
      console.error('Metrics Error:', e);
    }
  }, TIMING.METRICS_DEBOUNCE_MS);
}

const metadataObserver = new MutationObserver(scheduleMetricsUpdate);

function observeMetadataRoot(metadataRoot) {
  if (!metadataRoot || currentObservedMetadata === metadataRoot) return;
  metadataObserver.disconnect();
  metadataObserver.observe(metadataRoot, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'content'],
  });
  currentObservedMetadata = metadataRoot;
}

function startMetricsSyncSession() {
  if (metricsRetryTimer !== null) {
    window.clearInterval(metricsRetryTimer);
    metricsRetryTimer = null;
  }
  if (!isWatchPage()) return;

  let retries = 0;
  metricsRetryTimer = window.setInterval(() => {
    if (document.hidden) return;
    if (!isWatchPage()) {
      window.clearInterval(metricsRetryTimer);
      metricsRetryTimer = null;
      return;
    }

    retries += 1;
    try {
      const allResolved = replaceMetricsToExact();
      if (allResolved || retries >= TIMING.METRICS_MAX_RETRIES) {
        window.clearInterval(metricsRetryTimer);
        metricsRetryTimer = null;
      }
    } catch (e) {
      console.error('Metrics Error:', e);
    }
  }, TIMING.METRICS_RETRY_INTERVAL_MS);
}

function handleNavigation() {
  // ページ遷移時はサイドバー要素が差し替わる可能性があるため、一旦監視をdocument全体に戻す
  updateTabsObserverTarget(null);
  scheduleTabsSetup();
  scheduleMetricsUpdate();
  startMetricsSyncSession();
}

updateTabsObserverTarget(null);
window.addEventListener('yt-navigate-finish', handleNavigation);
window.addEventListener('yt-page-data-updated', () => {
  scheduleTabsSetup();
  scheduleMetricsUpdate();
  startMetricsSyncSession();
});

handleNavigation();
