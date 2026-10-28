// content.js

// ============================================================================
// 1. 定数・セレクタ定義
// ============================================================================

const TIMING = {
  SETUP_DEBOUNCE_MS: 100,
  METRICS_DEBOUNCE_MS: 150,
  METRICS_RETRY_INTERVAL_MS: 500,
  METRICS_MAX_RETRIES: 25,
};

const SELECTORS = {
  WATCH_FLEXY: 'ytd-watch-flexy',
  SECONDARY: '#secondary',
  SECONDARY_INNER: '#secondary-inner',
  BELOW: '#below',
  PRIMARY_INNER: '#primary-inner',
  RELATED: '#related',
  COMMENTS: '#comments',
  CUSTOM_TABS: '#yt-custom-tabs',
  LEGACY_TABS_PANEL: '#yt-tabs-panel',
  TAB_RELATED_BTN: '#tab-related',
  TAB_COMMENTS_BTN: '#tab-comments',
  LIVE_CHAT_BLOCK_CLASS: 'yt-live-chat-block',
  PLAYLIST_BLOCK_CLASS: 'yt-playlist-block',
  HAS_LIVE_CHAT_CLASS: 'yt-has-live-chat',
  HAS_PLAYLIST_CLASS: 'yt-has-playlist',
  TABS_ACTIVE_CLASS: 'yt-tabs-active',
  LIVE_CHAT_CANDIDATES: [
    'ytd-live-chat-frame:not([collapsed])',
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
    'like-button-view-model button',
    'segmented-like-dislike-button-view-model button[aria-label*="評価"]:not([aria-label*="低く評価"])',
    'button[aria-label*="いいね"]',
    'button[aria-label*="高評価"]',
    'button[aria-label*="高く評価"]',
  ].join(', '),
  LIKE_TEXT_CANDIDATES: [
    '.ytSpecButtonShapeNextButtonTextContent',
    '.yt-spec-button-shape-next__button-text-content',
    '.ytAttributedStringHost',
    '.yt-core-attributed-string',
    'div:not([class])',
  ].join(', '),
  UPLOAD_DATE_META: 'meta[itemprop="uploadDate"], meta[itemprop="datePublished"]',
  MICROFORMAT_SCRIPT: 'script[type="application/ld+json"]',
  DESCRIPTION_TOOLTIP: 'ytd-watch-metadata #description tp-yt-paper-tooltip',
  VIEW_COUNT_CONTAINER: 'ytd-watch-metadata ytd-watch-info-text #view-count',
  DATE_TEXT_CONTAINER: 'ytd-watch-metadata ytd-watch-info-text #date-text',
  DESCRIPTION_INFO_SPANS: [
    'ytd-watch-metadata #info span',
    'ytd-watch-metadata ytd-watch-info-text > #info span',
  ].join(', '),
  DESCRIPTION_BODY_EXCLUDE: [
    'ytd-text-inline-expander',
    '#description-inline-expander',
    '#snippet',
    '#expanded',
    '#attributed-snippet-text',
    '#attributed-description-text',
    'ytd-structured-description-content-renderer',
    'tp-yt-paper-tooltip',
  ].join(', '),
};

const PATTERNS = {
  EXACT_NUMBER: /[\d,]+/,
  ABBREVIATED_UNIT: /[万億]/,
  DATE_ONLY: /^(\d{4})-(\d{2})-(\d{2})$/,
  EXACT_VIEWS: /[\d,]+\s*回視聴/,
  RELATIVE_DATE_TEXT: /(?:\d+\s*(?:秒|分|時間|日|週間|か月|ヶ月|年)前|^昨日$)/,
  DATE_TEXT: /\d{4}(?:年|\/)\d{1,2}(?:月|\/)\d{1,2}/,
};


// ============================================================================
// 2. DOM操作ヘルパー（不要なMutation発火を防ぐべき等更新）
// ============================================================================

function isWatchPage() {
  return window.location.pathname.startsWith('/watch');
}

function getWatchFlexy() {
  return document.querySelector(SELECTORS.WATCH_FLEXY);
}

function setAttributeIfChanged(element, attr, value) {
  if (element.getAttribute(attr) !== value) {
    element.setAttribute(attr, value);
  }
}

function removeAttributeIfPresent(element, attr) {
  if (element.hasAttribute(attr)) {
    element.removeAttribute(attr);
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

let isNavigating = false;
let navigationSafetyTimer = null;

/**
 * YouTube本体（ytd-watch-flexy）はページ遷移時や1カラム/2カラム切り替え時に
 * `#below` 直下の `#comments` や `#secondary-inner` 直下の `#related` を基準に
 * `insertBefore` 等のDOM操作およびデータバインディングを実行する。
 *
 * そのため：
 * 1. `#related` は本来の親（`#secondary-inner`）から絶対に移動させない。
 * 2. `#comments` は「コメント」タブ表示中のみサイドバーへ移動し、
 *    「関連動画」タブ表示中・ページ遷移開始時・1カラム時は本来の `#below` に戻す。
 * これにより YouTube 側の初期化クラッシュ（関連動画や概要欄が空になる問題）を根本から防止する。
 */
function restoreCommentsToBelow(watchFlexy) {
  const root = watchFlexy || getWatchFlexy() || document;
  const comments = root.querySelector(SELECTORS.COMMENTS);
  if (!comments) return;

  const below = root.querySelector(SELECTORS.BELOW) || root.querySelector(SELECTORS.PRIMARY_INNER);
  if (below && comments.parentElement !== below) {
    below.appendChild(comments);
  }
}

function cleanupLegacyTabsPanel(sidebar, below) {
  const legacyPanel = document.querySelector(SELECTORS.LEGACY_TABS_PANEL);
  if (!legacyPanel) return;

  const relatedInPanel = legacyPanel.querySelector(SELECTORS.RELATED);
  if (relatedInPanel && sidebar) {
    sidebar.appendChild(relatedInPanel);
  }
  const commentsInPanel = legacyPanel.querySelector(SELECTORS.COMMENTS);
  if (commentsInPanel && below) {
    below.appendChild(commentsInPanel);
  }
  legacyPanel.remove();
}

function teardownTabsUI(watchFlexy) {
  restoreCommentsToBelow(watchFlexy);

  const root = watchFlexy || document;
  const secondary = root.querySelector(SELECTORS.SECONDARY);
  const related = secondary && secondary.querySelector(SELECTORS.RELATED);
  const comments = root.querySelector(SELECTORS.COMMENTS);
  const tabHeader = document.querySelector(SELECTORS.CUSTOM_TABS);

  if (tabHeader) {
    setStyleDisplayIfChanged(tabHeader, 'none');
  }
  if (related) {
    setStyleDisplayIfChanged(related, '');
  }
  if (comments) {
    setStyleDisplayIfChanged(comments, '');
  }
  if (secondary) {
    toggleClassIfChanged(secondary, SELECTORS.TABS_ACTIVE_CLASS, false);
    toggleClassIfChanged(secondary, SELECTORS.HAS_LIVE_CHAT_CLASS, false);
    toggleClassIfChanged(secondary, SELECTORS.HAS_PLAYLIST_CLASS, false);
  }
}

function setupTabsUI() {
  if (isNavigating) return;

  const watchFlexy = getWatchFlexy();
  if (!watchFlexy) {
    updateTabsObserverTarget(null);
    return;
  }

  updateTabsObserverTarget(watchFlexy);

  // 2カラムレイアウト確定前（初期ロードの1カラム段階やウィンドウ縮小状態）は
  // YouTube側のDOM配置処理と競合しないようタブ化を行わずネイティブ構造を維持する
  if (!watchFlexy.hasAttribute('is-two-columns_')) {
    teardownTabsUI(watchFlexy);
    return;
  }

  const secondary = watchFlexy.querySelector(SELECTORS.SECONDARY);
  const secondaryInner = watchFlexy.querySelector(SELECTORS.SECONDARY_INNER);
  const sidebar = secondaryInner || secondary;
  const below = watchFlexy.querySelector(SELECTORS.BELOW) || watchFlexy.querySelector(SELECTORS.PRIMARY_INNER);

  if (!sidebar || !secondary) {
    return;
  }

  cleanupLegacyTabsPanel(sidebar, below);

  // `#primary-inner` 内の空の `#related` を誤取得しないよう、必ずサイドバー内から `#related` を取得する
  const related = sidebar.querySelector(SELECTORS.RELATED);
  const comments = watchFlexy.querySelector(SELECTORS.COMMENTS);
  if (!related || !comments || !related.isConnected || !comments.isConnected) {
    return;
  }

  const tabHeader = ensureTabHeader();

  // DOM書き込みの前に、ライブチャット・プレイリストの可視状態を計測する
  const liveChat = findVisibleLiveChat(secondary, tabHeader, related, comments);
  const hasLiveChat = Boolean(liveChat);
  const chatBlock = hasLiveChat ? resolveSidebarTopBlock(liveChat, secondary, secondaryInner) : null;

  const playlist = findVisiblePlaylist(secondary, tabHeader, related, comments);
  const hasPlaylist = Boolean(playlist);
  const playlistBlock = hasPlaylist ? resolveSidebarTopBlock(playlist, secondary, secondaryInner) : null;

  // --- 以下、DOM書き込み処理 ---
  toggleClassIfChanged(secondary, SELECTORS.TABS_ACTIVE_CLASS, true);
  setStyleDisplayIfChanged(tabHeader, '');

  // タブバーを `#related` の直前に配置（`#related` 自体は親から移動させない）
  if (tabHeader.parentElement !== sidebar || tabHeader.nextElementSibling !== related) {
    sidebar.insertBefore(tabHeader, related);
  }

  const previouslyHadLiveChat = secondary.dataset.ytHadLiveChat === 'true';
  toggleClassIfChanged(secondary, SELECTORS.HAS_LIVE_CHAT_CLASS, hasLiveChat);
  toggleClassIfChanged(secondary, SELECTORS.HAS_PLAYLIST_CLASS, hasPlaylist);
  syncSidebarBlockClass(secondary, SELECTORS.LIVE_CHAT_BLOCK_CLASS, chatBlock);
  syncSidebarBlockClass(secondary, SELECTORS.PLAYLIST_BLOCK_CLASS, playlistBlock);

  const relatedButton = tabHeader.querySelector(SELECTORS.TAB_RELATED_BTN);
  const commentsButton = tabHeader.querySelector(SELECTORS.TAB_COMMENTS_BTN);
  bindTabButtons(relatedButton, commentsButton);

  let activeTab = relatedButton.classList.contains('active') ? 'related' : 'comments';
  if (previouslyHadLiveChat && !hasLiveChat) {
    activeTab = 'related';
  }

  setSidebarTabState(relatedButton, commentsButton, related, comments, sidebar, below, activeTab);

  const nextHadLiveChat = String(hasLiveChat);
  if (secondary.dataset.ytHadLiveChat !== nextHadLiveChat) {
    secondary.dataset.ytHadLiveChat = nextHadLiveChat;
  }
}

function ensureTabHeader() {
  let tabHeader = document.getElementById('yt-custom-tabs');
  if (!tabHeader) {
    tabHeader = document.createElement('div');
    tabHeader.id = 'yt-custom-tabs';
    tabHeader.setAttribute('role', 'tablist');

    const relatedBtn = document.createElement('button');
    relatedBtn.id = 'tab-related';
    relatedBtn.className = 'yt-tab-btn active';
    relatedBtn.type = 'button';
    relatedBtn.setAttribute('role', 'tab');
    relatedBtn.setAttribute('aria-selected', 'true');
    relatedBtn.textContent = '関連動画';

    const commentsBtn = document.createElement('button');
    commentsBtn.id = 'tab-comments';
    commentsBtn.className = 'yt-tab-btn';
    commentsBtn.type = 'button';
    commentsBtn.setAttribute('role', 'tab');
    commentsBtn.setAttribute('aria-selected', 'false');
    commentsBtn.textContent = 'コメント';

    tabHeader.appendChild(relatedBtn);
    tabHeader.appendChild(commentsBtn);
  }
  return tabHeader;
}

function isExcludedFromTopBlocks(element, tabHeader, related, comments) {
  return (
    (tabHeader && (element === tabHeader || tabHeader.contains(element))) ||
    (related && (element === related || related.contains(element))) ||
    (comments && (element === comments || comments.contains(element)))
  );
}

function findVisibleLiveChat(secondary, tabHeader, related, comments) {
  const candidates = Array.from(secondary.querySelectorAll(SELECTORS.LIVE_CHAT_CANDIDATES))
    .filter(el => !isExcludedFromTopBlocks(el, tabHeader, related, comments));

  return candidates.find(el => {
    if (el.closest('[collapsed], [hidden]')) return false;
    return isElementVisibleInSidebar(el, secondary, 60);
  }) || null;
}

function findVisiblePlaylist(secondary, tabHeader, related, comments) {
  const candidates = Array.from(secondary.querySelectorAll(SELECTORS.PLAYLIST_CANDIDATES))
    .filter(el => !isExcludedFromTopBlocks(el, tabHeader, related, comments));

  return candidates.find(el => {
    if (el.closest('[hidden]')) return false;
    const container = el.querySelector('#container');
    if (container && (container.hidden || container.hasAttribute('hidden'))) {
      return false;
    }
    return isElementVisibleInSidebar(el, secondary, 40);
  }) || null;
}

function isElementVisibleInSidebar(element, sidebarRoot, minHeight = 1) {
  if (element.hidden || element.hasAttribute('hidden')) {
    return false;
  }

  let ancestor = element;
  while (ancestor && ancestor !== sidebarRoot.parentElement) {
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
    if (ancestor === sidebarRoot) break;
    ancestor = ancestor.parentElement;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height >= minHeight;
}

function resolveSidebarTopBlock(element, secondary, secondaryInner) {
  let block = element;
  while (
    block.parentElement &&
    block.parentElement !== secondary &&
    block.parentElement !== secondaryInner
  ) {
    block = block.parentElement;
  }
  if (block.parentElement === secondary || block.parentElement === secondaryInner) {
    return block;
  }
  return null;
}

function syncSidebarBlockClass(secondary, className, activeBlock) {
  secondary.querySelectorAll(`.${className}`).forEach(element => {
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

function setSidebarTabState(relatedButton, commentsButton, related, comments, sidebar, below, activeTab) {
  const showRelated = activeTab === 'related';
  toggleClassIfChanged(relatedButton, 'active', showRelated);
  toggleClassIfChanged(commentsButton, 'active', !showRelated);
  setAttributeIfChanged(relatedButton, 'aria-selected', String(showRelated));
  setAttributeIfChanged(commentsButton, 'aria-selected', String(!showRelated));

  if (showRelated) {
    // 関連動画タブ表示中は `#comments` を本来の `#below` に戻し、YouTube標準のDOM構造を保つ
    if (below && comments.parentElement !== below) {
      below.appendChild(comments);
    }
    removeAttributeIfPresent(related, 'hidden');
    setStyleDisplayIfChanged(related, 'block');
    setStyleDisplayIfChanged(comments, 'none');
  } else {
    // ページ遷移中でなければ `#comments` をサイドバーの `#related` 直後へ配置して表示する
    if (!isNavigating && sidebar && comments.parentElement !== sidebar) {
      related.after(comments);
    }
    removeAttributeIfPresent(comments, 'hidden');
    setStyleDisplayIfChanged(related, 'none');
    setStyleDisplayIfChanged(comments, 'block');
  }
}

function activateSidebarTab(activeTab) {
  const watchFlexy = getWatchFlexy();
  if (!watchFlexy) return;

  const secondary = watchFlexy.querySelector(SELECTORS.SECONDARY);
  const secondaryInner = watchFlexy.querySelector(SELECTORS.SECONDARY_INNER);
  const sidebar = secondaryInner || secondary;
  const below = watchFlexy.querySelector(SELECTORS.BELOW) || watchFlexy.querySelector(SELECTORS.PRIMARY_INNER);
  const tabHeader = document.getElementById('yt-custom-tabs');
  if (!sidebar || !tabHeader) return;

  const relatedButton = tabHeader.querySelector(SELECTORS.TAB_RELATED_BTN);
  const commentsButton = tabHeader.querySelector(SELECTORS.TAB_COMMENTS_BTN);
  const related = sidebar.querySelector(SELECTORS.RELATED);
  const comments = watchFlexy.querySelector(SELECTORS.COMMENTS);
  if (!relatedButton || !commentsButton || !related || !comments) return;

  setSidebarTabState(relatedButton, commentsButton, related, comments, sidebar, below, activeTab);

  // タブ切り替え時にYouTube側の遅延読み込み（IntersectionObserver / Layout）を促す
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
  }));
}


// ============================================================================
// 4. メトリクス厳密表示機能（高評価数・投稿日時・再生回数）
// ============================================================================

let cachedRawUploadDate = null;
let cachedFormattedUploadDate = null;

let lastProcessedVideoId = null;

function replaceMetricsToExact() {
  const watchFlexy = getWatchFlexy();
  const metadataRoot = (watchFlexy || document).querySelector(SELECTORS.WATCH_METADATA);
  if (metadataRoot) {
    observeMetadataRoot(metadataRoot);
  }

  const videoId = getCurrentVideoId(watchFlexy);
  const videoChanged = Boolean(videoId && videoId !== lastProcessedVideoId);

  const likesResolved = updateExactLikes(document, videoId);
  const exactDateTime = getExactUploadDateTime(watchFlexy, videoId);
  const exactViews = getExactViewCount();
  if (!exactDateTime && !exactViews) {
    return false;
  }

  const descriptionResolved = updateDescriptionMetrics(exactViews, exactDateTime);
  if (likesResolved && descriptionResolved && videoId) {
    lastProcessedVideoId = videoId;
  }
  return !videoChanged && likesResolved && descriptionResolved;
}

function updateExactLikes(root, videoId) {
  const likeButtons = root.querySelectorAll(SELECTORS.LIKE_BUTTONS);
  if (likeButtons.length === 0) return false;

  let hasUpdatedAny = false;
  likeButtons.forEach(btn => {
    const label = btn.getAttribute('aria-label') || '';
    if (label.includes('低く評価')) return;

    const exactMatch = label.match(PATTERNS.EXACT_NUMBER);
    if (!exactMatch) return;

    const exactLikes = exactMatch[0];
    // SPA遷移直後、前の動画のaria-labelがまだ残っている場合は完了とみなさない
    if (
      videoId &&
      btn.dataset.ytLikesVideoId &&
      btn.dataset.ytLikesVideoId !== videoId &&
      btn.dataset.ytLikesValue === exactLikes
    ) {
      return;
    }

    const textElem = btn.querySelector(SELECTORS.LIKE_TEXT_CANDIDATES);
    if (!textElem || textElem.children.length > 0) return;

    const currentText = textElem.textContent.trim();
    if (!currentText) return;

    if (PATTERNS.ABBREVIATED_UNIT.test(currentText) || currentText !== exactLikes) {
      setTextContentIfChanged(textElem, exactLikes);
    }
    if (videoId) {
      btn.dataset.ytLikesVideoId = videoId;
      btn.dataset.ytLikesValue = exactLikes;
    }
    hasUpdatedAny = true;
  });
  return hasUpdatedAny;
}

function getCurrentVideoId(watchFlexy) {
  try {
    const params = new URLSearchParams(window.location.search);
    const idFromUrl = params.get('v');
    if (idFromUrl) return idFromUrl;
  } catch {}
  return watchFlexy ? watchFlexy.getAttribute('video-id') : null;
}

function formatIsoDateTime(rawDate) {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();
  if (!trimmed) return null;
  if (trimmed === cachedRawUploadDate) {
    return cachedFormattedUploadDate;
  }

  const dateOnlyMatch = trimmed.match(PATTERNS.DATE_ONLY);
  const dateObj = new Date(trimmed);
  if (isNaN(dateObj.getTime())) return null;

  // YYYY-MM-DD のみのメタデータはタイムゾーン変換による日付ずれを防ぐためそのまま保持する
  const y = dateOnlyMatch ? dateOnlyMatch[1] : dateObj.getFullYear();
  const m = dateOnlyMatch ? dateOnlyMatch[2] : String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = dateOnlyMatch ? dateOnlyMatch[3] : String(dateObj.getDate()).padStart(2, '0');
  const h = String(dateObj.getHours()).padStart(2, '0');
  const min = String(dateObj.getMinutes()).padStart(2, '0');

  cachedRawUploadDate = trimmed;
  cachedFormattedUploadDate = `${y}/${m}/${d} ${h}:${min}`;
  return cachedFormattedUploadDate;
}

function extractUploadDateFromLdJson(videoId) {
  const scripts = document.querySelectorAll(SELECTORS.MICROFORMAT_SCRIPT);
  for (const script of scripts) {
    const text = script.textContent;
    if (!text || !text.includes('uploadDate')) continue;
    if (videoId && !text.includes(videoId)) continue;
    try {
      const data = JSON.parse(text);
      if (data && typeof data.uploadDate === 'string') {
        return data.uploadDate;
      }
    } catch {}
  }
  return null;
}

function getExactUploadDateTime(watchFlexy, videoId = getCurrentVideoId(watchFlexy)) {
  // 1. 現在再生中の動画IDと一致する JSON-LD (VideoObject) から正確なISO日時を取得
  const ldDate = extractUploadDateFromLdJson(videoId);
  if (ldDate) {
    return formatIsoDateTime(ldDate);
  }

  // 2. SPA遷移前は meta[itemprop="uploadDate"] が利用可能（ただし別動画の古いmetaは除外）
  const idMeta = document.querySelector('meta[itemprop="identifier"], meta[itemprop="videoId"]');
  const metaMatchesVideo = !videoId || !idMeta || !idMeta.content || idMeta.content === videoId;
  if (metaMatchesVideo) {
    const dateMeta =
      (watchFlexy && watchFlexy.querySelector(SELECTORS.UPLOAD_DATE_META)) ||
      document.querySelector(SELECTORS.UPLOAD_DATE_META);
    if (dateMeta && dateMeta.content) {
      return formatIsoDateTime(dateMeta.content);
    }
  }

  // 3. フォールバック：概要欄ツールチップ内の公開日テキスト（YYYY/MM/DD）を取得
  const tooltipElem = document.querySelector(SELECTORS.DESCRIPTION_TOOLTIP);
  if (tooltipElem) {
    const dateMatch = tooltipElem.textContent.match(PATTERNS.DATE_TEXT);
    if (dateMatch) {
      return dateMatch[0];
    }
  }

  return null;
}

function getExactViewCount() {
  const tooltipElem = document.querySelector(SELECTORS.DESCRIPTION_TOOLTIP);
  if (!tooltipElem) return null;

  const fullText = tooltipElem.textContent.trim();
  const viewMatch = fullText.match(PATTERNS.EXACT_VIEWS);
  return viewMatch ? viewMatch[0] : null;
}

function updateRollingNumberContainer(containerSelector, exactText) {
  if (!exactText) return false;
  const container = document.querySelector(containerSelector);
  if (!container) return false;

  const rollingNumber = container.querySelector('yt-animated-rolling-number');
  const formattedStrings = container.querySelectorAll('yt-formatted-string');

  // YouTube本体がアクティブに描画している（digitsが存在する）場合のみ更新し、
  // SPA遷移後に #info 側へ描画が切り替わった場合はこのコンテナを非表示に戻す
  const digits = rollingNumber && rollingNumber.querySelector('.animatedRollingNumberDigits');
  const isRollingActive = Boolean(digits && digits.children.length > 0);
  if (!isRollingActive) {
    if (formattedStrings.length > 0 && formattedStrings[0].dataset.ytExactInjected === 'true') {
      formattedStrings[0].textContent = '';
      formattedStrings[0].setAttribute('is-empty', '');
      delete formattedStrings[0].dataset.ytExactInjected;
    }
    return false;
  }

  setStyleDisplayIfChanged(rollingNumber, 'none');

  if (formattedStrings.length > 0) {
    const primary = formattedStrings[0];
    primary.dataset.ytExactInjected = 'true';
    removeAttributeIfPresent(primary, 'is-empty');
    setTextContentIfChanged(primary, `${exactText}  `);
    for (let i = 1; i < formattedStrings.length; i++) {
      setStyleDisplayIfChanged(formattedStrings[i], 'none');
    }
    return true;
  }

  return false;
}

function updateDescriptionMetrics(exactViews, exactDateTime) {
  let viewsUpdated = !exactViews;
  let dateUpdated = !exactDateTime;

  // 1. 新UI（ytd-watch-info-text 内の #view-count / #date-text アニメーション数値構造）の更新
  if (exactViews && updateRollingNumberContainer(SELECTORS.VIEW_COUNT_CONTAINER, exactViews)) {
    viewsUpdated = true;
  }
  if (exactDateTime && updateRollingNumberContainer(SELECTORS.DATE_TEXT_CONTAINER, exactDateTime)) {
    dateUpdated = true;
  }
  if (viewsUpdated && dateUpdated) {
    return true;
  }

  // 2. 従来UIおよびSPA遷移後の #info 内 span 構造の更新
  // 動画の説明文本文（ytd-text-inline-expander等）を絶対に書き換えないよう、
  // 概要欄上部の情報ヘッダ領域（#info）の末端spanのみを対象とする
  const spans = document.querySelectorAll(SELECTORS.DESCRIPTION_INFO_SPANS);
  if (spans.length === 0) return viewsUpdated && dateUpdated;

  spans.forEach(span => {
    // 子要素を持つラッパーspanや、説明文本文領域内のspanは絶対に書き換えない
    if (span.children.length > 0) return;
    if (span.closest(SELECTORS.DESCRIPTION_BODY_EXCLUDE)) return;

    const text = span.textContent;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 60 || trimmed.includes('\n')) return;

    if (exactViews && trimmed.includes('回視聴')) {
      if (PATTERNS.ABBREVIATED_UNIT.test(trimmed)) {
        setTextContentIfChanged(span, exactViews);
      }
      viewsUpdated = true;
    }

    if (exactDateTime) {
      if (trimmed === exactDateTime) {
        dateUpdated = true;
      } else if (
        PATTERNS.RELATIVE_DATE_TEXT.test(trimmed) ||
        PATTERNS.DATE_TEXT.test(trimmed)
      ) {
        setTextContentIfChanged(span, exactDateTime);
        dateUpdated = true;
      }
    }
  });

  return viewsUpdated && dateUpdated;
}


// ============================================================================
// 5. エントリポイント・イベントおよびDOM監視制御
// ============================================================================

let tabsSetupTimer = null;
let currentObservedTarget = null;

const TABS_OBSERVER_OPTIONS = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['hidden', 'collapsed', 'is-two-columns_'],
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

  // 1. 関連動画・コメント欄の内部要素のスクロール追加等は無視（直下の子追加時は再評価を許可）
  if (
    (related && target !== related && related.contains(target)) ||
    (comments && target !== comments && comments.contains(target))
  ) {
    return true;
  }

  // 2. 動画プレイヤー内部・メタデータ内部・プレイリストアイテム・ライブチャット内部の細かな更新は無視
  if (
    target.closest(
      '#player, ytd-player, ytd-watch-metadata, #items.playlist-items, ytd-live-chat-renderer, yt-live-chat-app'
    )
  ) {
    return true;
  }

  return false;
}

function handleTabsMutation(mutations) {
  if (!isWatchPage()) return;

  const watchFlexy = getWatchFlexy();
  if (watchFlexy) {
    const secondary = watchFlexy.querySelector(SELECTORS.SECONDARY);
    const related = secondary && secondary.querySelector(SELECTORS.RELATED);
    const comments = watchFlexy.querySelector(SELECTORS.COMMENTS);
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

function updateTabsObserverTarget(watchFlexy) {
  const target = watchFlexy && watchFlexy.isConnected ? watchFlexy : document.documentElement;
  if (!target || currentObservedTarget === target) return;

  tabsObserver.disconnect();
  tabsObserver.observe(target, TABS_OBSERVER_OPTIONS);
  currentObservedTarget = target;
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
    characterData: true,
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

function handleNavigateStart() {
  isNavigating = true;
  if (navigationSafetyTimer !== null) {
    window.clearTimeout(navigationSafetyTimer);
  }
  if (metricsRetryTimer !== null) {
    window.clearInterval(metricsRetryTimer);
    metricsRetryTimer = null;
  }
  // ページ遷移開始時に `#comments` を本来の `#below` へ戻し、YouTube側のDOM更新エラーを防ぐ
  restoreCommentsToBelow();

  // 万一遷移が中断された場合でもロックが残留しないようフェイルセーフタイマーを設定
  navigationSafetyTimer = window.setTimeout(() => {
    navigationSafetyTimer = null;
    if (isNavigating) {
      isNavigating = false;
      scheduleTabsSetup();
    }
  }, 1500);
}

function handleNavigation() {
  isNavigating = false;
  if (navigationSafetyTimer !== null) {
    window.clearTimeout(navigationSafetyTimer);
    navigationSafetyTimer = null;
  }
  updateTabsObserverTarget(getWatchFlexy());
  scheduleTabsSetup();
  scheduleMetricsUpdate();
  startMetricsSyncSession();
}

updateTabsObserverTarget(null);
window.addEventListener('yt-navigate-start', handleNavigateStart);
window.addEventListener('yt-navigate-finish', handleNavigation);
window.addEventListener('yt-page-data-updated', () => {
  isNavigating = false;
  scheduleTabsSetup();
  scheduleMetricsUpdate();
  startMetricsSyncSession();
});

handleNavigation();
