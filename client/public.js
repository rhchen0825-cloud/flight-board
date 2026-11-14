// @ts-check
/**
 * 太太用的唯讀網址（公開看板快照）前端。
 * 不含任何管理、編輯、查價、清單功能。
 */

import { renderRoute } from './board-views.js';

export {
  PUBLIC_TABS,
  timeHeaderHtml,
  tabsHtml,
  picksHtml,
  boardHtml,
  renderRoute,
} from './board-views.js';

/**
 * 客戶端初始化：抓取 board.json 並監聽路由。
 */
export async function init() {
  const view = document.getElementById('view');
  if (!view) return;

  try {
    const res = await fetch(`./board.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    /** @type {import('./offer.js').Board} */
    const board = await res.json();

    const render = () => {
      view.innerHTML = renderRoute(location.hash || '#/', board);
      window.scrollTo(0, 0);
    };

    window.addEventListener('hashchange', render);
    render();
  } catch {
    view.innerHTML = '<p class="muted">暫時讀不到資料</p>';
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void init();
}
