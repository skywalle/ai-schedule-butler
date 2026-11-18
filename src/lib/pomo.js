/* 番茄钟纯逻辑：时长常量、番茄数读取、会话工厂。
   会话对象随整状态同步：计时本身在前端跑，落库的只是一个截止时刻。 */

/** @typedef {import('./types').PomoRun} PomoRun */

export const FOCUS_MIN = 25;
export const BREAK_MIN = 5;
export const LONG_BREAK_MIN = 15;
export const CYCLE_N = 4;

/* 旧数据没有 pomo 字段：一律按 0 个番茄兜底。 */
export const getPomoCount = i => i.pomo || 0;

/* 已完成 cycle 个专注后的休息时长：每逢整周期来一次长休。 */
export function getBreakMin(cycle) {
  return cycle > 0 && cycle % CYCLE_N === 0 ? LONG_BREAK_MIN : BREAK_MIN;
}

/** 新链条的专注回合：换任务即换链条，cycle 归零。
 * @param {number} itemId
 * @param {number} [cycle]
 * @returns {PomoRun} */
export function makeFocusRun(itemId, cycle = 0) {
  const ms = FOCUS_MIN * 60e3;
  return { itemId, kind: 'focus', endAt: Date.now() + ms, leftMs: ms, cycle, paused: false };
}

/** 休息结束接着同一任务的下一回合专注：cycle 沿用以保持长休节奏。
 * @param {PomoRun} run
 * @returns {PomoRun} */
export function nextFocusRun(run) {
  return makeFocusRun(run.itemId, run.cycle);
}

/** 专注自然结束：番茄 +1 由调用方落库，这里只换算休息回合。
 * @param {PomoRun} run
 * @returns {PomoRun} */
export function makeBreakRun(run) {
  const cycle = run.cycle + 1;
  const ms = getBreakMin(cycle) * 60e3;
  return { ...run, kind: 'break', cycle, endAt: Date.now() + ms, leftMs: ms, paused: false };
}

/* 刷新/跨端恢复：非暂停会话按 endAt 重算剩余；过期归零交给界面收尾。
   暂停会话的 leftMs 是定格值，原样保留。
   @param {PomoRun | undefined} run
   @returns {PomoRun | undefined} */
export const reviveRun = run =>
  run && !run.paused ? { ...run, leftMs: Math.max(0, run.endAt - Date.now()) } : run;
