// @ts-check
/**
 * 看板共用視圖（分頁列、精選、分類頁、目的地頁）。
 * 太太版（公開快照）與私人看板共用同一套畫面架構。
 *
 * @typedef {{ manage?: boolean, prefix?: string }} ViewOptions
 */

import { esc, money, stamp } from './format.js';
import { compactOfferHtml, itemPill, pickCardHtml, rowHtml, safeUrl } from './offer.js';
import { compareHtml } from './compare.js';

export { compareHtml };

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export const PUBLIC_TABS = [
  { id: '', label: '精選', href: '#/' },
  { id: 'deals', label: '特價', href: '#/s/deals' },
  { id: 'summer', label: '暑假', href: '#/s/summer' },
  { id: 'fullscan', label: '全排列', href: '#/s/fullscan' },
  { id: 'compare', label: '外站比價', href: '#/compare' },
  { id: 'weekend', label: '週末', href: '#/s/weekend' },
  { id: 'holiday', label: '連假', href: '#/s/holiday' },
  { id: 'radar', label: '雷達', href: '#/s/radar' },
];

export const BOARD_TABS = PUBLIC_TABS;

/**
 * 頂部資料時間標記；超過 3 小時顯示警告。
 *
 * @param {number} builtAt
 * @param {number} [now]
 * @returns {string}
 */
export function timeHeaderHtml(builtAt, now = Date.now()) {
  const isStale = (now - builtAt) > THREE_HOURS_MS;
  const time = stamp(builtAt);
  const stale = isStale ? ' <span class="pill warn">⚠ 資料可能過時</span>' : '';
  return `<div class="data-time">資料時間 ${esc(time)}${stale}</div>`;
}

/**
 * 固定（sticky）分頁列：精選｜特價｜暑假｜週末｜連假｜雷達。
 *
 * @param {string | null} [activeId]
 * @param {ViewOptions} [opts]
 * @returns {string}
 */
export function tabsHtml(activeId = '', opts = {}) {
  const norm = activeId === 'picks' ? '' : activeId;
  const prefix = opts?.prefix ?? '';
  return `<nav class="tabs-public">${PUBLIC_TABS.map((t) => {
    const isActive = norm !== null && (norm ? t.id === norm : t.id === '');
    const cls = isActive ? ' class="active"' : '';
    const current = isActive ? ' aria-current="page"' : '';
    const href = prefix ? `${prefix}${t.href}` : t.href;
    return `<a href="${href}"${cls}${current}>${esc(t.label)}</a>`;
  }).join('')}</nav>`;
}

/**
 * 精選首頁：每個 section 取「排序後第一個 group 的前幾個 rows」的 best offer：
 * summer、weekend 各 2 張，其他各 1 張；沒有資料的 section 跳過。
 *
 * @param {import('./offer.js').Board} b
 * @param {ViewOptions} [opts]
 * @returns {string}
 */
export function picksHtml(b, opts = {}) {
  const cards = [];
  for (const s of b.sections) {
    const limit = (s.id === 'summer' || s.id === 'weekend') ? 2 : 1;
    const g = s.groups[0];
    if (!g || !g.places || g.places.length === 0) continue;
    const rows = g.places.slice(0, limit);
    for (const r of rows) {
      const o = b.places[r.place]?.offers.find((x) => x.id === r.best);
      if (!o) continue;
      cards.push(pickCardHtml(o, r, s, opts));
    }
  }
  return `<div class="picks">${cards.join('')}</div><p class="muted small">點上面的分頁看全部</p>`;
}

/**
 * 首頁別名（相容舊介面）。
 *
 * @param {import('./offer.js').Board} b
 * @param {ViewOptions} [opts]
 * @returns {string}
 */
export function boardHtml(b, opts = {}) {
  return picksHtml(b, opts);
}

/**
 * 分類頁：標題＋blurb，每組前 5 行＋「看更多（還有 N 個）」，促銷前 3 則＋「看更多」。
 * manage: true 時最下方顯示追蹤項目管理區；manage: false 時不顯示（太太版）。
 *
 * @param {import('./offer.js').Section} s
 * @param {import('./offer.js').Board} b
 * @param {ViewOptions} [opts]
 * @returns {string}
 */
export function sectionHtml(s, b, opts = {}) {
  const manage = opts?.manage ?? false;
  const empty = s.id === 'deals' ? '還沒有比平常便宜的。特價偵測每小時在量，各目的地每家航空的每月最低價在目的地頁。' : '還沒有資料';
  const groups = s.groups.map((g) => {
    const heading = g.title ? `<h3>${esc(g.title)}</h3>` : '';
    if (!g.places.length) {
      return `${heading}<p class="muted small">${empty}</p>`;
    }
    if (g.places.length <= 5) {
      return `${heading}${g.places.map((r) => rowHtml(r, b, opts)).join('')}`;
    }
    const head = g.places.slice(0, 5).map((r) => rowHtml(r, b, opts)).join('');
    const tail = g.places.slice(5).map((r) => rowHtml(r, b, opts)).join('');
    return `${heading}${head}<details class="more"><summary>看更多（還有 ${g.places.length - 5} 個）</summary>${tail}</details>`;
  }).join('');

  let promos = '';
  if (s.id === 'deals' && Array.isArray(b.promos) && b.promos.length > 0) {
    const promoItem = (/** @type {import('./offer.js').Board['promos'][number]} */ p) => {
      const link = safeUrl(p.link);
      return `<div class="promo">📣 <b>${esc(p.carrier)}</b> ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}${p.travel ? ` <span class="muted small">搭乘 ${esc(p.travel)}</span>` : ''}</div>`;
    };
    if (b.promos.length <= 3) {
      promos = `<div class="promos">${b.promos.map(promoItem).join('')}</div>`;
    } else {
      const head = b.promos.slice(0, 3).map(promoItem).join('');
      const tail = b.promos.slice(3).map(promoItem).join('');
      promos = `<div class="promos">${head}<details class="more"><summary>看更多（還有 ${b.promos.length - 3} 個）</summary>${tail}</details></div>`;
    }
  }

  const itemsHtml = manage
    ? `<details class="items"><summary class="small">管理（${s.items.length} 個追蹤項目）</summary>${s.items.map((it) => `<div>${itemPill(it, opts)}</div>`).join('')}</details>`
    : '';

  return `<section class="board-section" id="sec-${esc(s.id)}">
    <h2>${esc(s.title)}</h2>
    <p class="muted small">${esc(s.blurb)}</p>
    ${promos}${groups}${itemsHtml}
  </section>`;
}

/**
 * 分類頁別名（相容太太版名稱）。
 *
 * @param {import('./offer.js').Section} s
 * @param {import('./offer.js').Board} b
 * @param {ViewOptions} [opts]
 * @returns {string}
 */
export function publicSectionHtml(s, b, opts = {}) {
  return sectionHtml(s, b, { manage: false, ...opts });
}

/**
 * 目的地頁：照 section 分組，先顯示 3 張精簡卡，其他放「更多選項（N）」，
 * 特價月份表收合進「每月最低價」，頂端「← 回上一頁」。
 *
 * @param {import('./offer.js').Place} p
 * @param {import('./offer.js').Board} b
 * @param {ViewOptions} [opts]
 * @returns {string}
 */
export function placeHtml(p, b, opts = {}) {
  const prefix = opts?.prefix ?? '';
  const titles = Object.fromEntries(b.sections.map((s) => [s.id, s.title]));
  const bySection = new Map();
  for (const o of p.offers) bySection.set(o.section, [...(bySection.get(o.section) ?? []), o]);

  let firstSec = p.offers?.[0]?.section;
  if (!firstSec) {
    for (const s of b.sections) {
      if (s.groups.some((g) => g.places.some((r) => r.place === p.id))) {
        firstSec = s.id;
        break;
      }
    }
  }
  const backHref = firstSec ? `${prefix}#/s/${encodeURIComponent(firstSec)}` : `${prefix}#/`;

  const sectionsHtml = [...bySection].map(([sid, os]) => {
    let offersHtml;
    if (os.length <= 3) {
      offersHtml = os.map(compactOfferHtml).join('');
    } else {
      const head = os.slice(0, 3).map(compactOfferHtml).join('');
      const tail = os.slice(3).map(compactOfferHtml).join('');
      offersHtml = `${head}<details class="more"><summary>更多選項（${os.length - 3}）</summary>${tail}</details>`;
    }
    return `<section><h2>${esc(titles[sid] ?? sid)}</h2>${offersHtml}</section>`;
  }).join('');

  const deals = p.deals && p.deals.length ? `<section><details class="more"><summary>每月最低價</summary><table class="months"><tbody>${p.deals.map((d) =>
    `<tr><th>${esc(d.carrierName)}</th>${d.months.map((m) => `<td><span class="muted small">${esc(m.month.slice(0, 4))}/${Number(m.month.slice(5))}</span><br>${esc(money(m.min))}</td>`).join('')}</tr>`).join('')}</tbody></table></details></section>` : '';

  return `<p><a href="${backHref}">← 回上一頁</a></p>
    <h1>${esc(p.name)} <span class="muted small">${esc(p.region)}</span></h1>
    ${sectionsHtml}
    ${deals}`;
}

/**
 * 目的地頁別名（相容太太版名稱）。
 *
 * @param {import('./offer.js').Place} p
 * @param {import('./offer.js').Board} b
 * @param {ViewOptions} [opts]
 * @returns {string}
 */
export function publicPlaceHtml(p, b, opts = {}) {
  return placeHtml(p, b, opts);
}

/**
 * Hash 路由渲染（太太版公開快照用）：支援精選（#/）、分類頁（#/s/<id>）、目的地頁（#/place/<id>）。
 *
 * @param {string} hash
 * @param {import('./offer.js').Board} b
 * @param {number} [now]
 * @param {ViewOptions} [opts]
 * @returns {string}
 */
export function renderRoute(hash, b, now = Date.now(), opts = {}) {
  const header = timeHeaderHtml(b.builtAt, now);
  const prefix = opts?.prefix ?? '';

  if (hash.startsWith('#/place/')) {
    const id = decodeURIComponent(hash.slice('#/place/'.length));
    const p = b.places[id];
    const nav = tabsHtml(null, opts);
    if (!p) {
      return `${header}${nav}<p class="muted">找不到目的地。<a href="${prefix}#/">回精選</a></p>`;
    }
    return `${header}${nav}${placeHtml(p, b, opts)}`;
  }

  if (hash.startsWith('#/s/')) {
    const id = decodeURIComponent(hash.slice('#/s/'.length));
    const s = b.sections.find((x) => x.id === id);
    const nav = tabsHtml(id, opts);
    if (!s) {
      return `${header}${nav}<p class="muted">找不到此分類。<a href="${prefix}#/">回精選</a></p>`;
    }
    return `${header}${nav}${sectionHtml(s, b, opts)}`;
  }

  if (hash === '#/compare' || hash.startsWith('#/compare/')) {
    return `${header}${tabsHtml('compare', opts)}${compareHtml(b, opts)}`;
  }

  const nav = tabsHtml('', opts);
  return `${header}${nav}${picksHtml(b, opts)}`;
}
