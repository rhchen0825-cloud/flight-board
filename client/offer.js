// @ts-check
/**
 * 看板（src/ui/board.ts）畫成 HTML 的純函式：首頁的一區、一行，目的地頁的選項卡。
 * 使用者 2026-10-08：「分類明確」「點進沖繩要看得到哪家航空、時段、來源、有沒有驗證」。
 * 外來的字串（航空名、RSS 標題、Google 的備註）一律 esc()；連結只收 https?:。
 *
 * @typedef {{ flight: string | null, carrier: string | null, from: string, to: string, depart: string, arrive: string | null }} Leg
 * @typedef {{ status: string, source: string, price: number | null, url: string | null, at: number, note: string }} Check
 * @typedef {{ label: string, url: string }} BookLink
 * @typedef {{ id: string, section: string, itemId: string, key: string, place: string, kindLabel: string, depart: string | null,
 *   ret: string | null, carrier: string | null, legs: Leg[], price: number, currency: string, scale: string, familyPrice: number | null,
 *   source: string, observedAt: number, check: Check | null, badges: string[], links: BookLink[], trend: number[], note: string | null }} Offer
 * @typedef {{ place: string, name: string, region: string, best: string, count: number, badges: string[], kinds: { label: string, price: number, scale: string }[] }} Row
 * @typedef {{ id: string, kind: string, title: string, enabled: boolean, lastRun: { startedAt: number, finishedAt: number | null, ok: boolean | null, note: string | null } | null }} ItemStatus
 * @typedef {{ id: string, title: string, blurb: string, items: ItemStatus[], groups: { title: string, itemId: string | null, places: Row[] }[] }} Section
 * @typedef {{ id: string, name: string, region: string, offers: Offer[], deals: { carrier: string, carrierName: string, months: { month: string, min: number, days: number }[] }[] }} Place
 * @typedef {{ price: number, segs: readonly (readonly [string, string, string])[], label: string, cheapest: boolean }} TunePoint
 * @typedef {{ departs: readonly string[], rets: readonly string[], cells: readonly (readonly (TunePoint | null)[])[] }} TuneGrid
 * @typedef {{ date: string, point: TunePoint }} TuneLeg1
 * @typedef {{ observedAt: number, grid: TuneGrid, base: { depart: string, ret: string } | null, leg1: readonly TuneLeg1[] | null, leg1Base: string | null }} CompareTune
 * @typedef {{ carrier: string, price: number, basis: 'verified' | 'quote' | 'calendar', calendarTotal: number, quotePrice: number | null, depart: string, ret: string, outTime: string, backTime: string, observedAt: number, link: BookLink | null, segs: readonly (readonly [string, string, string])[], cheapest: boolean, ticket?: string, tune?: CompareTune | null }} CompareCell
 * @typedef {{ origin: string, name: string, cells: (CompareCell | null)[] }} CompareRow
 * @typedef {{ id: 'earlyJul' | 'lateAug', label: string, rows: CompareRow[] }} CompareWindow
 * @typedef {{ party: { adults: number, children: number }, currency: string, place: string, name: string, region: string, bestPrice: number, bestBasis: 'verified' | 'quote' | 'calendar', bestOrigin: string, bestCarrier: string, bestWindow: 'earlyJul' | 'lateAug', windows: CompareWindow[] }} CompareDest
 * @typedef {{ schema: number, builtAt: number, sections: Section[], places: Record<string, Place>, promos: { carrier: string, title: string, link: string, travel: string | null, at: number }[], compare: CompareDest[] }} Board
 */

import { ago, esc, money, stamp } from './format.js';

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const SOURCE_ZH = /** @type {Record<string, string>} */ ({ tripcom: 'Trip.com', 'google-booking': 'Google 訂票頁' });

/** @param {string | null | undefined} u */
export function safeUrl(u) {
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
}

/** 2027-04-17 → 4/17（六） @param {string} iso */
function day(iso) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAY[d.getUTCDay()]}）`;
}
const md = (/** @type {string} */ iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/** 價錢一定帶單位。 @param {string} scale @param {number} price @param {number | null} family */
export function scaleText(scale, price, family) {
  if (scale === 'party') return `整團 ${money(price)}`;
  if (scale === 'per-adult') return `一位大人 ${money(price)}${family === null ? '' : `（全家 ${money(family)}）`}`;
  return `每人 ${money(price)}${family === null ? '' : `（全家 ${money(family)}）`}`;
}

/** 一段：「4/17（六）06:50→10:05」；沒抵達「06:50 起飛」；沒時刻只有日期。 @param {Leg} l */
export function legText(l) {
  const time = l.depart.length > 10 ? l.depart.slice(11) : '';
  if (!time) return day(l.depart);
  const arr = l.arrive ? `→${l.arrive.slice(11)}${l.arrive.slice(0, 10) !== l.depart.slice(0, 10) ? '（+1）' : ''}` : ' 起飛';
  return `${day(l.depart)}${time}${arr}`;
}

/** @param {Check | null} c */
export function checkText(c) {
  if (c === null) return '還沒驗證';
  const src = SOURCE_ZH[c.source] ?? c.source;
  const p = c.price === null ? '' : ` ${money(c.price)}`;
  const link = safeUrl(c.url) ? `　<a href="${esc(/** @type {string} */ (safeUrl(c.url)))}" target="_blank" rel="noopener">看那一頁</a>` : '';
  if (c.status === 'match' || c.status === 'cheaper') return `✓ ${esc(src)}對得上${p}${link}`;
  if (c.status === 'pricier') return `⚠ ${esc(src)} 較貴${p}${link}`;
  if (c.status === 'not-sold') return `⚠ ${esc(src)} 沒賣${c.note ? `：${esc(c.note)}` : ''}${link}`;
  return `✗ 驗不到${c.note ? `：${esc(c.note)}` : ''}${link}`;
}

/** 數字陣列的小走勢線。 @param {number[]} xs */
function spark(xs) {
  if (xs.length < 2) return '';
  const w = 90, h = 24, lo = Math.min(...xs), hi = Math.max(...xs);
  const pts = xs.map((v, i) => `${((i / (xs.length - 1)) * (w - 4) + 2).toFixed(1)},${(hi === lo ? h / 2 : 2 + ((hi - v) / (hi - lo)) * (h - 4)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${xs.length} 次的走勢，最低 ${money(lo)}"><path class="line" d="M${pts.join(' L')}"/></svg>`;
}

const badgeHtml = (/** @type {string[]} */ bs) => bs.map((b) => `<span class="pill ${b === '推測' ? 'warn' : 'good'}">${esc(b)}</span>`).join('');

/** 目的地頁的一張選項卡。 @param {Offer} o */
export function offerCard(o) {
  const flights = o.legs.map((l) => l.flight).filter(Boolean).join('、');
  // 來回（一段或兩段）寫去程／回程；只量到去程時補一行「回程時段：沒量到」。四腿才寫第幾段。
  const roundTrip = o.legs.length <= 2;
  const legs = o.legs.length === 0 ? '<div class="muted">航班時段：還沒查</div>'
    : o.legs.map((l, i) => {
      const name = roundTrip ? (i === 0 ? '去程' : '回程') : `第 ${i + 1} 段`;
      const route = l.from && l.to ? ` ${esc(l.from)}→${esc(l.to)}` : '';
      return `<div class="leg"><span class="muted">${name}</span> ${esc(legText(l))}${route}${l.flight ? ` <span class="muted">${esc(l.flight)}</span>` : ''}</div>`;
    }).join('') + (roundTrip && o.legs.length === 1 && o.ret ? '<div class="muted small">回程時段：沒量到</div>' : '');
  const links = (Array.isArray(o.links) ? o.links : [])
    .map((l) => ({ label: l.label, url: safeUrl(l.url) }))
    .filter((l) => l.url !== null);
  const linksHtml = links.length === 0 ? ''
    : `<div class="book-links">${links.map((l) => `<a class="book-btn" href="${esc(/** @type {string} */ (l.url))}" target="_blank" rel="noopener">${esc(l.label)} →</a>`).join('')}</div>`;
  return `<article class="offer">
    <div class="row"><b>${esc(o.carrier ?? '航班時段還沒查')}</b>${flights ? ` <span class="muted small">${esc(flights)}</span>` : ''}<span class="spacer"></span>${badgeHtml(o.badges)}</div>
    <div class="muted small">${esc(o.kindLabel)}${o.depart ? `・${esc(md(o.depart))}${o.ret ? `–${esc(md(o.ret))}` : ''}` : ''}</div>
    ${legs}
    <div class="price">${esc(scaleText(o.scale, o.price, o.familyPrice))} ${spark(o.trend)}</div>
    ${o.note ? `<div class="small">${esc(o.note)}</div>` : ''}
    <div class="small">驗證：${checkText(o.check)}</div>
    <div class="muted small">來源：${esc(o.source)}・${esc(stamp(o.observedAt))}</div>
    ${linksHtml}
  </article>`;
}

/** 首頁的一行（一個目的地）。 @param {Row} r @param {Board} b @param {{ prefix?: string }} [opts] */
export function rowHtml(r, b, opts = {}) {
  const o = b.places[r.place]?.offers.find((x) => x.id === r.best);
  if (o === undefined) return '';
  const first = o.legs[0];
  const when = o.depart ? `${md(o.depart)}${o.ret ? `–${md(o.ret)}` : ''}` : '';
  const flight = o.carrier ? `${o.carrier}${first && first.depart.length > 10 ? ` ${first.depart.slice(11)}` : ''}` : '航班時段還沒查';
  const mark = o.check === null ? '' : o.check.status === 'match' || o.check.status === 'cheaper' ? '✓' : o.check.status === 'failed' ? '✗' : '⚠';
  const kinds = r.kinds.length ? `<div class="kinds">${r.kinds.map((k) => `<span class="kind">${esc(k.label)} ${esc(money(k.price))}</span>`).join('')}</div>` : '';
  const prefix = opts?.prefix ?? '';
  return `<a class="place-row" href="${prefix}#/place/${encodeURIComponent(r.place)}">
    <div class="row"><b>${esc(r.name)}</b><span class="spacer"></span>${badgeHtml(r.badges)}</div>
    <div class="row"><span class="big">${esc(scaleText(o.scale, o.price, null))}</span><span class="spacer"></span><span class="muted small">${esc(when)}</span></div>
    <div class="muted small">${esc(flight)}・${esc(o.kindLabel)}${mark ? `・${mark}` : ''}${r.count > 1 ? `・共 ${r.count} 個選項` : ''}</div>
    ${kinds}
  </a>`;
}

/** @param {ItemStatus} it @param {{ prefix?: string }} [opts] */
export function itemPill(it, opts = {}) {
  const r = it.lastRun;
  const state = !it.enabled ? '<span class="pill warn">已暫停</span>'
    : r === null ? '<span class="pill">還沒跑過</span>'
    : r.ok === null ? '<span class="pill accent">跑到一半</span>'
    : r.ok === false ? '<span class="pill bad">✗ 失敗</span>'
    : (r.note ?? '').includes('⚠') ? '<span class="pill warn">部分沒查到</span>' : '';
  const when = r === null ? '' : ` <span class="muted small">${esc(ago(r.finishedAt ?? r.startedAt, Date.now()))}</span>`;
  const prefix = opts?.prefix ?? '';
  return `<a class="item-link" href="${prefix}#/item/${encodeURIComponent(it.id)}">${esc(it.title)}</a>${when} ${state}`;
}

/** 首頁的一區。 @param {Section} s @param {Board} b @param {{ manage?: boolean }} [opts] */
export function sectionHtml(s, b, opts = {}) {
  const manage = opts?.manage ?? true;
  const empty = s.id === 'deals' ? '還沒有比平常便宜的。特價偵測每小時在量，各目的地每家航空的每月最低價在目的地頁。' : '還沒有資料';
  const groups = s.groups.map((g) => `${g.title ? `<h3>${esc(g.title)}</h3>` : ''}${g.places.length ? g.places.map((r) => rowHtml(r, b)).join('') : `<p class="muted small">${empty}</p>`}`).join('');
  const promos = s.id === 'deals' && b.promos.length ? `<div class="promos">${b.promos.map((p) => {
    const link = safeUrl(p.link);
    return `<div class="promo">📣 <b>${esc(p.carrier)}</b> ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}${p.travel ? ` <span class="muted small">搭乘 ${esc(p.travel)}</span>` : ''}</div>`;
  }).join('')}</div>` : '';
  const itemsHtml = manage
    ? `<details class="items"><summary class="small">管理（${s.items.length} 個追蹤項目）</summary>${s.items.map((it) => `<div>${itemPill(it)}</div>`).join('')}</details>`
    : '';
  return `<section class="board-section" id="sec-${esc(s.id)}">
    <h2>${esc(s.title)}</h2>
    <p class="muted small">${esc(s.blurb)}</p>
    ${itemsHtml}
    ${promos}${groups}
  </section>`;
}

/** 目的地頁。 @param {Place} p @param {Board} b */
export function placeHtml(p, b) {
  const titles = Object.fromEntries(b.sections.map((s) => [s.id, s.title]));
  const bySection = new Map();
  for (const o of p.offers) bySection.set(o.section, [...(bySection.get(o.section) ?? []), o]);
  const deals = p.deals.length ? `<section><h2>特價偵測：每家每月最低（一位大人來回）</h2><table class="months"><tbody>${p.deals.map((d) =>
    `<tr><th>${esc(d.carrierName)}</th>${d.months.map((m) => `<td><span class="muted small">${esc(m.month.slice(0, 4))}/${Number(m.month.slice(5))}</span><br>${esc(money(m.min))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>` : '';
  return `<p><a href="#/">← 首頁</a></p>
    <h1>${esc(p.name)} <span class="muted small">${esc(p.region)}</span></h1>
    ${[...bySection].map(([sid, os]) => `<section><h2>${esc(titles[sid] ?? sid)}</h2>${os.map(offerCard).join('')}</section>`).join('')}
    ${deals}`;
}

const SECTION_EMOJIS = /** @type {Record<string, string>} */ ({
  deals: '🔥',
  summer: '☀️',
  weekend: '🗓',
  holiday: '🏮',
  radar: '📡',
});

/**
 * 精選卡：一行標題「<section emoji> <place 名稱>・<kindLabel>」，第二行「<carrier>・<日期 md>」，
 * 第三行價錢（scaleText）＋右邊第一個訂票按鈕（offer.links[0]，safeUrl+esc）。
 * 整張卡（除了按鈕）是連到 #/place/<place> 的連結；按鈕點了不跳頁（按鈕放在 <a> 外面，不要巢狀 <a>）。
 *
 * @param {Offer} o
 * @param {Row} row
 * @param {Section} section
 * @param {{ prefix?: string }} [opts]
 * @returns {string}
 */
export function pickCardHtml(o, row, section, opts = {}) {
  const emoji = section.title.match(/^\p{Extended_Pictographic}/u)?.[0] ?? SECTION_EMOJIS[section.id] ?? '';
  const title = `${emoji ? `${emoji} ` : ''}${esc(row.name)}・${esc(o.kindLabel)}`;
  const carrier = o.carrier ?? '航班時段還沒查';
  const when = o.depart ? `${md(o.depart)}${o.ret ? `–${md(o.ret)}` : ''}` : '';
  const secondLine = when ? `${esc(carrier)}・${esc(when)}` : esc(carrier);
  const price = scaleText(o.scale, o.price, o.familyPrice);

  const firstLink = Array.isArray(o.links) && o.links.length > 0 ? o.links[0] : null;
  const linkUrl = firstLink ? safeUrl(firstLink.url) : null;
  const btnHtml = linkUrl && firstLink
    ? `<a class="book-btn" href="${esc(linkUrl)}" target="_blank" rel="noopener">${esc(firstLink.label)} →</a>`
    : '';
  const prefix = opts?.prefix ?? '';

  return `<article class="pick">
    <a class="pick-main" href="${prefix}#/place/${encodeURIComponent(row.place)}">
      <div class="row"><b>${title}</b></div>
      <div class="muted small">${secondLine}</div>
      <div class="price">${esc(price)}</div>
    </a>
    ${btnHtml}
  </article>`;
}

/**
 * 目的地頁精簡卡：
 * 預設看得到：一行「<carrier>・<kindLabel>・<日期 md–md>」、價錢（scaleText）、badges、訂票按鈕列（所有 links）。
 * <details class="detail"><summary>看航段與細節</summary> 裡放：航段、note、驗證（checkText）、來源與時間。
 *
 * @param {Offer} o
 * @returns {string}
 */
export function compactOfferHtml(o) {
  const carrier = o.carrier ?? '航班時段還沒查';
  const when = o.depart ? `${md(o.depart)}${o.ret ? `–${md(o.ret)}` : ''}` : '';
  const firstLine = when ? `${esc(carrier)}・${esc(o.kindLabel)}・${esc(when)}` : `${esc(carrier)}・${esc(o.kindLabel)}`;
  const roundTrip = o.legs.length <= 2;
  const legs = o.legs.length === 0 ? '<div class="muted">航班時段：還沒查</div>'
    : o.legs.map((l, i) => {
      const name = roundTrip ? (i === 0 ? '去程' : '回程') : `第 ${i + 1} 段`;
      const route = l.from && l.to ? ` ${esc(l.from)}→${esc(l.to)}` : '';
      return `<div class="leg"><span class="muted">${name}</span> ${esc(legText(l))}${route}${l.flight ? ` <span class="muted">${esc(l.flight)}</span>` : ''}</div>`;
    }).join('') + (roundTrip && o.legs.length === 1 && o.ret ? '<div class="muted small">回程時段：沒量到</div>' : '');

  const links = (Array.isArray(o.links) ? o.links : [])
    .map((l) => ({ label: l.label, url: safeUrl(l.url) }))
    .filter((l) => l.url !== null);
  const linksHtml = links.length === 0 ? ''
    : `<div class="book-links">${links.map((l) => `<a class="book-btn" href="${esc(/** @type {string} */ (l.url))}" target="_blank" rel="noopener">${esc(l.label)} →</a>`).join('')}</div>`;

  return `<article class="compact">
    <div class="row"><b>${firstLine}</b><span class="spacer"></span>${badgeHtml(o.badges)}</div>
    <div class="price">${esc(scaleText(o.scale, o.price, o.familyPrice))}</div>
    ${linksHtml}
    <details class="detail">
      <summary>看航段與細節</summary>
      ${legs}
      ${o.note ? `<div class="small">${esc(o.note)}</div>` : ''}
      <div class="small">驗證：${checkText(o.check)}</div>
      <div class="muted small">來源：${esc(o.source)}・${esc(stamp(o.observedAt))}</div>
    </details>
  </article>`;
}

export { publicPlaceHtml, publicSectionHtml } from './board-views.js';
