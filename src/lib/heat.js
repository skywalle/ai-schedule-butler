/* 完成热力格的数据。
 *
 * 左边那本月历回答的是「前面还堆着多少」，这块格子回答的是反方向的那个问题：
 * 「过去这些天，我到底做掉了多少」。每一天都只从真实清单里数：勾掉的事
 * 带完成时间，落在窗口内的就计入当天。今天那一格永远实时：勾掉一件，
 * 最后一格立刻变深。
 */
import { DAY, TODAY, midnight, wdOf } from './todo.js';

export const WEEKS = 18;

/* 从 18 周前的那个周一起算。周一开头是为了和月历对齐 —— 同一份数据的两个视图，
   起点不一样的话，眼睛得在两个坐标系之间换算。 */
const MON = (wdOf(TODAY) + 6) % 7;
export const DAYS = Array.from({ length: WEEKS * 7 },
  (_, k) => midnight(TODAY - (MON + (WEEKS - 1) * 7) * DAY + k * DAY));

/* 每天的天数只从真实清单里数：勾掉一件，那一格立刻变深。 */
export function counts(items) {
  const c = /** @type {Record<number, number>} */ ({});
  items.forEach(i => {
    if (!i.done || !i.at) return;
    const d = midnight(i.at);
    if (d >= DAYS[0] && d <= TODAY) c[d] = (c[d] || 0) + 1;
  });
  return c;
}

export const level = n => (!n ? 0 : n < 3 ? 1 : n < 5 ? 2 : n < 8 ? 3 : 4);

/* 当前连续有进展的天数。今天还没勾不算断 —— 一天刚开始就把纪录清零太伤人。 */
export function streak(c) {
  let n = 0;
  for (let k = DAYS.length - 1; k >= 0; k--) {
    const ts = DAYS[k];
    if (ts > TODAY) continue;
    if (c[ts] > 0) n++;
    else if (ts !== TODAY) break;
  }
  return n;
}

/* 窗口内最长的一段连续。和当前连续放在一起才有参照：光看「连续 2 天」不知道
   2 天是多是少，旁边写着「最长 9 天」就知道了。 */
export function best(c) {
  let n = 0, m = 0;
  for (const ts of DAYS) {
    if (ts > TODAY) break;
    n = c[ts] > 0 ? n + 1 : 0;
    if (n > m) m = n;
  }
  return m;
}

/* 最近 n 天完成多少件（含今天）。 */
export function recent(c, n) {
  let s = 0;
  for (let k = 0; k < n; k++) s += c[midnight(TODAY - k * DAY)] || 0;
  return s;
}
