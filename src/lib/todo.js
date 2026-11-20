/* 纯逻辑：日期换算、输入解析、分桶。 */
import { DateTime } from 'luxon';

/* 全站时区锁死上海：浏览器和服务器设成别的时区，「今天/逾期」也不漂。
   业务时间戳一律表示上海 wall-clock 的绝对毫秒。上海 UTC+8、无夏令时。 */
const TZ = 'Asia/Shanghai';

export const DAY = 864e5;
export const midnight = ts => DateTime.fromMillis(+ts, { zone: TZ }).startOf('day').toMillis();
export const TODAY = midnight(Date.now());

/* 全站统一日期格式 yyyy-mm-dd，例如 2026-01-01。 */
export const fmtDate = ts => DateTime.fromMillis(+ts, { zone: TZ }).toFormat('yyyy-LL-dd');

/* 一天内的时刻 HH:mm：动态页等按完成时刻展示的场景用。 */
export const fmtTime = ts => DateTime.fromMillis(+ts, { zone: TZ }).toFormat('HH:mm');

/* 「M月D日 周x」：动态页按天分组的中文组头。 */
export const fmtDayCn = ts => {
  const d = DateTime.fromMillis(+ts, { zone: TZ });
  return d.toFormat('M月d日') + ' 周' + '日一二三四五六'[wdOf(d)];
};

/* 星期几：0=周日 … 6=周六，与原 getDay() 一致（Luxon 周一=1…周日=7）。 */
export const wdOf = ts => DateTime.fromMillis(+ts, { zone: TZ }).weekday % 7;

/* 上海日期分量 [年, 月(0基), 日]。 */
export const shYmd = ts => {
  const d = DateTime.fromMillis(+ts, { zone: TZ });
  return [d.year, d.month - 1, d.day];
};

/* 由年月日构造上海当天零点时间戳；非法日期（如 2 月 30 日）返回 NaN。 */
export const dayTs = (y, m, d) =>
  DateTime.fromObject({ year: y, month: m + 1, day: d }, { zone: TZ }).startOf('day').toMillis();


/* ── 四象限 ────────────────────────────────────────────────────────────────
   经典艾森豪威尔矩阵。quadrant 存在每条 item 上，清单和象限是同一份数据
   的两个视图。旧数据没有 quad 字段，一律按 4（不重要不紧急）兜底。 */
export const QUADS = [
  { k: 1, n: '重要且紧急' },
  { k: 2, n: '重要不紧急' },
  { k: 3, n: '紧急不重要' },
  { k: 4, n: '不重要不紧急' },
];
export const quadOf = i => i.quad || 4;

/* ── 输入解析 ──────────────────────────────────────────────────────────────
   一行字里就能带出日期、象限和多个 # 关键字。用户在手机上不会去点三个下拉菜单，
   打字是唯一真的会被用的录入方式。 */
export function parseInput(raw){
  let t = raw.trim();
  let due = 0, q = 4;
  /* 重要/紧急两个词自由组合：都有 → 1，只重要 → 2，只紧急 → 3，都没有 → 4。
     先探测「不重要 / 不紧急」再删除，否则「不紧急」里的「紧急」会被误算。 */
  const imp = !/不重要/.test(t) && /重要/.test(t);
  const urg = !/不紧急/.test(t) && /紧急/.test(t);
  if (imp && urg) q = 1; else if (imp) q = 2; else if (urg) q = 3;
  t = t.replace(/不重要|不紧急|重要|紧急/g, ' ');
  /* 进行中：一个词标记，录入即入「进行中」列 */
  const st = /进行中|doing/i.test(t) ? 1 : 0;
  t = t.replace(/进行中|doing/ig, ' ');
  const rules = [
    [/今天|today/i, () => TODAY],
    [/明天|tomorrow/i, () => TODAY + DAY],
    [/后天/, () => TODAY + DAY*2],
    [/下周/, () => TODAY + DAY*7],
    [/(\d{1,2})[\/月-](\d{1,2})[日号]?/, m => {
      const y = shYmd(Date.now())[0];
      const d = dayTs(y, +m[1]-1, +m[2]);
      return d < TODAY ? dayTs(y+1, +m[1]-1, +m[2]) : d;
    }],
  ];
  for (const [re, fn] of rules){
    const m = t.match(re);
    if (m){ due = fn(m); t = t.replace(m[0], ' '); break }
  }
  /* 所有 # 关键字都收集：一条 todo 可挂多个，聚合时各自计数。 */
  const tagList = [...new Set((t.match(/#\S+/g) || []).map(x => x.slice(1)))];
  t = t.replace(/#\S+/g, ' ');
  t = t.replace(/\s+/g,' ').trim();
  return { t, due, q, st, tagList: tagList.length ? tagList : ['生活'] };
}

/* 状态：0 待完成 / 1 进行中 / 2 已完成。旧数据没有 status 字段的，
   用 done 布尔兜底 —— true → 2，否则 → 0。 */
export const STATUSES = [
  { k: 0, n: '待完成' },
  { k: 1, n: '进行中' },
  { k: 2, n: '已完成' },
];
export const statusOf = i => i.status ?? (i.done ? 2 : 0);
export const cycleStatus = s => (s + 1) % 3;

/* 关键字列表：旧数据只有单值 g，读取时现场兜成数组，各视图不用各自判断。 */
export const tagListOf = i => i.tagList || (i.g ? [i.g] : []);


export function bucketOf(i){
  const s = statusOf(i);
  if (s === 2) return '已完成';
  if (!i.due) return '没排期';
  const d = midnight(i.due);
  if (d < TODAY) return '逾期';
  if (d === TODAY) return '今天';
  if (d === TODAY + DAY) return '明天';
  return '以后';
}
export const ORDER = ['逾期','今天','明天','以后','没排期','已完成'];

export function dueText(i){
  if (!i.due) return '';
  const d = midnight(i.due), diff = Math.round((d - TODAY)/DAY);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff < 0) return `逾期 ${-diff} 天`;
  return fmtDate(d);
}

export const SORTS = { manual:'手动', due:'按日期', group:'按关键字' };
export const WD = ['一','二','三','四','五','六','日'];

export function visible(items, filter, sort){
  let v = items.slice();
  if (filter === 'today') v = v.filter(i => i.due && midnight(i.due) <= TODAY);
  if (filter === 'open') v = v.filter(i => statusOf(i) !== 2);
  if (filter === 'doing') v = v.filter(i => statusOf(i) === 1);
  if (filter === 'done') v = v.filter(i => statusOf(i) === 2);
  if (sort === 'due') v.sort((a,b) => (a.due||9e15) - (b.due||9e15));
  if (sort === 'group') v.sort((a,b) => (tagListOf(a)[0] || '').localeCompare(tagListOf(b)[0] || '','zh'));
  return v;
}

export function loadOn(items, ts){
  const on = items.filter(i => i.due && midnight(i.due) === ts);
  return {
    late: on.filter(i => !i.done && ts < TODAY).length,
    open: on.filter(i => !i.done && ts >= TODAY).length,
    did:  on.filter(i => i.done).length
  };
}

export const DEFAULT_TITLES = {
  quad: { 1: '重要且紧急', 2: '重要不紧急', 3: '紧急不重要', 4: '不重要不紧急' },
  col:  { 0: '待完成', 1: '进行中', 2: '已完成' },
};

/* 空初始状态：不再预置示例数据，首次打开就是一份空清单。 */
export function emptyState(){
  return { items: [], sort: 'manual', nid: 1, deptList: [], empList: [],
    titles: { quad: { ...DEFAULT_TITLES.quad }, col: { ...DEFAULT_TITLES.col } } };
}
