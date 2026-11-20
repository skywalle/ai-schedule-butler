#!/usr/bin/env node
/* 一次性导入：把 Super Productivity 的 JSON 备份转成站内整状态，PUT 到服务端。
   用法：node scripts/import-super-productivity.mjs <备份.json> [--dry]
   --dry 只打印统计不写入。只导入当前收件箱任务；归档不进。 */
'use strict';

import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';

const TZ = 'Asia/Shanghai';
const POMO_MS = 1500000; // 备份里番茄配置就是 25 分钟，与站内一致

const [path, ...flagList] = process.argv.slice(2);
const isDry = flagList.includes('--dry');
if (!path) {
  console.error('用法：node scripts/import-super-productivity.mjs <备份.json> [--dry]');
  process.exit(1);
}

let backup;
try {
  backup = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error('备份读取失败：' + e.message);
  process.exit(1);
}
const data = backup && backup.data;
const entityMap = (data && data.task && data.task.entities) || {};
const inbox = data && data.project && data.project.entities && data.project.entities.INBOX_PROJECT;
if (!data || !Object.keys(entityMap).length) {
  console.error('备份结构不对：缺少 data.task.entities');
  process.exit(1);
}

/* 顺序以收件箱 taskIds 为准，没被引用的实体按创建时间排在末尾。 */
const orderList = [...((inbox && inbox.taskIds) || [])];
const tailList = Object.keys(entityMap)
  .filter(id => !orderList.includes(id))
  .sort((a, b) => (entityMap[a].created || 0) - (entityMap[b].created || 0));
orderList.push(...tailList);

const toDue = dueDay => {
  if (!dueDay || typeof dueDay !== 'string') return 0;
  const ts = DateTime.fromISO(dueDay, { zone: TZ }).startOf('day').toMillis();
  return Number.isNaN(ts) ? 0 : ts;
};

/* 标题前缀即用户自己的分组约定：「洛克-xxx」→ 洛克，「【九回】xxx」→ 九回。 */
const keywordOf = raw => {
  let t = raw.trim();
  const b = t.match(/^【(.+?)】/);
  if (b) t = b[1] + '-' + t.slice(b[0].length);
  const m = t.match(/^(.{1,12}?)[-－—]/);
  if (!m) return '';
  const kw = m[1].trim();
  return kw && kw.length <= 8 && !/[\s]/.test(kw) ? kw : '';
};

/* 子任务折进父任务备注，清单保持一层。 */
const noteOf = task => {
  const lineList = [];
  if (task.notes && task.notes.trim()) lineList.push(task.notes.trim());
  for (const sid of task.subTaskIds || []) {
    const sub = entityMap[sid];
    if (!sub) continue;
    let line = '· ' + (sub.title || '(无标题)').trim() + (sub.isDone ? '（已完成）' : '');
    if (sub.notes && sub.notes.trim()) line += '：' + sub.notes.trim().replace(/\s*\n\s*/g, '；');
    lineList.push(line);
  }
  return lineList.join('\n');
};

const quadOf = tagIds => {
  const imp = tagIds.includes('EM_IMPORTANT');
  const urg = tagIds.includes('EM_URGENT');
  if (imp && urg) return 1;
  if (imp) return 2;
  if (urg) return 3;
  return 0; // 0 = 不写 quad 字段，应用侧按 4 兜底
};

const itemList = [];
const kwMap = new Map();
const quadMap = new Map();
let skipped = 0, withNote = 0, withPomo = 0;
let nid = 1;

for (const id of orderList) {
  const task = entityMap[id];
  if (!task) continue;
  const title = (task.title || '').trim();
  if (!title) { skipped++; continue; }
  const tagIds = task.tagIds || [];
  const done = !!task.isDone;
  const kw = keywordOf(title);
  if (kw) kwMap.set(kw, (kwMap.get(kw) || 0) + 1);
  const quad = quadOf(tagIds);
  if (quad) quadMap.set(quad, (quadMap.get(quad) || 0) + 1);

  const item = {
    id: nid++, t: title, due: toDue(task.dueDay),
    tagList: kw ? [kw] : [],
    status: done ? 2 : (tagIds.includes('KANBAN_IN_PROGRESS') ? 1 : 0),
    done,
  };
  if (quad) item.quad = quad;
  if (done && task.doneOn) item.at = task.doneOn;
  const note = noteOf(task);
  if (note) { item.note = note; withNote++; }
  const pomo = task.timeSpent > 0 ? Math.round(task.timeSpent / POMO_MS) : 0;
  if (pomo >= 1) { item.pomo = pomo; withPomo++; }
  itemList.push(item);
}

const state = {
  items: itemList, sort: 'manual', nid,
  deptList: [], empList: [],
  titles: {
    quad: { 1: '重要且紧急', 2: '重要不紧急', 3: '紧急不重要', 4: '不重要不紧急' },
    col: { 0: '待完成', 1: '进行中', 2: '已完成' },
  },
};

const todayMs = DateTime.now().setZone(TZ).startOf('day').toMillis();
const doneCount = itemList.filter(i => i.done).length;
const doingCount = itemList.filter(i => !i.done && i.status === 1).length;
const lateCount = itemList.filter(i => !i.done && i.due && i.due < todayMs).length;
const QUAD_NAME = { 1: '重要且紧急', 2: '重要不紧急', 3: '紧急不重要' };

console.log('待办 ' + itemList.length + ' 条：已完成 ' + doneCount + '，进行中 ' + doingCount +
  '，待完成 ' + (itemList.length - doneCount - doingCount) + '，其中逾期 ' + lateCount);
console.log('跳过空标题 ' + skipped + ' 条；带备注 ' + withNote + ' 条；带番茄 ' + withPomo + ' 条');
console.log('关键字 ' + kwMap.size + ' 个：' +
  [...kwMap.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join('，'));
console.log('象限：' +
  [...quadMap.entries()].sort((a, b) => a[0] - b[0]).map(([q, n]) => QUAD_NAME[q] + ' ' + n).join('，') +
  '，未标 ' + (itemList.length - [...quadMap.values()].reduce((s, n) => s + n, 0)) + ' 条（按不重要不紧急兜底）');

if (isDry) {
  console.log('--dry：未写入');
  process.exit(0);
}

const ORIGIN = process.env.IMPORT_ORIGIN || 'http://127.0.0.1:8787';
try {
  const res = await fetch(ORIGIN + '/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) {
    console.error('写入失败：HTTP ' + res.status + ' ' + await res.text());
    process.exit(1);
  }
  console.log('已写入 ' + ORIGIN + '（' + itemList.length + ' 条），刷新页面即可看到');
} catch (e) {
  console.error('写入失败：' + e.message);
  process.exit(1);
}
