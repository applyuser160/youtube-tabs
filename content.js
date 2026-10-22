// content.js
let tabsSetupTimer = null;

function scheduleTabsSetup() {
  if (tabsSetupTimer !== null) window.clearTimeout(tabsSetupTimer);
  tabsSetupTimer = window.setTimeout(() => {
    tabsSetupTimer = null;
    if (!window.location.pathname.startsWith('/watch')) return;
    try {
      setupTabsUI();
    } catch (e) { console.error('Tab UI Error:', e); }
  }, 100);
}

// YouTube is a single page app. Watch pages and their sidebar renderers can be
// replaced after navigation, so initialize when the DOM changes instead of
// repeatedly moving the same renderers on a timer.
const tabsObserver = new MutationObserver(scheduleTabsSetup);
if (document.documentElement) {
  tabsObserver.observe(document.documentElement, { childList: true, subtree: true });
}
window.addEventListener('yt-navigate-finish', scheduleTabsSetup);
scheduleTabsSetup();

// The metrics helper still needs to revisit values that YouTube fills in late.
setInterval(() => {
  if (!window.location.pathname.startsWith('/watch')) return;
  try {
    replaceMetricsToExact();
  } catch (e) { console.error('Metrics Error:', e); }
}, 1000);


// ＝＝＝ 以下、各機能の処理 ＝＝＝

function setupTabsUI() {
  const secondary = document.querySelector('#secondary');
  const secondaryInner = document.querySelector('#secondary-inner');
  const sidebar = secondary || secondaryInner;
  const comments = document.querySelector('#comments');
  const related = document.querySelector('#related');
  if (!sidebar || !related || !comments || !related.isConnected || !comments.isConnected) return;

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

  // Put the tabs beside YouTube's native inner sidebar so both use the same height.
  if (tabsPanel.parentElement !== sidebar) sidebar.appendChild(tabsPanel);
  if (related.parentElement !== tabsPanel) tabsPanel.appendChild(related);
  if (comments.parentElement !== tabsPanel) tabsPanel.appendChild(comments);

  // YouTube changes the live chat wrapper and live attributes between watch
  // page layouts. Detect the rendered chat itself instead of relying on a
  // particular ytd-watch-flexy attribute being present.
  const chatSelector = [
    'ytd-live-chat-frame',
    'yt-live-chat-renderer',
    'yt-live-chat-app',
    '#chatframe',
    'iframe#chatframe',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-live-chat"]'
  ].join(',');
  const chatCandidates = Array.from(sidebar.querySelectorAll(chatSelector))
    .filter(element => !tabsPanel.contains(element));
  const liveChat = chatCandidates.find(element => {
    let ancestor = element;
    while (ancestor && ancestor !== sidebar.parentElement) {
      const style = window.getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden') {
        return false;
      }
      if (ancestor === sidebar) break;
      ancestor = ancestor.parentElement;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  const hasLiveChat = Boolean(liveChat);
  const layoutRoot = secondary || sidebar;
  const previouslyHadLiveChat = layoutRoot.dataset.ytHadLiveChat === 'true';
  layoutRoot.classList.toggle('yt-has-live-chat', hasLiveChat);

  sidebar.querySelectorAll('.yt-live-chat-block').forEach(element => {
    element.classList.remove('yt-live-chat-block');
  });
  if (hasLiveChat) {
    let chatBlock = liveChat;
    while (
      chatBlock.parentElement &&
      chatBlock.parentElement !== sidebar &&
      chatBlock.parentElement !== secondaryInner
    ) {
      chatBlock = chatBlock.parentElement;
    }
    if (chatBlock.parentElement === sidebar || chatBlock.parentElement === secondaryInner) {
      chatBlock.classList.add('yt-live-chat-block');
    }
  }

  const relatedButton = tabsPanel.querySelector('#tab-related');
  const commentsButton = tabsPanel.querySelector('#tab-comments');
  if (relatedButton.dataset.ytTabsBound !== 'true') {
    relatedButton.addEventListener('click', () => activateSidebarTab('related'));
    relatedButton.dataset.ytTabsBound = 'true';
  }
  if (commentsButton.dataset.ytTabsBound !== 'true') {
    commentsButton.addEventListener('click', () => activateSidebarTab('comments'));
    commentsButton.dataset.ytTabsBound = 'true';
  }

  if (previouslyHadLiveChat && !hasLiveChat) {
    relatedButton.classList.add('active');
    commentsButton.classList.remove('active');
    relatedButton.setAttribute('aria-selected', 'true');
    commentsButton.setAttribute('aria-selected', 'false');
  }
  layoutRoot.dataset.ytHadLiveChat = String(hasLiveChat);

  const showRelated = relatedButton.classList.contains('active');
  setSidebarTabState(relatedButton, commentsButton, related, comments, showRelated ? 'related' : 'comments');
}

function setSidebarTabState(relatedButton, commentsButton, related, comments, activeTab) {
  const showRelated = activeTab === 'related';
  relatedButton.classList.toggle('active', showRelated);
  commentsButton.classList.toggle('active', !showRelated);
  relatedButton.setAttribute('aria-selected', String(showRelated));
  commentsButton.setAttribute('aria-selected', String(!showRelated));
  related.style.display = showRelated ? 'block' : 'none';
  comments.style.display = showRelated ? 'none' : 'block';
}

function activateSidebarTab(activeTab) {
  const tabsPanel = document.getElementById('yt-tabs-panel');
  const relatedButton = tabsPanel && tabsPanel.querySelector('#tab-related');
  const commentsButton = tabsPanel && tabsPanel.querySelector('#tab-comments');
  const related = document.querySelector('#related');
  const comments = document.querySelector('#comments');
  if (!relatedButton || !commentsButton || !related || !comments) return;

  setSidebarTabState(relatedButton, commentsButton, related, comments, activeTab);

  // Showing a previously hidden renderer can expose content that YouTube has
  // deferred until layout/intersection changes. Give it a fresh layout pass.
  if (activeTab === 'comments') {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    }));
  }
}

function replaceMetricsToExact() {
  // 1. 高評価数の書き換え
  const likeButtons = document.querySelectorAll('button[aria-label*="いいね"], button[aria-label*="高評価"], button[aria-label*="高く評価"]');
  likeButtons.forEach(btn => {
    const label = btn.getAttribute('aria-label') || '';
    const exactMatch = label.match(/[\d,]+/);
    if (exactMatch) {
      const exactLikes = exactMatch[0];
      const textElem = btn.querySelector('.yt-core-attributed-string') ||
                       btn.querySelector('.yt-spec-button-shape-next__button-text-content') ||
                       btn.querySelector('div:not([class])');
      if (textElem && textElem.textContent.match(/[万億]/)) {
        textElem.textContent = exactLikes;
      }
    }
  });

  // 2. 投稿日時の取得
  let exactDateTime = null;
  const dateMeta = document.querySelector('meta[itemprop="uploadDate"]') || document.querySelector('meta[itemprop="datePublished"]');
  if (dateMeta && dateMeta.content) {
    const dateObj = new Date(dateMeta.content);
    if (!isNaN(dateObj.getTime())) {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const h = String(dateObj.getHours()).padStart(2, '0');
      const min = String(dateObj.getMinutes()).padStart(2, '0');
      exactDateTime = `${y}/${m}/${d} ${h}:${min}`;
    }
  }

  // 3. 再生回数の取得
  const tooltipElem = document.querySelector('ytd-watch-metadata #description tp-yt-paper-tooltip');
  let exactViews = null;
  if (tooltipElem) {
    const fullText = tooltipElem.textContent.trim();
    const viewMatch = fullText.match(/[\d,]+\s*回視聴/);
    exactViews = viewMatch ? viewMatch[0] : null;
  }

  // 4. 画面のテキストを差し替え
  const spans = document.querySelectorAll('ytd-watch-metadata #description-inner span');
  spans.forEach(span => {
    const text = span.textContent;
    if (exactViews && text.includes('回視聴') && text.match(/[万億]/)) {
      span.textContent = exactViews;
    }
    if (exactDateTime && (text.includes('前') || text.includes('昨日') || text.match(/\d{4}(年|\/)\d{1,2}(月|\/)\d{1,2}/))) {
      span.textContent = exactDateTime;
    }
  });
}
