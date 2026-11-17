/* 编辑 / 新建任务面板：同一套字段，新建时传入 preset 做默认值。
   面板居中显示，不走底部 sheet。 */
import Kit from './kit.js';
import Tool from './tool.js';
import { midnight, QUADS, quadOf, STATUSES, statusOf } from './todo.js';

const T = Tool, K = Kit;

/* 解析输入串里的日期/优先级/分组/象限/状态标记，用作新任务的预填。 */
function scanInput(raw){
  const t = raw || '';
  const pri = t.match(/(^|\s)(!{1,3})(\s|$)/);
  const imp = !/不重要/.test(t) && /重要/.test(t);
  const urg = !/不紧急/.test(t) && /紧急/.test(t);
  const doing = /进行中|doing/i.test(t);
  const tag = t.match(/#(\S+)/);
  return {
    p: pri ? 4 - pri[2].length : 3,
    quad: imp && urg ? 1 : imp ? 2 : urg ? 3 : 4,
    status: doing ? 1 : 0,
    g: tag ? tag[1] : '',
  };
}

/* 通用任务面板：编辑已有任务或新建任务共用。
   preset: { status?, quad?, t? } — 新建时的默认值。 */
export function taskSheet({ title, item, preset = {}, onSave, onDelete }){
  const isNew = !item;
  const base = item || {
    id: 0, t: preset.t || '', p: preset.p ?? 3, due: 0,
    g: preset.g || '', quad: preset.quad ?? 4, status: preset.status ?? 0, done: false,
  };

  const b = T.el('div');

  /* 内容 */
  const f1 = T.el('div', { class:'field' }, T.el('label', { text:'内容' }));
  const inp = T.el('input', { type:'text', value: base.t });
  f1.appendChild(inp);

  /* 日期 */
  const f2 = T.el('div', { class:'field' }, T.el('label', { text:'日期' }));
  const dt = T.el('input', { type:'date',
    value: base.due ? new Date(base.due - new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10) : '' });
  f2.appendChild(dt);

  /* 分组 */
  const f3 = T.el('div', { class:'field' }, T.el('label', { text:'分组' }));
  const gp = T.el('input', { type:'text', value: base.g, placeholder:'如：产品' });
  f3.appendChild(gp);

  /* 优先级 */
  const f4 = T.el('div', { class:'field' }, T.el('label', { text:'优先级' }));
  const pr = T.el('div', { class:'prirow' });
  let pri = base.p;
  [[1,'高'],[2,'中'],[3,'低']].forEach(([v,l]) => {
    const c = T.el('button', { class:'chip' + (base.p===v?' on':''), type:'button', text:l });
    c.onclick = () => { pri = v; [...pr.children].forEach(x => x.classList.toggle('on', x===c)) };
    pr.appendChild(c);
  });
  f4.appendChild(pr);

  /* 状态 */
  const f5 = T.el('div', { class:'field' }, T.el('label', { text:'状态' }));
  const st = T.el('div', { class:'prirow' });
  let status = statusOf(base);
  STATUSES.forEach(su => {
    const c = T.el('button', { class:'chip' + (status===su.k?' on':''), type:'button', text:su.n });
    c.onclick = () => { status = su.k; [...st.children].forEach(x => x.classList.toggle('on', x===c)) };
    st.appendChild(c);
  });
  f5.appendChild(st);

  /* 象限 */
  const f6 = T.el('div', { class:'field' }, T.el('label', { text:'象限' }));
  const qr = T.el('div', { class:'prirow' });
  let quad = quadOf(base);
  QUADS.forEach(qu => {
    const c = T.el('button', { class:'chip' + (quad===qu.k?' on':''), type:'button', text:qu.n });
    c.onclick = () => { quad = qu.k; [...qr.children].forEach(x => x.classList.toggle('on', x===c)) };
    qr.appendChild(c);
  });
  f6.appendChild(qr);

  /* 任务详情：富文本 + 图片上传（存 localStorage base64） */
  const f7 = T.el('div', { class:'field' }, T.el('label', { text:'任务详情' }));
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
  f7.append(editor, bar);
  /* 已有图片从 note HTML 里自然渲染，无需额外处理。 */

  b.append(f1, f2, f3, f4, f5, f6, f7);

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
      onSave({
        ...base,
        id: base.id,
        t,
        due: dt.value ? midnight(new Date(dt.value + 'T00:00:00')) : 0,
        g: gp.value.trim(),
        p: pri, status, quad,
        done: status === 2,
        at: status === 2 ? (base.at || Date.now()) : 0,
        note: editor.innerHTML,
      });
      K.toast(isNew ? '已添加' : '已保存');
    } }
  ]});
  setTimeout(() => inp.focus(), 350);
  return sh;
}

/* 编辑入口：保持原有签名。 */
export function editItem(i, { onSave, onDelete }){
  taskSheet({ title:'编辑任务', item:i, onSave, onDelete });
}

/* 新建入口：preset 指定默认状态/象限，raw 预填内容。 */
export function newItem(preset, onSave){
  const scanned = scanInput(preset.t || '');
  taskSheet({
    title: '新建任务',
    preset: {
      ...preset,
      p: scanned.p,
      g: scanned.g || preset.g || '',
      quad: preset.quad ?? scanned.quad,
      status: preset.status ?? scanned.status,
      t: (preset.t || '').replace(/!{1,3}/g,'').replace(/#(\S+)/g,'')
          .replace(/不重要|不紧急|重要|紧急|进行中|doing/ig,'').trim(),
    },
    onSave,
  });
}
