/* 纯逻辑：日期换算、输入解析、分桶。 */

export const DAY = 864e5;
export const midnight = d => { const x = new Date(d); x.setHours(0,0,0,0); return +x };
export const TODAY = midnight(Date.now());

/* 全站统一日期格式 yyyy-mm-dd，例如 2026-01-01。 */
export const fmtDate = ts => {
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};


/* ── 四象限 ────────────────────────────────────────────────────────────────
   经典艾森豪威尔矩阵。quadrant 存在每条 item 上，清单和看板是同一份数据
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
      const y = new Date().getFullYear();
      const d = midnight(new Date(y, +m[1]-1, +m[2]));
      return d < TODAY ? midnight(new Date(y+1, +m[1]-1, +m[2])) : d;
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

export function seed(){
  const H = 3600e3;
  const rnd = (a, b) => Math.floor(Math.random()*(b-a+1))+a;
  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
  const D = DAY;

  /* 四个关键字，每个关键字一批贴近真实迭代的任务模板。
     status 0 待完成 / 1 进行中 / 2 已完成。 */
  const POOL = {
    '产品': [
      { t:'撰写 v2.1 版本需求文档', q:1, w:3 }, { t:'评审用户反馈周报', q:3, w:3 },
      { t:'梳理新用户激活漏斗', q:2, w:2 }, { t:'竞品功能对比分析', q:2, w:3 },
      { t:'更新产品路线图', q:1, w:2 }, { t:'确认下周迭代范围', q:3, w:3 },
      { t:'输出 A/B 测试结论', q:1, w:2 }, { t:'回访 3 个流失用户', q:2, w:2 },
      { t:'补充数据看板指标', q:4, w:2 }, { t:'整理埋点需求清单', q:2, w:2 },
      { t:'修订 PRD 审批流', q:1, w:2 }, { t:'组织需求优先级打分', q:3, w:2 },
      { t:'跟法务确认合规文案', q:3, w:1 }, { t:'绘制用户旅程地图', q:2, w:2 },
      { t:'准备季度 OKR 初稿', q:2, w:2 }, { t:'拆解会员体系需求', q:2, w:2 },
      { t:'核算上季度功能 ROI', q:4, w:1 }, { t:'输出改版验收清单', q:3, w:2 },
      { t:'同步客服侧 FAQ 更新', q:4, w:1 }, { t:'定义灰度发布策略', q:1, w:2 },
      { t:'评审试用版申请表单', q:3, w:1 }, { t:'检查各端文案一致性', q:4, w:1 },
      { t:'合并重复的用户画像', q:2, w:1 }, { t:'复盘上一迭代延期项', q:1, w:2 },
      { t:'确认推送频控规则', q:3, w:1 }, { t:'列出新功能培训要点', q:4, w:1 },
    ],
    '设计': [
      { t:'绘制首页新版头图', q:1, w:2 }, { t:'完成注册流程重设计', q:1, w:3 },
      { t:'输出设计规范 2.0', q:2, w:2 }, { t:'制作空状态插画', q:4, w:2 },
      { t:'走查深色模式适配', q:2, w:3 }, { t:'改版设置页信息架构', q:2, w:2 },
      { t:'补充加载动效', q:4, w:1 }, { t:'统一图标库描边粗细', q:4, w:2 },
      { t:'设计会员中心页面', q:2, w:2 }, { t:'出移动端手势引导图', q:3, w:2 },
      { t:'整理组件库命名', q:2, w:1 }, { t:'高保真还原审批流', q:1, w:2 },
      { t:'检查表单错误提示', q:3, w:2 }, { t:'设计分享海报模板', q:4, w:1 },
      { t:'优化搜索结果页布局', q:2, w:2 }, { t:'绘制新手引导气泡', q:3, w:1 },
      { t:'评审品牌色应用', q:2, w:1 }, { t:'补齐图表配色方案', q:4, w:1 },
      { t:'输出切图标注包', q:3, w:2 }, { t:'验证按钮禁用态对比度', q:3, w:1 },
      { t:'整理历史稿件归档', q:4, w:1 }, { t:'设计空数据页插画', q:4, w:1 },
      { t:'重排通知中心层级', q:2, w:2 }, { t:'标注弹层交互动效', q:3, w:1 },
      { t:'核对字体回退方案', q:4, w:1 }, { t:'制作大屏适配稿', q:2, w:1 },
    ],
    '开发': [
      { t:'修复登录态偶发丢失', q:1, w:3 }, { t:'实现列表虚拟滚动', q:1, w:2 },
      { t:'接口加缓存与降级', q:2, w:3 }, { t:'拆分结算页代码包', q:2, w:2 },
      { t:'升级构建脚本', q:3, w:1 }, { t:'修复时区换算错误', q:1, w:2 },
      { t:'接入新支付渠道', q:1, w:2 }, { t:'补单元测试覆盖率', q:2, w:3 },
      { t:'优化首屏加载', q:2, w:3 }, { t:'迁移旧版埋点', q:3, w:2 },
      { t:'重写文件上传组件', q:2, w:2 }, { t:'排查内存泄漏', q:1, w:2 },
      { t:'补充 E2E 用例', q:3, w:2 }, { t:'灰度开关接入', q:3, w:2 },
      { t:'清理废弃接口', q:4, w:2 }, { t:'跑全量回归', q:1, w:2 },
      { t:'修复安卓键盘遮挡', q:3, w:2 }, { t:'配置错误告警', q:2, w:1 },
      { t:'文档化部署流程', q:4, w:1 }, { t:'压缩静态资源', q:4, w:1 },
      { t:'迁移图标为 SVG sprite', q:4, w:1 }, { t:'整理环境变量', q:3, w:1 },
      { t:'联调数据导出接口', q:2, w:2 }, { t:'升级依赖安全补丁', q:2, w:2 },
      { t:'抽象权限判断逻辑', q:2, w:2 }, { t:'实现离线缓存', q:3, w:1 },
    ],
    '测试': [
      { t:'编写结算链路用例', q:1, w:3 }, { t:'回归历史缺陷', q:2, w:3 },
      { t:'压测下单接口', q:1, w:2 }, { t:'验证权限边界', q:2, w:2 },
      { t:'检查多语言文案', q:4, w:2 }, { t:'跑兼容性矩阵', q:3, w:2 },
      { t:'复测支付回调', q:1, w:2 }, { t:'验证数据导出正确性', q:2, w:2 },
      { t:'整理自动化报告', q:4, w:1 }, { t:'新功能验收走查', q:3, w:3 },
      { t:'构造异常场景用例', q:2, w:2 }, { t:'统计线上缺陷分布', q:4, w:1 },
      { t:'跟开发对齐修复口径', q:3, w:2 }, { t:'验证空态与加载态', q:4, w:1 },
      { t:'补埋点验收用例', q:2, w:2 }, { t:'回归移动端手势', q:3, w:1 },
      { t:'核对告警触发', q:2, w:1 }, { t:'预发布环境巡检', q:1, w:2 },
      { t:'验证下载文件完整性', q:2, w:1 }, { t:'清理测试脏数据', q:4, w:1 },
      { t:'检查分页边界', q:2, w:2 }, { t:'验证导入模板校验', q:3, w:1 },
      { t:'跑弱网场景', q:2, w:1 }, { t:'验收通知触达', q:3, w:2 },
      { t:'汇总本周缺陷 Top5', q:2, w:1 }, { t:'验证账号注销流程', q:1, w:1 },
    ],
  };

  const GROUPS = Object.keys(POOL);
  const items = [];
  let id = 1;
  const used = new Set();

  /* 部门与员工主数据：任务按概率指派给员工或只挂部门。 */
  const deptList = [
    { id: 101, n: '产品部' },
    { id: 102, n: '技术部' },
    { id: 103, n: '设计部' },
  ];
  const empList = [
    { id: 111, n: '林晓', deptId: 101 },
    { id: 112, n: '陈默', deptId: 101 },
    { id: 113, n: '王一帆', deptId: 102 },
    { id: 114, n: '赵磊', deptId: 102 },
    { id: 115, n: '苏晴', deptId: 103 },
    { id: 116, n: '周远', deptId: 103 },
  ];

  for (const g of GROUPS) {
    /* 每组按模板权重抽 ~25 条，全池凑满 100。 */
    const pool = POOL[g];
    const n = 25;
    for (let k = 0; k < n; k++) {
      /* 权重抽取，去重 */
      let tpl = pick(pool), guard = 0;
      while (used.has(tpl.t) && guard++ < 50) tpl = pick(pool);
      used.add(tpl.t);

      /* 状态分布：进行中 25%，其余按日期决定。 */
      const roll = Math.random();
      let status = roll < 0.25 ? 1 : 0;
      let due = 0;
      if (tpl.q === 1) {
        due = Math.random() < 0.55 ? TODAY + rnd(0, 2) * D : TODAY - rnd(1, 5) * D;
      } else if (tpl.q === 2 || tpl.q === 3) {
        due = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? TODAY + rnd(0, 7) * D : TODAY - rnd(1, 10) * D);
      } else {
        due = Math.random() < 0.4 ? 0 : TODAY + rnd(0, 21) * D;
      }
      /* 有日期且落在过去 → 多数已完成 */
      if (due && due < TODAY && Math.random() < 0.72) status = 2;
      /* 象限 1 且今天到期 → 仍多为未完成，制造真实压力 */
      if (status === 2 && due && midnight(due) === TODAY && tpl.q === 1 && Math.random() < 0.5) status = 0;
      const done = status === 2;
      /* 完成时间：落在到期日当天或次日，别超前。 */
      const at = done && due ? due + rnd(9, 20) * H : done ? TODAY - rnd(0, 6) * D + rnd(9, 20) * H : 0;

      /* 约七成任务有指派：一半给员工（部门随员工），一半只挂部门。 */
      let deptId = 0, empId = 0;
      if (Math.random() < 0.7) {
        if (Math.random() < 0.5) {
          const emp = pick(empList);
          empId = emp.id;
          deptId = emp.deptId;
        } else {
          deptId = pick(deptList).id;
        }
      }

      items.push({ id: id++, t: tpl.t, due, tagList: [g], quad: tpl.q, status, done,
        ...(deptId ? { deptId } : {}), ...(empId ? { empId } : {}), ...(at ? { at } : {}) });
    }
  }

  return { items, sort: 'manual', nid: id, deptList, empList,
    titles: { quad: { ...DEFAULT_TITLES.quad }, col: { ...DEFAULT_TITLES.col } } };
}
