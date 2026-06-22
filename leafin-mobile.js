/* ════════════════════════════════════════════════════════════
   LEAFIN MOBILE  —  共用手機版適配（純前端、零相依）
   做兩件事：
   1) 注入 RWD 樣式（側欄變抽屜、格線收合、字級放大、防橫向捲動）
   2) 在頂欄插入漢堡鈕，把固定側欄變成可滑出的抽屜
   只在 ≤ 820px 生效，桌機外觀完全不動。
   每頁只要 <script src="leafin-mobile.js" defer></script> 即可。
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BP = 820; // 手機/小平板斷點

  /* ── 1. 樣式 ── */
  var css = `
@media (max-width: ${BP}px) {

  /* 版面外殼：側欄變抽屜 */
  .app { height: auto; min-height: 100vh; overflow: visible; }
  .sidebar {
    position: fixed; top: 0; left: 0; bottom: 0;
    width: 264px; min-width: 264px;
    z-index: 1200;
    transform: translateX(-100%);
    transition: transform .26s ease;
    box-shadow: 0 0 40px rgba(0,0,0,0.18);
    padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  }
  body.lf-nav-open .sidebar { transform: none; }

  .lf-nav-backdrop {
    position: fixed; inset: 0;
    background: rgba(20,30,26,0.42);
    z-index: 1100;
    opacity: 0; visibility: hidden;
    transition: opacity .26s ease, visibility .26s ease;
  }
  body.lf-nav-open .lf-nav-backdrop { opacity: 1; visibility: visible; }
  body.lf-nav-open { overflow: hidden; }

  /* 手機改用「整頁自然捲動」：解除各層固定高度/內捲，頂欄仍 sticky */
  .main { height: auto; min-height: 0; overflow: visible; }
  .scroll-area { overflow: visible; height: auto; }
  .topbar {
    /* z-index 需低於各頁 modal 遮罩（200+），否則固定頂欄會蓋在 modal 上 */
    position: sticky; top: 0; z-index: 100;
    height: auto !important; min-height: 56px;
    flex-wrap: wrap;
    align-items: center;
    row-gap: 6px;
    padding: 8px 12px;
    padding-top: calc(8px + env(safe-area-inset-top));
    gap: 8px;
  }
  /* 主頁問候語：單行省略 */
  .greeting {
    font-size: 14px; min-width: 0; flex: 1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* 內頁標題列：左側佔滿、右側控制鈕自動換行靠右 */
  .topbar-left { flex: 1 1 auto; min-width: 0; }
  .topbar-right { flex-wrap: wrap; justify-content: flex-end; }
  .page-title { font-size: 16px; }

  /* 漢堡鈕 */
  .lf-burger {
    flex-shrink: 0;
    width: 42px; height: 42px;
    margin-left: -6px;
    display: inline-flex; align-items: center; justify-content: center;
    border: none; border-radius: 12px;
    background: transparent; color: var(--text, #2D3436);
    cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .lf-burger:active { background: rgba(0,0,0,0.06); }

  /* 內容區間距收斂 + 較大字級易讀 */
  body { font-size: 15px; }
  .content { padding: 14px 14px 40px; gap: 14px; }

  /* 防止任何元素撐破畫面 */
  img { max-width: 100%; height: auto; }
  .scroll-area, .content, .main { min-width: 0; }

  /* ── 格線收合 ── */
  /* 行內樣式的多欄格線一律收成單欄 */
  [style*="grid-template-columns"] { grid-template-columns: 1fr !important; }

  /* 具名多欄容器收成單欄 */
  .bottom-row, .footer-row,
  .cat-grid, .kpi-grid, .sim-cols, .quick-form, .sync-grid,
  .settings-cards, .ag-presets-grid, .ob-goal-grid,
  .two-col, .row2, .am-row2, .am-row3, .lm-calc-grid, .legend-col,
  .ag-row-2, .eg-row-2 {
    grid-template-columns: 1fr !important;
  }

  /* 統計卡 / 夢想卡：手機保留兩欄較好看 */
  .metrics-row, .goals-row { grid-template-columns: 1fr 1fr !important; gap: 12px !important; }

  /* flex 版的指標列 → 收支頁 KPI 兩欄、資產頁淨值卡直排 */
  .kpi-row { flex-wrap: wrap; gap: 12px !important; }
  .kpi-row > .kpi-card { flex: 1 1 calc(50% - 6px); min-width: 0; }
  .nw-row { flex-direction: column; }
  .nw-row .nw-hero-col { flex: none; }
  .nw-row .networth-hero, .nw-row .nw-chart-col .card { height: auto; }

  /* 夢想頁 3 欄版面 → 單欄、解除內捲；起點列可換行 */
  .goals-layout {
    grid-template-columns: 1fr !important;
    overflow: visible !important;
    min-height: 0;
  }
  .left-col, .mid-col, .right-col, .goal-list { overflow: visible !important; }
  .baseline-bar { flex-wrap: wrap; row-gap: 12px; }
  .baseline-bar .bl-left { flex-wrap: wrap; gap: 14px; }
  .baseline-bar .bl-divider { display: none; }

  /* 模擬頁：左右兩欄（設定 + 結果）→ 直排 */
  .content-wrap { flex-direction: column; overflow: visible !important; }
  .control-panel {
    width: auto !important; min-width: 0 !important;
    border-right: none; border-bottom: 1px solid var(--border);
    overflow: visible !important;
  }
  .results-area { overflow: visible !important; padding: 20px 16px; }

  /* Hero 區：圖縮小、文字優先 */
  .hero { min-height: 0; }
  .hero-left { max-width: none; padding: 20px 18px; }
  .hero-title { font-size: 21px; }
  .hero-sub { font-size: 13px; }

  /* Modal：滿版自適應、可捲動 */
  [class*="modal"]:not([class*="overlay"]),
  .ob-card, .imp-modal, .am-modal, .ag-modal, .eg-modal {
    width: auto !important;
    max-width: calc(100vw - 24px) !important;
    max-height: 88vh !important;
    overflow-y: auto;
  }
  .ob-card { padding: 28px 22px !important; }
}

@media (max-width: 480px) {
  .metrics-row, .goals-row { grid-template-columns: 1fr !important; }
  .hero-title { font-size: 19px; }
}
`;
  var styleEl = document.createElement('style');
  styleEl.id = 'leafin-mobile-css';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── 2. 抽屜行為 ── */
  function init() {
    var sidebar = document.querySelector('.sidebar');
    var topbar = document.querySelector('.topbar');
    if (!sidebar || !topbar) return;
    if (document.querySelector('.lf-burger')) return; // 避免重複

    // 漢堡鈕（插在頂欄最前）
    var burger = document.createElement('button');
    burger.className = 'lf-burger';
    burger.setAttribute('aria-label', '開啟選單');
    burger.setAttribute('aria-expanded', 'false');
    burger.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    topbar.insertBefore(burger, topbar.firstChild);

    // 背景遮罩
    var backdrop = document.createElement('div');
    backdrop.className = 'lf-nav-backdrop';
    document.body.appendChild(backdrop);

    function open() {
      document.body.classList.add('lf-nav-open');
      burger.setAttribute('aria-expanded', 'true');
    }
    function close() {
      document.body.classList.remove('lf-nav-open');
      burger.setAttribute('aria-expanded', 'false');
    }
    function toggle() {
      if (document.body.classList.contains('lf-nav-open')) close(); else open();
    }

    burger.addEventListener('click', toggle);
    backdrop.addEventListener('click', close);
    // 點任何側欄連結後自動關閉抽屜
    sidebar.addEventListener('click', function (e) {
      if (e.target.closest('.nav-item')) close();
    });
    // Esc 關閉
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    // 視窗放大回桌機尺寸時自動關閉，避免狀態殘留
    window.addEventListener('resize', function () {
      if (window.innerWidth > BP) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
