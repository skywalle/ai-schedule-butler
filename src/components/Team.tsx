import { useState } from 'react'
import Kit from '../lib/kit.js'
import Tool from '../lib/tool.js'
import { statusOf } from '../lib/todo.js'
import { gcolor } from './Sidebar'
import type { Dept, Emp, Item, State } from '../lib/types'

const PEN = <svg viewBox="0 0 24 24"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
const X = <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeWidth="2"/></svg>

/* 部门与员工管理：所有改动直接 patch 全站状态，随整包同步落库。
   删除部门级联删除其员工，并清除任务上的相关指派。 */
export default function Team({ items, deptList, empList, onPatch }: {
  items: Item[]
  deptList: Dept[]
  empList: Emp[]
  onPatch: (f: (s: State) => State) => void
}) {
  const [deptName, setDeptName] = useState('')
  const [empName, setEmpName] = useState('')
  const [empDept, setEmpDept] = useState(0)

  const empOf = (id?: number) => empList.find(e => e.id === id)
  /* 任务的归属部门：优先看员工所在部门，否则看直接挂的部门。 */
  const deptOfItem = (i: Item) => {
    if (i.empId) { const e = empOf(i.empId); if (e) return e.deptId }
    return i.deptId || 0
  }

  const addDept = () => {
    const n = deptName.trim()
    if (!n) return
    onPatch(s => ({ ...s, deptList: [...(s.deptList || []), { id: s.nid, n }], nid: s.nid + 1 }))
    setDeptName('')
    Kit.toast('已添加部门')
  }
  const renameDept = (d: Dept) => {
    const host = document.createElement('div')
    const input = document.createElement('input')
    input.type = 'text'
    input.value = d.n
    input.className = 'newsheet-input'
    host.appendChild(input)
    Tool.sheet({
      title: '重命名部门',
      body: host,
      actions: [
        { label: '取消' },
        { label: '保存', primary: true, onClick() {
            const v = input.value.trim()
            if (v) onPatch(s => ({ ...s, deptList: (s.deptList || []).map(x => x.id === d.id ? { ...x, n: v } : x) }))
          } },
      ],
    })
    setTimeout(() => { input.focus(); input.select() }, 350)
  }
  const delDept = (d: Dept) => {
    const nEmp = empList.filter(e => e.deptId === d.id).length
    if (!window.confirm(`删除部门「${d.n}」？其 ${nEmp} 名员工一并删除，相关任务的指派会被清除。`)) return
    const deadEmp = new Set(empList.filter(e => e.deptId === d.id).map(e => e.id))
    onPatch(s => ({
      ...s,
      deptList: (s.deptList || []).filter(x => x.id !== d.id),
      empList: (s.empList || []).filter(x => x.deptId !== d.id),
      items: s.items.map(i => (i.deptId === d.id || (i.empId != null && deadEmp.has(i.empId)))
        ? { ...i, deptId: undefined, empId: undefined } : i),
    }))
    Kit.toast('已删除部门')
  }

  const addEmp = () => {
    const n = empName.trim()
    if (!n) return
    if (!empDept) { Kit.toast('先为员工选一个部门'); return }
    onPatch(s => ({ ...s, empList: [...(s.empList || []), { id: s.nid, n, deptId: empDept }], nid: s.nid + 1 }))
    setEmpName('')
    Kit.toast('已添加员工')
  }
  const moveEmp = (e: Emp, deptId: number) =>
    onPatch(s => ({ ...s, empList: (s.empList || []).map(x => x.id === e.id ? { ...x, deptId } : x) }))
  const delEmp = (e: Emp) => {
    if (!window.confirm(`删除员工「${e.n}」？其任务上的指派会被清除。`)) return
    onPatch(s => ({
      ...s,
      empList: (s.empList || []).filter(x => x.id !== e.id),
      items: s.items.map(i => i.empId === e.id ? { ...i, empId: undefined } : i),
    }))
    Kit.toast('已删除员工')
  }

  const open = items.filter(i => statusOf(i) !== 2).length

  return (
    <div className="team2">
      <div className="team-main">
        <div className="grouphead"><span>部门</span><b>{deptList.length + ' 个'}</b></div>
        <div className="team-add">
          <input value={deptName} placeholder="新部门名称，如：技术部"
                 onChange={e => setDeptName(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && addDept()} />
          <button className="btn primary" onClick={addDept}>添加</button>
        </div>
        {!deptList.length && <div className="team-empty">还没有部门，先添加一个。</div>}
        {deptList.map(d => (
          <div className="trow" key={d.id}>
            <i className="gdot" style={{ background: gcolor(d.n) }} />
            <span className="tnm">{d.n}</span>
            <i className="cnt">{empList.filter(e => e.deptId === d.id).length + ' 人'}</i>
            <span className="tacts">
              <button className="miniib" title="重命名" onClick={() => renameDept(d)}>{PEN}</button>
              <button className="miniib" title="删除" onClick={() => delDept(d)}>{X}</button>
            </span>
          </div>
        ))}

        <div className="grouphead"><span>员工</span><b>{empList.length + ' 人'}</b></div>
        <div className="team-add">
          <input value={empName} placeholder="新员工姓名"
                 onChange={e => setEmpName(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && addEmp()} />
          <button className="btn primary" onClick={addEmp}>添加</button>
        </div>
        {!!deptList.length && (
          <div className="chiprow team-depts">
            {deptList.map(d => (
              <button key={d.id} className={'chip' + (empDept === d.id ? ' on' : '')}
                      onClick={() => setEmpDept(empDept === d.id ? 0 : d.id)}>{d.n}</button>
            ))}
          </div>
        )}
        {!deptList.length && <div className="team-empty">先添加部门，才能添加员工。</div>}
        {!!deptList.length && !empList.length && <div className="team-empty">还没有员工。</div>}
        {empList.map(e => (
          <div className="trow" key={e.id}>
            <span className="tnm">{e.n}</span>
            <span className="tdept">
              {deptList.map(d => (
                <button key={d.id} className={'chip' + (e.deptId === d.id ? ' on' : '')}
                        onClick={() => moveEmp(e, d.id)}>{d.n}</button>
              ))}
            </span>
            <span className="tacts">
              <button className="miniib" title="删除" onClick={() => delEmp(e)}>{X}</button>
            </span>
          </div>
        ))}
      </div>

      <aside className="team-side">
        <div className="grouphead"><span>任务量</span><b>{open + ' 件未完成'}</b></div>
        {!deptList.length && <div className="team-empty">添加部门后这里显示各部的任务量。</div>}
        <div className="glist">
          {deptList.map(d => {
            const list = items.filter(i => deptOfItem(i) === d.id)
            const done = list.filter(i => statusOf(i) === 2).length
            return (
              <div className="grow" key={d.id}>
                <span className="nm">{d.n}</span>
                <span className="bar"><i style={{ width: (list.length ? done / list.length * 100 : 0) + '%' }} /></span>
                <span className="v">{(list.length - done) + '/' + list.length}</span>
              </div>
            )
          })}
        </div>

        <div className="grouphead"><span>按员工</span></div>
        {!empList.length && <div className="team-empty">添加员工后这里显示每个人的待办数。</div>}
        <div className="glist">
          {empList.map(e => {
            const n = items.filter(i => i.empId === e.id && statusOf(i) !== 2).length
            const d = deptList.find(x => x.id === e.deptId)
            return (
              <div className="grow" key={e.id}>
                <span className="nm wide">{e.n}</span>
                <span className="bar" />
                <span className="v">{n + ' 件' + (d ? ' · ' + d.n : '')}</span>
              </div>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
