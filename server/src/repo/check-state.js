'use strict';

/* 整状态校验：HTTP 路由与 MCP 工具共用，写库前必须过同一套规则。 */
function checkState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return 'state 缺失或不是对象';
  }
  if (!Array.isArray(state.items)) return 'state.items 必须是数组';
  if (state.items.length > 5000) return 'state.items 超出上限 5000';

  /* 部门/员工可缺省（旧数据没有）：先建 id 集合，再校验 items 的引用。 */
  const deptIds = new Set();
  const empIds = new Set();
  const err = checkDeptList(state.deptList, deptIds) || checkEmpList(state.empList, deptIds, empIds);
  if (err) return err;

  for (let i = 0; i < state.items.length; i++) {
    const it = state.items[i];
    if (!it || typeof it !== 'object') return `state.items[${i}] 不是对象`;
    if (typeof it.t !== 'string' || !it.t.trim()) return `state.items[${i}].t 为空`;
    if (!Number.isSafeInteger(it.id)) return `state.items[${i}].id 不是安全整数`;
    if (it.deptId !== undefined && !deptIds.has(it.deptId)) {
      return `state.items[${i}].deptId 指向不存在的部门`;
    }
    if (it.empId !== undefined && !empIds.has(it.empId)) {
      return `state.items[${i}].empId 指向不存在的员工`;
    }
    if (it.execEmpId !== undefined && !empIds.has(it.execEmpId)) {
      return `state.items[${i}].execEmpId 指向不存在的员工`;
    }
    if (it.subEmpId !== undefined && !empIds.has(it.subEmpId)) {
      return `state.items[${i}].subEmpId 指向不存在的员工`;
    }
  }
  /* 番茄钟会话可缺省；存在时必须是挂在有效待办上的形状合法对象。 */
  if (state.pomoRun !== undefined) {
    const r = state.pomoRun;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return 'state.pomoRun 不是对象';
    if (!state.items.some(it => it.id === r.itemId)) {
      return 'state.pomoRun.itemId 指向不存在的待办';
    }
    if (r.kind !== 'focus' && r.kind !== 'break') return 'state.pomoRun.kind 必须是 focus 或 break';
    if (!Number.isFinite(r.endAt) || !Number.isFinite(r.leftMs)) {
      return 'state.pomoRun.endAt/leftMs 必须是数字';
    }
    if (!Number.isSafeInteger(r.cycle) || r.cycle < 0) return 'state.pomoRun.cycle 必须是非负整数';
    if (typeof r.paused !== 'boolean') return 'state.pomoRun.paused 必须是布尔值';
  }
  return null;
}

function checkDeptList(deptList, deptIds) {
  if (deptList === undefined) return null;
  if (!Array.isArray(deptList)) return 'state.deptList 必须是数组';
  if (deptList.length > 500) return 'state.deptList 超出上限 500';
  for (let i = 0; i < deptList.length; i++) {
    const d = deptList[i];
    if (!d || typeof d !== 'object') return `state.deptList[${i}] 不是对象`;
    if (typeof d.n !== 'string' || !d.n.trim()) return `state.deptList[${i}].n 为空`;
    if (!Number.isSafeInteger(d.id)) return `state.deptList[${i}].id 不是安全整数`;
    if (deptIds.has(d.id)) return `state.deptList[${i}].id 重复`;
    deptIds.add(d.id);
  }
  return null;
}

function checkEmpList(empList, deptIds, empIds) {
  if (empList === undefined) return null;
  if (!Array.isArray(empList)) return 'state.empList 必须是数组';
  if (empList.length > 2000) return 'state.empList 超出上限 2000';
  for (let i = 0; i < empList.length; i++) {
    const e = empList[i];
    if (!e || typeof e !== 'object') return `state.empList[${i}] 不是对象`;
    if (typeof e.n !== 'string' || !e.n.trim()) return `state.empList[${i}].n 为空`;
    if (!Number.isSafeInteger(e.id)) return `state.empList[${i}].id 不是安全整数`;
    if (!deptIds.has(e.deptId)) return `state.empList[${i}].deptId 指向不存在的部门`;
    if (empIds.has(e.id)) return `state.empList[${i}].id 重复`;
    empIds.add(e.id);
  }
  return null;
}

module.exports = { checkState };
