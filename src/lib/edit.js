/* 编辑 / 新建任务面板：同一套字段，新建时传入 preset 做默认值。
   面板居中显示，不走底部 sheet。 */
import Kit from './kit.js';
import Tool from './tool.js';
import { DAY, QUADS, STATUSES, TODAY, WD, dayTs, fmtDate, quadOf, shYmd, statusOf, wdOf } from './todo.js';
import { getInfoHoliday } from './holiday';

const T = Tool, K = Kit;

/* 解析输入串里的日期/关键字/象限/状态标记，用作新任务的预填。 */
function scanInput(raw){
  const t = raw || '';
  const imp = !/不重要/.test(t) && /重要/.test(t);
  const urg = !/不紧急/.test(t) && /紧急/.test(t);
  const doing = /进行中|doing/i.test(t);
  const tagList = [...new Set((t.match(/#\S+/g) || []).map(x => x.slice(1)))];
  return {
    quad: imp && urg ? 1 : imp ? 2 : urg ? 3 : 4,
    status: doing ? 1 : 0,
    tagList,
  };
}

/* 宽松解析日期文本：yyyy-mm-dd、yyyy/m/d、yyyymmdd 都归一到当天零点；
   2 月 30 日这类不存在的日期返回 null（Luxon 非法日期产出 NaN）。 */
function parseDateText(s){
  const m = s.trim().match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const ts = dayTs(y, mo - 1, d);
  return Number.isNaN(ts) ? null : ts;
}

/* 关键字录入框：# 开头，# 后文字匹配已有关键字给出建议；
   回车落成小圆片，点圆片删除，保存时取 getTagList()。 */
function tagInput({ initialTagList = [], allTagList = [] }){
  const tagSet = [...new Set(initialTagList)];
  const box = T.el('div', { class:'taginput' });
  const chips = T.el('div', { class:'tagchips' });
  const inp = T.el('input', { type:'text', placeholder:'# 开头，回车确认' });
  const sug = T.el('div', { class:'tagsug' });
  box.append(chips, sug);

  const hideSug = () => { sug.style.display = 'none'; sug.innerHTML = ''; };
  const paint = () => {
    chips.innerHTML = '';
    for (const kw of tagSet) {
      const c = T.el('button', { class:'tagchip', type:'button' });
      c.appendChild(document.createTextNode('#' + kw));
      const x = T.el('i', { text:'✕' });
      x.onmousedown = (e) => e.preventDefault();
      x.onclick = (e) => { e.stopPropagation(); remove(kw); };
      c.appendChild(x);
      chips.appendChild(c);
    }
    chips.appendChild(inp);
  };
  const remove = (kw) => {
    const k = tagSet.indexOf(kw);
    if (k >= 0) tagSet.splice(k, 1);
    paint();
  };
  const add = (raw) => {
    /* 关键字必须 # 开头：剥掉一个前导 #，再按空白拆成多个。 */
    const kwList = String(raw || '').replace(/^#/, '').trim().split(/\s+/).filter(Boolean);
    for (const kw of kwList) if (!tagSet.includes(kw)) tagSet.push(kw);
    inp.value = '';
    hideSug();
    paint();
    inp.focus();
  };
  const paintSug = () => {
    const m = inp.value.match(/#(\S*)$/);
    if (!m) return hideSug();
    const q = m[1];
    const cand = allTagList.filter(kw => !tagSet.includes(kw) && (!q || kw.includes(q)));
    if (!cand.length) return hideSug();
    sug.innerHTML = '';
    for (const kw of cand.slice(0, 8)) {
      const b = T.el('button', { type:'button', text:'#' + kw });
      /* mousedown 拦截默认行为：点建议时输入框不失焦，blur 不会抢先落成关键字。 */
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => add(kw);
      sug.appendChild(b);
    }
    sug.style.display = 'block';
  };

  inp.oninput = paintSug;
  inp.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (inp.value.trim()) add(inp.value); }
    else if (e.key === 'Backspace' && !inp.value && tagSet.length) remove(tagSet[tagSet.length - 1]);
    else if (e.key === 'Escape') hideSug();
  };
  /* 失焦说明用户去点保存了：残留文本直接落成关键字，不丢。 */
  inp.addEventListener('blur', () => {
    if (inp.value.trim()) add(inp.value);
    setTimeout(hideSug, 120);
  });
  box.onmousedown = (e) => { if (e.target === box || e.target === chips) { e.preventDefault(); inp.focus(); } };
  paint();
  return { el: box, getTagList: () => tagSet.slice() };
}

/* 通用任务面板：编辑已有任务或新建任务共用。
   preset: { status?, quad?, t?, due? } — 新建时的默认值。 */
export function taskSheet({ title, item, preset = {}, deptList = [], empList = [], allTagList = [], onSave, onDelete }){
  const isNew = !item;
  const base = item || {
    id: 0, t: preset.t || '', due: preset.due || 0,
    tagList: preset.tagList || [], quad: preset.quad ?? 4, status: preset.status ?? 0, done: false,
  };

  const b = T.el('div');

  /* 内容 */
  const f1 = T.el('div', { class:'field span2' }, T.el('label', { text:'内容' }));
  const inp = T.el('input', { type:'text', value: base.t });
  f1.appendChild(inp);

  /* 日期：文本框 + 小月历弹层。原生 date 输入的显示格式跟随浏览器区域
     设置，中文 Chrome 显示 2026/11/17，与全站统一的 yyyy-mm-dd 不一致。 */
  const f2 = T.el('div', { class:'field' }, T.el('label', { text:'日期' }));
  const dtWrap = T.el('div', { class:'datewrap' });
  const dt = T.el('input', { type:'text', inputmode:'numeric',
    value: base.due ? fmtDate(base.due) : '', placeholder:'yyyy-mm-dd' });
  const CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">'
    + '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  const calBtn = T.el('button', { class:'ib dtpick', type:'button', title:'选择日期', html:CAL });
  dtWrap.append(dt, calBtn);
  f2.appendChild(dtWrap);

  /* 小月历：周一开头，点选回填 yyyy-mm-dd，点弹层外收起。 */
  let pop = null;
  const seed = shYmd(base.due || TODAY);
  let calY = seed[0], calM = seed[1];
  const onDocDown = e => { if (pop && !dtWrap.contains(e.target)) closeCal() };
  const closeCal = () => { if (pop){ pop.remove(); pop = null } document.removeEventListener('pointerdown', onDocDown) };
  const paintCal = () => {
    pop.innerHTML = '';
    const head = T.el('div', { class:'calpop-head' });
    const prev = T.el('button', { class:'miniib', type:'button', text:'‹' });
    const next = T.el('button', { class:'miniib', type:'button', text:'›' });
    prev.onclick = () => { calM--; if (calM < 0){ calM = 11; calY-- } paintCal() };
    next.onclick = () => { calM++; if (calM > 11){ calM = 0; calY++ } paintCal() };
    const todayBtn = T.el('button', { class:'chip', type:'button', text:'今天' });
    todayBtn.onclick = () => pick(TODAY);
    head.append(prev, T.el('b', { text: calY + '-' + String(calM + 1).padStart(2, '0') }), next, todayBtn);
    const grid = T.el('div', { class:'calpop-grid' });
    WD.forEach(w => grid.appendChild(T.el('span', { class:'wd', text:w })));
    const first = dayTs(calY, calM, 1);
    const start = first - ((wdOf(first) + 6) % 7) * DAY;
    for (let k = 0; k < 42; k++){
      const ts = start + k * DAY;
      const cell = T.el('button', { class:'d', type:'button', text:String(shYmd(ts)[2]) });
      if (shYmd(ts)[1] !== calM) cell.classList.add('out');
      if (ts === TODAY) cell.classList.add('today');
      if (dt.value === fmtDate(ts)) cell.classList.add('on');
      const hol = getInfoHoliday(ts);
      if (hol){ cell.classList.add(hol.off ? 'hol' : 'work'); cell.title = hol.name + (hol.off ? '' : '（调休上班）') }
      cell.onclick = () => pick(ts);
      grid.appendChild(cell);
    }
    pop.append(head, grid);
  };
  const pick = ts => { dt.value = fmtDate(ts); closeCal() };
  calBtn.onclick = e => {
    e.stopPropagation();
    if (pop){ closeCal(); return }
    pop = T.el('div', { class:'calpop' });
    paintCal();
    dtWrap.appendChild(pop);
    document.addEventListener('pointerdown', onDocDown);
  };

  /* 关键字：# 开头，回车落成小圆片，是侧栏聚合和筛选的维度 */
  const f3 = T.el('div', { class:'field' }, T.el('label', { text:'关键字' }));
  const tagIn = tagInput({ initialTagList: base.tagList || [], allTagList });
  f3.appendChild(tagIn.el);

  /* 部门 + 员工：0 表示未指派。选员工自动带出其部门；
     换部门时清掉不属于新部门的已选员工。两行 chips 联级重绘。 */
  let deptId = base.deptId || 0;
  let empId = base.empId || 0;
  const fDept = T.el('div', { class:'field' }, T.el('label', { text:'部门' }));
  const drow = T.el('div', { class:'chiprow' });
  const fEmp = T.el('div', { class:'field' }, T.el('label', { text:'员工' }));
  const erow = T.el('div', { class:'chiprow' });
  const paintDept = () => {
    drow.innerHTML = '';
    const mk = (v, label) => {
      const c = T.el('button', { class:'chip' + (deptId === v ? ' on' : ''), type:'button', text:label });
      c.onclick = () => {
        deptId = v;
        const emp = empList.find(e => e.id === empId);
        if (v && emp && emp.deptId !== v) empId = 0;
        paintDept(); paintEmp();
      };
      drow.appendChild(c);
    };
    mk(0, '无');
    deptList.forEach(d => mk(d.id, d.n));
  };
  const paintEmp = () => {
    erow.innerHTML = '';
    const mk = (v, label) => {
      const c = T.el('button', { class:'chip' + (empId === v ? ' on' : ''), type:'button', text:label });
      c.onclick = () => {
        empId = v;
        const emp = empList.find(e => e.id === v);
        if (emp && emp.deptId !== deptId) { deptId = emp.deptId; paintDept(); }
        paintEmp();
      };
      erow.appendChild(c);
    };
    mk(0, '无');
    (deptId ? empList.filter(e => e.deptId === deptId) : empList)
      .forEach(e => mk(e.id, e.n));
  };
  paintDept(); paintEmp();
  fDept.appendChild(drow);
  fEmp.appendChild(erow);
  if (!deptList.length) {
    fDept.appendChild(T.el('div', { class:'whohint', text:'还没有部门，去「人员」页添加' }));
  }

  /* 执行员工 / 提交员工：独立于部门指派的两个员工维度，不随部门级联，0 表示未设置。 */
  const mkEmpRow = (label, initialId) => {
    let id = initialId || 0;
    const f = T.el('div', { class:'field' }, T.el('label', { text:label }));
    const row = T.el('div', { class:'chiprow' });
    const paint = () => {
      row.innerHTML = '';
      const mk = (v, name) => {
        const c = T.el('button', { class:'chip' + (id === v ? ' on' : ''), type:'button', text:name });
        c.onclick = () => { id = v; paint() };
        row.appendChild(c);
      };
      mk(0, '无');
      empList.forEach(e => mk(e.id, e.n));
    };
    paint();
    f.appendChild(row);
    return { el: f, getId: () => id || undefined };
  };
  const execRow = mkEmpRow('执行员工', base.execEmpId);
  const subRow = mkEmpRow('提交员工', base.subEmpId);

  /* 状态 */
  const f4 = T.el('div', { class:'field' }, T.el('label', { text:'状态' }));
  const st = T.el('div', { class:'chiprow' });
  let status = statusOf(base);
  STATUSES.forEach(su => {
    const c = T.el('button', { class:'chip' + (status===su.k?' on':''), type:'button', text:su.n });
    c.onclick = () => { status = su.k; [...st.children].forEach(x => x.classList.toggle('on', x===c)) };
    st.appendChild(c);
  });
  f4.appendChild(st);

  /* 象限 */
  const f5 = T.el('div', { class:'field' }, T.el('label', { text:'象限' }));
  const qr = T.el('div', { class:'chiprow' });
  let quad = quadOf(base);
  QUADS.forEach(qu => {
    const c = T.el('button', { class:'chip' + (quad===qu.k?' on':''), type:'button', text:qu.n });
    c.onclick = () => { quad = qu.k; [...qr.children].forEach(x => x.classList.toggle('on', x===c)) };
    qr.appendChild(c);
  });
  f5.appendChild(qr);

  /* 任务详情：富文本 + 图片上传（存 localStorage base64） */
  const f6 = T.el('div', { class:'field span2' }, T.el('label', { text:'任务详情' }));
  const editor = T.el('div', { class:'note-editor' });
  editor.contentEditable = 'true';
  editor.innerHTML = base.note || '';
  editor.dataset.placeholder = '补充说明、贴截图…';
  const imgRow = T.el('div', { class:'note-imgs' });
  const imgBtn = T.el('button', { class:'btn', type:'button', text:'上传图片' });
  const imgInput = T.el('input', { type:'file', accept:'image/*', style:'display:none' });
  imgBtn.onclick = () => imgInput.click();
  imgInput.onchange = () => {
    const file = imgInput.files?.[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = T.el('img', { src: String(rd.result), class:'note-img' });
      editor.appendChild(img);
      editor.appendChild(document.createTextNode('\n'));
    };
    rd.readAsDataURL(file);
    imgInput.value = '';
  };
  const bar = T.el('div', { class:'note-bar' });
  bar.append(imgBtn, imgInput);
  f6.append(editor, bar);
  /* 已有图片从 note HTML 里自然渲染，无需额外处理。 */

  /* 左右双栏：基础字段两两成对，内容/详情跨整行。 */
  const form = T.el('div', { class:'taskform' });
  form.append(f1, f2, f3, fDept, fEmp, execRow.el, subRow.el, f4, f5, f6);
  b.appendChild(form);

  /* 编辑已有任务时才有删除按钮 */
  let delBtn = null;
  if (!isNew && onDelete) {
    delBtn = T.el('button', { class:'btn', text:'删除这一条',
      style:'width:100%;color:var(--neg);border-color:var(--neg)' });
    delBtn.onclick = () => { onDelete(item); sh.close(); K.toast('已删除') };
    b.appendChild(delBtn);
  }

  const sh = T.sheet({ title, body:b, actions:[
    { label:'取消' },
    { label: isNew ? '添加' : '保存', primary:true, onClick(){
      const t = inp.value.trim();
      if (!t) return;
      const dText = dt.value.trim();
      let due = 0;
      if (dText){
        due = parseDateText(dText);
        if (due == null){ K.toast('日期格式应为 yyyy-mm-dd'); return false }
      }
      onSave({
        ...base,
        id: base.id,
        t,
        due,
        tagList: tagIn.getTagList(),
        deptId: deptId || undefined,
        empId: empId || undefined,
        execEmpId: execRow.getId(),
        subEmpId: subRow.getId(),
        status, quad,
        done: status === 2,
        at: status === 2 ? (base.at || Date.now()) : 0,
        note: editor.innerHTML,
      });
      K.toast(isNew ? '已添加' : '已保存');
    } }
  ]});
  sh.el.classList.add('sheet-task');
  setTimeout(() => inp.focus(), 350);
  return sh;
}

/* 编辑入口：保持原有签名，外加部门/员工列表用于指派选择。 */
export function editItem(i, { onSave, onDelete, deptList, empList, allTagList }){
  taskSheet({ title:'编辑任务', item:i, onSave, onDelete, deptList, empList, allTagList });
}

/* 新建入口：preset 指定默认状态/象限，raw 预填内容。
   opt 携带部门/员工主数据，用于面板里的指派选择。 */
/**
 * @param {object} preset
 * @param {(item: any) => void} onSave
 * @param {{ deptList?: { id: number, n: string }[], empList?: { id: number, n: string, deptId: number }[], allTagList?: string[] }} [opt]
 */
export function newItem(preset, onSave, opt = {}){
  const { deptList = [], empList = [], allTagList = [] } = opt;
  const scanned = scanInput(preset.t || '');
  taskSheet({
    title: '新建任务',
    preset: {
      ...preset,
      tagList: scanned.tagList.length ? scanned.tagList : (preset.tagList || []),
      quad: preset.quad ?? scanned.quad,
      status: preset.status ?? scanned.status,
      t: (preset.t || '').replace(/#(\S+)/g,'')
          .replace(/不重要|不紧急|重要|紧急|进行中|doing/ig,'').trim(),
    },
    deptList,
    empList,
    allTagList,
    onSave,
  });
}
