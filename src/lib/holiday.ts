/* 节假日与调休查询：数据来自国务院放假安排（内置 holiday-cn 整理结果），
   模块加载时按 yyyy-LL-dd 建索引，日历每格渲染只做一次 Map 查找。 */
import data from './holiday-data.json'
import { fmtDate } from './todo.js'

export type HolidayInfo = { name: string; off: boolean }

const infoMap = new Map<string, HolidayInfo>()
for (const year of data) {
  for (const day of year.days) infoMap.set(day.date, { name: day.name, off: day.isOffDay })
}

/* 当天在放假安排里的记录；off 为 true 是放假日，false 是调休上班日。
   数据没有覆盖的年份返回 null，调用方照常渲染普通格子。 */
export function getInfoHoliday(ts: number): HolidayInfo | null {
  return infoMap.get(fmtDate(ts)) ?? null
}
