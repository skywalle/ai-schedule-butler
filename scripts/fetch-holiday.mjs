#!/usr/bin/env node
/* 每年跑一次：从 jsdelivr 拉取 holiday-cn 的最新放假安排，
   合并进 src/lib/holiday-data.json。网站本身离线可用，只有更新数据需要网络。 */
'use strict';

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'src', 'lib', 'holiday-data.json');
const FROM_YEAR = 2024;   // 早于该项目使用的年份，留点余量
/* 国内网络环境对 jsdelivr 和 GitHub raw 的连通性不一致，逐个尝试 */
const MIRRORS = [
  y => `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${y}.json`,
  y => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
  y => `https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
  y => `https://gcore.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
];
async function fetchYear(y) {
  let lastErr = null;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url(y));
      if (res.ok) return await res.json();
      lastErr = new Error('HTTP ' + res.status);
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('所有镜像都失败');
}

/* 读取现有数据，拉不到网络时也能保住已有年份 */
let existing = [];
try { existing = JSON.parse(readFileSync(TARGET, 'utf8')) } catch { /* 首次运行没有文件 */ }

const byYear = new Map(existing.map(y => [y.year, y]));
const nowYear = new Date().getFullYear();
const fetched = [];
const missed = [];

for (let y = FROM_YEAR; y <= nowYear + 2; y++) {
  try {
    const json = await fetchYear(y);
    if (!Array.isArray(json.days)) throw new Error('days 字段不是数组');
    byYear.set(json.year ?? y, { year: json.year ?? y, days: json.days });
    fetched.push(json.year ?? y);
  } catch (e) {
    missed.push(y + '（' + e.message + '）');
  }
}

if (!byYear.size) {
  console.error('没有拿到任何年份的放假数据，且本地没有旧数据可保留：\n  ' + missed.join('\n  '));
  process.exit(1);
}

const list = [...byYear.values()].sort((a, b) => a.year - b.year);
const tmp = TARGET + '.tmp';
writeFileSync(tmp, JSON.stringify(list, null, 1) + '\n');
renameSync(tmp, TARGET);
console.log('已写入 ' + list.map(y => y.year).join('、'));
if (fetched.length) console.log('本次更新：' + fetched.join('、'));
if (missed.length) console.log('未获取（跳过）：' + missed.join('、'));
