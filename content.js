// content.js
setInterval(() => {
  // 動画視聴ページ以外では実行しない
  if (!window.location.pathname.startsWith('/watch')) return;

  setupTabsUI();
  replaceMetricsToExact();
}, 1000);


// ＝＝＝ 以下、各機能の処理 ＝＝＝

function setupTabsUI() {
  const targetSidebar = document.querySelector('#secondary-inner') || document.querySelector('#secondary');
  if (!targetSidebar) return;

  if (document.getElementById('yt-custom-tabs')) {
    const comments = document.querySelector('#comments');
    if (comments && !targetSidebar.contains(comments)) {
      targetSidebar.appendChild(comments);
      const isRelatedActive = document.getElementById('tab-related').classList.contains('active');
      comments.style.display = isRelatedActive ? 'none' : 'block';
    }
    return;
  }

  const tabHeader = document.createElement('div');
  tabHeader.id = 'yt-custom-tabs';
  tabHeader.innerHTML = `
    <button id="tab-related" class="yt-tab-btn active">関連動画</button>
    <button id="tab-comments" class="yt-tab-btn">コメント</button>
  `;
  targetSidebar.prepend(tabHeader);

  document.getElementById('tab-related').addEventListener('click', () => {
    document.getElementById('tab-related').classList.add('active');
    document.getElementById('tab-comments').classList.remove('active');
    const related = document.querySelector('#related');
    const comments = document.querySelector('#comments');
    if (related) related.style.display = 'block';
    if (comments) comments.style.display = 'none';
  });

  document.getElementById('tab-comments').addEventListener('click', () => {
    document.getElementById('tab-comments').classList.add('active');
    document.getElementById('tab-related').classList.remove('active');
    const related = document.querySelector('#related');
    const comments = document.querySelector('#comments');
    if (related) related.style.display = 'none';
    if (comments) {
      comments.style.display = 'block';
    } else {
      window.scrollBy(0, 500);
      setTimeout(() => window.scrollBy(0, -500), 50);
    }
  });
}

function replaceMetricsToExact() {
  // 1. 高評価数の書き換え
  // 「高く評価」が含まれるボタンをすべて探す（送り仮名の違いに対応）
  const likeButtons = document.querySelectorAll('button[aria-label*="高く評価"]');
  
  likeButtons.forEach(btn => {
    const label = btn.getAttribute('aria-label') || '';
    
    // 「他 11,174 人も...」などから数字とカンマだけを抽出
    const exactMatch = label.match(/[\d,]+/);
    
    if (exactMatch) {
      const exactLikes = exactMatch[0]; 
      
      const textElem = btn.querySelector('.ytSpecButtonShapeNextButtonTextContent');
                       
      // 表示されているテキストに「万」や「億」が含まれていれば差し替える
      if (textElem && textElem.textContent.match(/[万億]/)) {
        textElem.textContent = exactLikes;
      }
    }
  });

  // 2. 再生回数と投稿日時の書き換え
  const tooltipElem = document.querySelector('ytd-watch-metadata #description tp-yt-paper-tooltip');
  if (tooltipElem) {
    const fullText = tooltipElem.textContent.trim();
    
    const viewMatch = fullText.match(/[\d,]+\s*回視聴/);
    const exactViews = viewMatch ? viewMatch[0] : null;

    const dateMatch = fullText.match(/\d{4}(\/|年)\d{1,2}(\/|月)\d{1,2}(日)?/);
    const exactDate = dateMatch ? dateMatch[0] : null;

    const spans = document.querySelectorAll('ytd-watch-metadata #description-inner span');
    spans.forEach(span => {
      const text = span.textContent;
      if (exactViews && text.includes('回視聴') && text.match(/[万億]/)) {
        span.textContent = exactViews;
      }
      if (exactDate && (text.includes('前') || text.includes('昨日'))) {
        span.textContent = exactDate;
      }
    });
  }
}