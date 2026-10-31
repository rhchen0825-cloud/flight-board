// @ts-check
/**
 * 畫面上的數字與時間。
 *
 * 時間一律是台北時間：追蹤的資料與每天 07:30 的排程都以台北為準，人在國外看也一樣。
 */

const TZ = 'Asia/Taipei';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 千分位、不帶小數。 @param {number} n */
export function money(n) {
  return Math.round(n).toLocaleString('en-US');
}

/** 差額：正數帶加號、負數用減號（−，不是連字號）、零是 ±0。 @param {number} n */
export function signed(n) {
  if (Math.round(n) > 0) return `+${money(n)}`;
  if (Math.round(n) < 0) return `−${money(-n)}`;
  return '±0';
}

/** 台北時間的年月日與 HH:MM。 @param {number} ts */
function taipei(ts) {
  /** @type {Record<string, string>} */
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(ts)) p[x.type] = x.value;
  return { y: Number(p['year']), m: Number(p['month']), d: Number(p['day']), hm: `${p['hour'] === '24' ? '00' : p['hour']}:${p['minute']}` };
}

/** @param {{ y: number, m: number, d: number }} a @param {{ y: number, m: number, d: number }} b */
function sameDay(a, b) {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

/** 多久以前：剛剛、5 分鐘前、3 小時前、昨天 07:30、9/28 07:30。 @param {number} ts @param {number} now */
export function ago(ts, now) {
  const diff = now - ts;
  if (diff < 60_000) return '剛剛';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分鐘前`;
  const t = taipei(ts);
  if (sameDay(t, taipei(now))) return `${Math.floor(diff / 3_600_000)} 小時前`;
  if (sameDay(t, taipei(now - 86_400_000))) return `昨天 ${t.hm}`;
  return `${t.m}/${t.d} ${t.hm}`;
}

/** 台北時間的 10/4 10:54：要講「是什麼時候的」，不是「多久以前」。 @param {number} ts */
export function stamp(ts) {
  const t = taipei(ts);
  return `${t.m}/${t.d} ${t.hm}`;
}

/** 台北時間的 HH:MM。 @param {number} ts */
export function clock(ts) {
  return taipei(ts).hm;
}

/** 這個時刻是台北的哪一天（YYYY-MM-DD）。伺服器的走勢也是照台北切天的。 @param {number} ts */
export function taipeiDay(ts) {
  const t = taipei(ts);
  return `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
}

/** 日曆日期 → 4/2（五）。日期本身沒有時區，直接用 UTC 算星期。 @param {string} iso */
export function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
  return `${m}/${d}（${WEEKDAYS[dow]}）`;
}

/** 頁面抓來的文字（城市名、航司、錯誤訊息）一律先過這裡再放進 HTML。 @param {unknown} s */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'));
}
