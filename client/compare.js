// @ts-check
/**
 * 外站比價檢視：每個目的地一張表，列出各外站 × 航空在七月初與八月底的最低價。
 * 結合日曆價、四腿細掃與 Trip.com 驗證，標出最便宜的外站並附訂票連結。
 */

import { esc, money } from './format.js';
import { safeUrl } from './offer.js';

/**
 * Trip.com 的城市代碼；要跟 src/verify/plan.ts 的 TRIPCOM_CITY 一致（tests/ui/client/compare.test.ts 會比對，漂移就失敗）。
 * @type {Record<string, string>}
 */
export const TRIPCOM_CITY = {
  CGK: 'JKT', TSA: 'TPE', NRT: 'TYO', HND: 'TYO', KIX: 'OSA', ITM: 'OSA', ICN: 'SEL', GMP: 'SEL', PVG: 'SHA',
  PEK: 'BJS', PKX: 'BJS', DMK: 'BKK', LHR: 'LON', LGW: 'LON', CDG: 'PAR', ORY: 'PAR', FCO: 'ROM', MXP: 'MIL', LIN: 'MIL',
  JFK: 'NYC', EWR: 'NYC', CTS: 'SPK', TFU: 'CTU',
};

/**
 * 只有日曆價的格子沒有精確連結：用航段組 Trip.com 手機版多城市搜尋網址（跟 src/verify/plan.ts 的 tripcomUrl 同格式）。
 * 整份看板不帶每格一條長網址，不然比價這一區就 1MB 以上。
 *
 * @param {readonly (readonly [string, string, string])[]} segs
 * @param {{ adults: number, children: number }} party
 * @param {string} currency
 * @returns {string}
 */
export function tripcomUrl(segs, party, currency) {
  let u = 'https://tw.trip.com/m/flights/flightfirst/?curseg=1&classtype=0&infant=0&stoptype=0&locale=zh-tw'
    + `&curr=${currency}&triptype=2&segs=${segs.length}&adult=${party.adults}&child=${party.children}`;
  segs.forEach(([from, to, date], i) => {
    const k = i === 0 ? '' : String(i);
    u += `&ddate${k}=${date}&dcitycode${k}=${TRIPCOM_CITY[from] ?? from}&dairportcode${k}=${from}`
      + `&acitycode${k}=${TRIPCOM_CITY[to] ?? to}&aairportcode${k}=${to}`;
  });
  return u;
}

/** @type {Record<string, string>} */
const CARRIER_SHORT = {
  CI: '華航',
  BR: '長榮',
  JX: '星宇',
};

/** @param {string} iso */
function formatMD(iso) {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}

/**
 * 畫單一格子的微調展開區（包含去程×回程日期表與第 1 段條帶）。
 *
 * @param {import('./offer.js').CompareCell} c
 * @param {import('./offer.js').CompareDest} d
 * @returns {string}
 */
function tuneCellHtml(c, d) {
  const tune = c.tune;
  if (!tune) return '';

  const carrierName = CARRIER_SHORT[c.carrier] ?? c.carrier;
  const depMD = formatMD(c.depart);
  const retMD = formatMD(c.ret);
  const summaryText = `微調・${carrierName}（${depMD}–${retMD}）`;
  const summaryHtml = `<summary>${esc(summaryText)}</summary>`;

  // 1. 日期表
  const gridPoints = tune.grid.cells.flat().filter(Boolean);
  const allSameGridPrice = gridPoints.length > 0 && gridPoints.every((p) => p && p.price === gridPoints[0]?.price);
  const gridNote = allSameGridPrice
    ? '這張票換日期價格不變，挑班次與時段即可'
    : 'Matrix 估價（只看同一張票換日期的差異，實際價以 Trip.com 為準）；— 表示較貴或沒有班次';
  const at = new Date(tune.observedAt);
  const atText = `算於 ${at.getMonth() + 1}/${at.getDate()}`;
  const gridNoteHtml = `<div class="cmp-tune-note muted small">${esc(gridNote)}（${esc(atText)}）</div>`;

  const theadHtml = `<thead><tr><th>去＼回</th>${tune.grid.rets.map((r) => `<th>${esc(formatMD(r))}</th>`).join('')}</tr></thead>`;

  const tbodyRows = tune.grid.departs.map((dep, i) => {
    const rowTh = `<th>${esc(formatMD(dep))}</th>`;
    const cellsHtml = tune.grid.rets.map((ret, j) => {
      const pt = tune.grid.cells[i]?.[j];
      if (!pt) {
        return '<td class="cmp-tune-cell muted">—</td>';
      }

      const isBase = tune.base !== null && tune.base.depart === dep && tune.base.ret === ret;
      const clsList = ['cmp-tune-cell'];
      const showBest = pt.cheapest && !allSameGridPrice; // 全部同價時每格都 ★ 只是雜訊
      if (showBest) clsList.push('best');
      if (isBase) clsList.push('base');

      const star = showBest ? '★ ' : '';
      const baseBadge = isBase ? ' <span class="cmp-tune-cur">目前</span>' : '';
      const priceHtml = `<div class="cmp-tune-price"><b>${star}${money(pt.price)}</b>${baseBadge}</div>`;
      const labelHtml = `<div class="small muted">${esc(pt.label)}</div>`;

      const u = safeUrl(tripcomUrl(pt.segs, d.party, d.currency));
      const linkHtml = u ? `<div><a href="${esc(u)}" target="_blank" rel="noopener">訂</a></div>` : '';

      return `<td class="${clsList.join(' ')}">${priceHtml}${labelHtml}${linkHtml}</td>`;
    }).join('');
    return `<tr>${rowTh}${cellsHtml}</tr>`;
  }).join('');

  const gridTableHtml = `<div class="cmp-scroll"><table class="cmp-tune-grid">${theadHtml}<tbody>${tbodyRows}</tbody></table></div>`;

  // 2. 第 1 段條帶（tune.leg1 !== null 時）
  let leg1Html = '';
  if (tune.leg1 !== null && tune.leg1.length > 0) {
    const baseLeg = tune.leg1.find((l) => l.date === tune.leg1Base);
    const basePrice = baseLeg ? baseLeg.point.price : (tune.leg1[0]?.point.price ?? 0);
    const allSameLeg1 = tune.leg1.every((l) => l.point.price === basePrice);

    if (allSameLeg1) {
      const baseDateStr = tune.leg1Base ?? (tune.leg1[0]?.date ?? '');
      const maxDistanceDays = Math.max(
        ...tune.leg1.map((l) => {
          const t1 = Date.parse(`${l.date}T00:00:00Z`);
          const t2 = Date.parse(`${baseDateStr}T00:00:00Z`);
          return Math.abs(Math.round((t1 - t2) / 86400000));
        }),
      );
      leg1Html = `<div class="cmp-tune-sec" style="margin-top: 8px;"><div class="muted small">第 1 段前後 ±${maxDistanceDays} 天價格相同</div></div>`;
    } else {
      const stripItemsHtml = tune.leg1.map((l) => {
        const isBase = l.date === tune.leg1Base;
        const isCheapest = l.point.cheapest;
        const isHigher = l.point.price > basePrice;

        const clsList = ['cmp-tune-strip-item'];
        if (isCheapest) clsList.push('best');
        if (isBase) clsList.push('base');
        if (isHigher) clsList.push('warn');

        const star = isCheapest ? '★ ' : '';
        let pctHtml = '';
        if (isHigher) {
          const pct = Math.round(((l.point.price - basePrice) / basePrice) * 100);
          pctHtml = ` <span class="warn small">+${pct}%</span>`;
        }
        const baseBadge = isBase ? ' <span class="cmp-tune-cur">目前</span>' : '';

        const dateHtml = `<div class="cmp-tune-date">${esc(formatMD(l.date))}</div>`;
        const priceHtml = `<div class="cmp-tune-price"><b>${star}${money(l.point.price)}</b>${pctHtml}${baseBadge}</div>`;
        const labelHtml = `<div class="small muted">${esc(l.point.label)}</div>`;

        const u = safeUrl(tripcomUrl(l.point.segs, d.party, d.currency));
        const linkHtml = u ? `<div><a href="${esc(u)}" target="_blank" rel="noopener">訂</a></div>` : '';

        return `<div class="${clsList.join(' ')}">${dateHtml}${priceHtml}${labelHtml}${linkHtml}</div>`;
      }).join('');

      leg1Html = `<div class="cmp-tune-sec" style="margin-top: 8px;"><div class="small muted" style="margin-bottom: 4px;"><b>第 1 段（外站→台北）接駁日</b></div><div class="cmp-scroll"><div class="cmp-tune-strip">${stripItemsHtml}</div></div></div>`;
    }
  }

  return `<details class="cmp-tune">${summaryHtml}${gridNoteHtml}${gridTableHtml}${leg1Html}</details>`;
}

/**
 * 畫單一儲存格內容。
 *
 * @param {import('./offer.js').CompareCell | null} c
 * @param {import('./offer.js').CompareDest} d
 * @returns {string}
 */
function cellHtml(c, d) {
  if (!c) {
    return '<td class="cmp-cell muted">—</td>';
  }

  const cls = `cmp-cell${c.cheapest ? ' best' : ''}`;
  const star = c.cheapest ? '★ ' : '';
  const priceHtml = `<div class="cmp-price"><b>${star}${money(c.price)}</b></div>`;

  const basisLabel = c.basis === 'verified' ? 'Trip.com 驗證' : c.basis === 'quote' ? '細掃實查' : '日曆價・偏低';
  const basisCls = c.basis === 'calendar' ? 'small warn' : 'small';
  const basisHtml = `<div class="${basisCls}">${esc(basisLabel)}</div>`;

  const depMD = `${Number(c.depart.slice(5, 7))}/${Number(c.depart.slice(8, 10))}`;
  const retMD = `${Number(c.ret.slice(5, 7))}/${Number(c.ret.slice(8, 10))}`;
  const dateHtml = `<div class="small muted">${depMD}–${retMD}</div>`;

  const calHtml = c.basis !== 'calendar' ? `<div class="muted small">日曆 ${money(c.calendarTotal)}</div>` : '';

  // 精確連結（驗證頁、細掃那張票）優先；日曆價的格子用航段組，四段的第 1、4 段日期是推估。
  const link = c.link ?? (c.segs.length > 0
    ? { label: c.segs.length === 4 ? 'Trip.com（日期為估計）' : 'Trip.com', url: tripcomUrl(c.segs, d.party, d.currency) }
    : null);
  let linkHtml = '';
  if (link) {
    const validUrl = safeUrl(link.url);
    if (validUrl) {
      const text = link.label.length > 8 ? '訂票' : link.label;
      linkHtml = `<div><a href="${esc(validUrl)}" target="_blank" rel="noopener" title="${esc(link.label)}">${esc(text)}</a></div>`;
    }
  }

  return `<td class="${cls}">${priceHtml}${basisHtml}${dateHtml}${calHtml}${linkHtml}</td>`;
}

/**
 * 外站比價頁面 HTML。
 *
 * @param {import('./offer.js').Board} b
 * @param {{ manage?: boolean }} [opts]
 * @returns {string}
 */
export function compareHtml(b, opts = {}) {
  const intro = `<section class="board-section" id="sec-compare">
  <h2>🔀 外站比價</h2>
  <p class="muted small">同一個目的地，從不同外站出發、搭華航／長榮／星宇，七月初出發與八月底回來的最低整團價（2 大 2 小）。『日曆價』是 Matrix 日曆粗掃，實查常偏低約 5–45%，只拿來挑候選；有『Trip.com 驗證』或『細掃實查』的格子顯示實查價，以它為準。</p>`;

  if (!b.compare || b.compare.length === 0) {
    return `${intro}
  <p class="muted small">還沒有資料（每晚 23:30 的全排列掃描會填進來）</p>
</section>`;
  }

  const basisLabels = {
    verified: 'Trip.com 驗證',
    quote: '細掃實查',
    calendar: '日曆價・偏低',
  };

  const destsHtml = b.compare.map((d, idx) => {
    const openAttr = idx < 3 ? ' open' : '';
    const winShort = d.bestWindow === 'earlyJul' ? '七月初' : '八月底';
    const basisLabel = basisLabels[d.bestBasis] ?? d.bestBasis;
    const basisClass = d.bestBasis === 'calendar' ? 'warn' : d.bestBasis === 'verified' ? 'good' : '';
    const basisHtml = `<span class="pill ${basisClass}">${esc(basisLabel)}</span>`;

    const summaryHtml = `<summary><b>${esc(d.name)}</b> <span class="muted small">${esc(d.region)}</span> 最低 ${money(d.bestPrice)} ${basisHtml} ${esc(d.bestOrigin)} ${esc(d.bestCarrier)} ${winShort}</summary>`;

    const windowsHtml = d.windows.map((w) => {
      const rowsHtml = w.rows.map((r) => {
        const cellsHtml = r.cells.map((c) => cellHtml(c, d)).join('');
        const mainRow = `<tr><th>${esc(r.name)}</th>${cellsHtml}</tr>`;

        const tuneCells = r.cells.filter(/** @returns {c is import('./offer.js').CompareCell} */ (c) => Boolean(c && c.tune));
        if (tuneCells.length === 0) {
          return mainRow;
        }

        const detailsHtml = tuneCells.map((c) => tuneCellHtml(c, d)).join('');
        const tuneRow = `<tr class="cmp-tune-row"><td colspan="4">${detailsHtml}</td></tr>`;
        return `${mainRow}\n      ${tuneRow}`;
      }).join('');

      return `<h4>${esc(w.label)}</h4>
<div class="cmp-scroll">
  <table class="cmp">
    <thead>
      <tr><th>外站</th><th>華航</th><th>長榮</th><th>星宇</th></tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</div>`;
    }).join('');

    return `<details class="cmp-dest"${openAttr}>
  ${summaryHtml}
  ${windowsHtml}
</details>`;
  }).join('\n');

  return `${intro}
  ${destsHtml}
</section>`;
}
