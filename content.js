// content.js
setInterval(() => {
  if (!window.location.pathname.startsWith('/watch')) return;

  // 各機能でエラーが起きても、他の機能が止まらないように保護
  try {
    setupTabsUI();
  } catch (e) { console.error('Tab UI Error:', e); }

  try {
    replaceMetricsToExact();
  } catch (e) { console.error('Metrics Error:', e); }

}, 1000);


// ＝＝＝ 以下、各機能の処理 ＝＝＝

function setupTabsUI() {
  const targetSidebar = document.querySelector('#secondary-inner') || document.querySelector('#secondary');
  const comments = document.querySelector('#comments');
  const related = document.querySelector('#related');

  if (!targetSidebar) return;

  let tabHeader = document.getElementById('yt-custom-tabs');

  // タブUIがなければ作成
  if (!tabHeader) {
    tabHeader = document.createElement('div');
    tabHeader.id = 'yt-custom-tabs';
    tabHeader.innerHTML = `
      <button id="tab-related" class="yt-tab-btn active">関連動画</button>
      <button id="tab-comments" class="yt-tab-btn">コメント</button>
    `;
    targetSidebar.prepend(tabHeader);

    // クリック時の動作
    document.getElementById('tab-related').addEventListener('click', () => {
      document.getElementById('tab-related').classList.add('active');
      document.getElementById('tab-comments').classList.remove('active');
      if (related) related.style.display = 'block';
      if (comments) comments.style.display = 'none';
    });

    document.getElementById('tab-comments').addEventListener('click', () => {
      document.getElementById('tab-comments').classList.add('active');
      document.getElementById('tab-related').classList.remove('active');
      if (related) related.style.display = 'none';
      
      if (comments) {
        comments.style.display = 'block';
      } else {
        window.scrollBy(0, 500);
        setTimeout(() => window.scrollBy(0, -500), 50);
      }
    });
  }

  // ★超重要：画面遷移や他拡張機能によるリセットへの対策（自己修復）
  // コメント要素がサイドバーの外に弾き出されていたら、再度格納する
  if (comments && !targetSidebar.contains(comments)) {
    targetSidebar.appendChild(comments);
  }

  // 現在どちらのタブがアクティブか判定
  const isRelatedActive = document.getElementById('tab-related').classList.contains('active');

  // 常に現在のタブに合わせて、関連動画とコメントの表示状態を「強制的に」上書きし続ける
  if (related) related.style.display = isRelatedActive ? 'block' : 'none';
  if (comments) comments.style.display = isRelatedActive ? 'none' : 'block';
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