'use strict';

const path = require('node:path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { loadState, upsertState } = require('../repo/state');
const { checkState } = require('../repo/check-state');

/* 自然语言解析复用前端 src/lib/todo.js，保证「明天 交周报 !」语义一致。
   该模块是 ESM，CJS 里用动态 import 引入。
   其模块级 TODAY 在首次 import 时定格：会话跨零点时「今天」会偏一天，
   桶与到期文案在这里用实时日期重算，解析结果属可接受偏差。 */
let libPromise = null;
function loadTodoLib() {
  if (!libPromise) {
    libPromise = import(path.resolve(__dirname, '../../../src/lib/todo.js'));
  }
  return libPromise;
}

/* 空库不塞随机种子：AI 写入要建立确定性的空白状态。 */
async function blankState() {
  const { DEFAULT_TITLES } = await loadTodoLib();
  return {
    items: [],
    sort: 'manual',
    nid: 1,
    deptList: [],
    empList: [],
    titles: { quad: { ...DEFAULT_TITLES.quad }, col: { ...DEFAULT_TITLES.col } },
  };
}

async function loadFullState() {
  const state = await loadState();
  return state || blankState();
}

/* 写库前过与 HTTP 路由同一套校验，错误文案直接回给 AI。 */
async function saveState(state) {
  const err = checkState(state);
  if (err) throw new Error('状态校验失败: ' + err);
  await upsertState(state);
}

function findItem(state, id) {
  const item = state.items.find(x => x.id === id);
  if (!item) throw new Error(`待办 ${id} 不存在`);
  return item;
}

function statusOfItem(item) {
  return item.status ?? (item.done ? 2 : 0);
}

/* 桶与到期文案用实时零点计算，不借用前端模块里定格的 TODAY。 */
function bucketOfItem(item, today, lib) {
  if (statusOfItem(item) === 2) return '已完成';
  if (!item.due) return '没排期';
  const d = lib.midnight(item.due);
  if (d < today) return '逾期';
  if (d === today) return '今天';
  if (d === today + lib.DAY) return '明天';
  return '以后';
}

function dueTextOf(item, today, lib) {
  if (!item.due) return '';
  const d = lib.midnight(item.due);
  const diff = Math.round((d - today) / lib.DAY);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff < 0) return `逾期 ${-diff} 天`;
  return lib.fmtDate(d);
}

function shapeItem(item, today, lib) {
  return {
    id: item.id,
    t: item.t,
    quad: item.quad || 4,
    status: statusOfItem(item),
    done: statusOfItem(item) === 2,
    due: item.due ? lib.fmtDate(lib.midnight(item.due)) : '',
    dueText: dueTextOf(item, today, lib),
    bucket: bucketOfItem(item, today, lib),
    tagList: item.tagList || (item.g ? [item.g] : []),
    deptId: item.deptId || 0,
    empId: item.empId || 0,
    note: item.note || '',
    pomo: item.pomo || 0,
  };
}

/* 显式日期统一走 yyyy-mm-dd，换算成与前端一致的上海零点时间戳。 */
function parseDueDate(str, lib) {
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('due 必须是 yyyy-mm-dd 格式: ' + str);
  const ts = lib.dayTs(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(ts)) throw new Error('due 不是合法日期: ' + str);
  return ts;
}

function findEmp(state, empId) {
  const emp = (state.empList || []).find(e => e.id === empId);
  if (!emp) throw new Error(`员工 ${empId} 不存在`);
  return emp;
}

function findDept(state, deptId) {
  const dept = (state.deptList || []).find(d => d.id === deptId);
  if (!dept) throw new Error(`部门 ${deptId} 不存在`);
  return dept;
}

function textOf(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/* 客户端可能一次性管道发来多个请求：工具全部串行执行，
   避免整状态读-改-写在并发下互相覆盖。 */
let queueTail = Promise.resolve();
function serial(handler) {
  return (args) => {
    const run = queueTail.then(() => handler(args));
    queueTail = run.then(() => {}, () => {});
    return run;
  };
}

function buildServer() {
  const server = new McpServer({ name: 'todo-day', version: '1.0.0' });

  server.registerTool('getListTodo', {
    description: '读取待办清单，可按状态、日期桶、关键字、象限、部门、员工过滤。',
    inputSchema: {
      status: z.number().int().min(0).max(2).optional().describe('0 待完成 / 1 进行中 / 2 已完成'),
      bucket: z.enum(['逾期', '今天', '明天', '以后', '没排期', '已完成']).optional(),
      tag: z.string().optional().describe('按关键字精确匹配'),
      kw: z.string().optional().describe('按标题模糊包含'),
      quad: z.number().int().min(1).max(4).optional(),
      deptId: z.number().int().optional(),
      empId: z.number().int().optional(),
      limit: z.number().int().min(1).max(1000).default(100),
    },
  }, serial(async (args) => {
    const lib = await loadTodoLib();
    const state = await loadFullState();
    const today = lib.midnight(Date.now());
    let itemList = state.items.slice();
    if (args.status !== undefined) itemList = itemList.filter(i => statusOfItem(i) === args.status);
    if (args.bucket) itemList = itemList.filter(i => bucketOfItem(i, today, lib) === args.bucket);
    if (args.tag) itemList = itemList.filter(i => (i.tagList || []).includes(args.tag));
    if (args.kw) itemList = itemList.filter(i => i.t.includes(args.kw));
    if (args.quad) itemList = itemList.filter(i => (i.quad || 4) === args.quad);
    if (args.deptId) itemList = itemList.filter(i => i.deptId === args.deptId);
    if (args.empId) itemList = itemList.filter(i => i.empId === args.empId);
    const total = itemList.length;
    itemList = itemList.slice(0, args.limit).map(i => shapeItem(i, today, lib));
    return textOf({ total, itemList });
  }));

  server.registerTool('addItemTodo', {
    description: '用自然语言新增待办，语义与网页录入一致：' +
      '支持 今天/明天/后天/下周、M月D日、重要/紧急（四象限）、# 关键字、进行中。' +
      '传 empId 时自动归属其部门并覆盖 deptId；只传 deptId 不指派员工。',
    inputSchema: {
      text: z.string().min(1).describe('自然语言待办文本，例如「明天 交周报 重要」'),
      due: z.string().optional().describe('显式日期 yyyy-mm-dd，覆盖解析出的日期'),
      quad: z.number().int().min(1).max(4).optional().describe('象限 1 重要且紧急 … 4 不重要不紧急'),
      tagList: z.array(z.string()).optional().describe('覆盖解析出的关键字'),
      deptId: z.number().int().optional(),
      empId: z.number().int().optional(),
      note: z.string().optional(),
    },
  }, serial(async (args) => {
    const lib = await loadTodoLib();
    const state = await loadFullState();
    if (state.items.length >= 5000) throw new Error('待办数量已达上限 5000');
    const parsed = lib.parseInput(args.text);
    if (!parsed.t) throw new Error('解析后标题为空，请检查 text');
    const item = {
      id: state.nid,
      t: parsed.t,
      due: args.due ? parseDueDate(args.due, lib) : parsed.due,
      quad: args.quad ?? parsed.q,
      status: parsed.st,
      done: false,
      tagList: args.tagList ?? parsed.tagList,
    };
    if (args.empId) {
      const emp = findEmp(state, args.empId);
      item.empId = emp.id;
      item.deptId = emp.deptId;
    } else if (args.deptId) {
      findDept(state, args.deptId);
      item.deptId = args.deptId;
    }
    if (args.note) item.note = args.note;
    state.nid += 1;
    state.items.unshift(item);
    await saveState(state);
    return textOf({ added: shapeItem(item, lib.midnight(Date.now()), lib) });
  }));

  server.registerTool('setStatusTodo', {
    description: '按 id 修改待办状态：0 待完成、1 进行中、2 已完成；完成时记录完成时间。',
    inputSchema: {
      id: z.number().int(),
      status: z.number().int().min(0).max(2),
    },
  }, serial(async (args) => {
    const lib = await loadTodoLib();
    const state = await loadFullState();
    const item = findItem(state, args.id);
    item.status = args.status;
    item.done = args.status === 2;
    item.at = args.status === 2 ? (item.at || Date.now()) : 0;
    await saveState(state);
    return textOf({ updated: shapeItem(item, lib.midnight(Date.now()), lib) });
  }));

  server.registerTool('patchItemTodo', {
    description: '按 id 修改标题、日期、象限、关键字、备注；未传字段保持不变；due 传空字符串清除日期。',
    inputSchema: {
      id: z.number().int(),
      t: z.string().min(1).optional(),
      due: z.string().optional().describe('yyyy-mm-dd，空字符串表示清除日期'),
      quad: z.number().int().min(1).max(4).optional(),
      tagList: z.array(z.string()).optional(),
      note: z.string().optional(),
    },
  }, serial(async (args) => {
    const lib = await loadTodoLib();
    const state = await loadFullState();
    const item = findItem(state, args.id);
    if (args.t !== undefined) item.t = args.t;
    if (args.due !== undefined) item.due = args.due === '' ? 0 : parseDueDate(args.due, lib);
    if (args.quad !== undefined) item.quad = args.quad;
    if (args.tagList !== undefined) item.tagList = args.tagList;
    if (args.note !== undefined) item.note = args.note;
    await saveState(state);
    return textOf({ updated: shapeItem(item, lib.midnight(Date.now()), lib) });
  }));

  server.registerTool('setAssignTodo', {
    description: '按 id 设置或清除指派：传 empId 自动归属其部门；只传 deptId 清除员工；都不传清除指派。',
    inputSchema: {
      id: z.number().int(),
      deptId: z.number().int().optional(),
      empId: z.number().int().optional(),
    },
  }, serial(async (args) => {
    const lib = await loadTodoLib();
    const state = await loadFullState();
    const item = findItem(state, args.id);
    if (args.empId) {
      const emp = findEmp(state, args.empId);
      item.empId = emp.id;
      item.deptId = emp.deptId;
    } else if (args.deptId) {
      findDept(state, args.deptId);
      item.deptId = args.deptId;
      delete item.empId;
    } else {
      delete item.deptId;
      delete item.empId;
    }
    await saveState(state);
    return textOf({ updated: shapeItem(item, lib.midnight(Date.now()), lib) });
  }));

  server.registerTool('removeItemTodo', {
    description: '按 id 删除待办，支持 idList 批量删除。',
    inputSchema: {
      idList: z.array(z.number().int()).min(1).max(500),
    },
  }, serial(async (args) => {
    const state = await loadFullState();
    const idSet = new Set(args.idList);
    const beforeCount = state.items.length;
    state.items = state.items.filter(i => !idSet.has(i.id));
    const removedCount = beforeCount - state.items.length;
    if (!removedCount) throw new Error(`没有匹配的待办 id: ${args.idList.join(', ')}`);
    await saveState(state);
    return textOf({ removedCount });
  }));

  server.registerTool('getListDept', {
    description: '读取部门列表。',
    inputSchema: {},
  }, serial(async () => {
    const state = await loadFullState();
    return textOf({ deptList: state.deptList || [] });
  }));

  server.registerTool('getListEmp', {
    description: '读取员工列表，含所属部门 id。',
    inputSchema: {},
  }, serial(async () => {
    const state = await loadFullState();
    return textOf({ empList: state.empList || [] });
  }));

  return server;
}

async function main() {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  /* stdio 传输独占 stdout，一切诊断只能走 stderr。 */
  console.error('[mcp] todo-day MCP server 已启动 (stdio)');
}

main().catch((e) => {
  console.error('[mcp] 启动失败:', e.message);
  process.exit(1);
});
