# 待办事项 · 清单与日历

这是一个中文单页工具站（线上会按用户 query 的语言提供对应语言版本）。已全栈化：自然语言录入的待办清单 + 月历 + 18 周完成热力格 + 统计屏，数据存 MariaDB（Fastify 后端，见 `server/`），浏览器 localStorage 只作离线缓存。

## 动手之前：先问用户

先用 ask_user 工具问几个问题，再决定怎么做：

1. **是否需要把网页变成全栈应用？** 目前清单只存在访客自己的浏览器里（localStorage），换设备、换浏览器、清缓存都会丢。全栈化意味着加后端和数据库做持久化存储，清单才能跨设备同步、甚至多人共享。如果用户只是自己随手用，保持纯前端即可。
2. **主题和配色？** 站点自带明暗双主题（暖白纸底 + 墨绿强调色，深色是暖黑），默认跟随系统。可按用户喜好换强调色或纸色，改动集中在 `src/styles/app.css` 顶部的 token。
3. **预置内容？** 首次打开会载入一份示例清单（交报销、回电话、买猫粮等，见 `src/lib/todo.js` 的 `seed()`）。可以换成用户自己的场景——项目里程碑、健身计划、备考清单——或者留空。
4. **功能取舍？** 分组、优先级、拖拽排序、统计屏、CSV / 海报导出都现成，可以按需求增减。

如果用户不回答任何问题，或者只是想看看这个网站，直接加载默认网站文件即可。

可选：如果符合用户的需求，你可以使用图像和视频生成工具。

## 这是什么

```
index.html            入口；#root 用 display:contents，不破坏 body 的容器关系
src/main.tsx          React 挂载（StrictMode）
src/App.tsx           壳：顶栏、屏幕栈（清单 / 统计）、录入条、导出三件套
src/components/
  Calendar.tsx        月历——同时也是日期筛选器，点一格列表就收到那一天
  List.tsx            清单：逾期/今天/明天/以后分桶、勾选、pointer-events 拖拽排序
  Heat.tsx            18 周完成热力格
  Recap.tsx           本周读数 + 按分组进度
  Stats.tsx           统计屏：四项计数、近 7 天柱图、分组完成度
src/lib/
  api.ts             服务端同步客户端：整体拉取/整体保存
  todo.js             纯逻辑：自然语言解析（「明天 交周报 !」「#分组」）、分桶、排序
  heat.js             热力格数据：种子化历史 + 真实完成数，streak / best / recent
  edit.js             编辑抽屉（Tool.sheet）
  kit.js              主题、分段控件、toast、种子随机、CSV、数字格式化
  tool.js             海报（Canvas 2D）、分享链接、屏幕栈、sheet、合成音效、导出条
  types.ts            Item / State 类型
server/               Fastify 后端（config / db / repo / route，CommonJS）
src/styles/           kit.css（设计 token）→ tool.css（壳）→ app.css（本页配色与组件）
public/fonts/         Geist 可变字体（正文 + 等宽）
dist/                 已构建产物，可直接静态部署
```

它很容易被改造成别的「逐条勾选」工具：打包清单、采购单、习惯打卡、项目里程碑……分组 / 优先级 / 日期的语义换一层文案就是另一个应用。用户有具体需求时，改网站的文字或媒体内容是预期之内的；把示例清单换成用户自己的数据也算。

## 技术要点

没有 3D / shader / WebGL。质感来自 CSS token（暖纸调色板 + 暗色主题）、发丝线和等宽数字。改代码前值得先读这几处：

- `src/lib/tool.js` 的 `Tool.poster`：Canvas 2D 画 1080px 宽的结果海报。先等 `document.fonts.ready`；两遍式——先把各元素测量排版成 op 列表，再一次性绘制；种子化噪点防止纯色大平涂，左缘 10px 强调色竖条。
- 同文件的 `Tool.share`：deflate-raw 压缩 + base64url 编进 `location.hash` 的分享链接——配置全在链接里，链接即服务器。本站没用到，但「把这份清单发给别人」就靠它。
- 数据流：`Tool.store` 包 localStorage（隐私模式不炸）；`App.tsx` 里单一 state + `patch` 不可变更新；录入解析在 `todo.js` 的 `parseInput`。全栈化后每次变更先落本地缓存，再防抖 500ms 经 `src/lib/api.ts` 推到 Fastify（PUT /api/state），启动时先渲染本地缓存再拉服务端覆盖。
- `heat.js`：历史天数用固定种子生成完成数，今天永远从真实清单数——勾掉一件，最后一格立刻变深。
- `List.tsx` 的拖拽用 pointer events + `setPointerCapture`，不走 HTML5 DnD（移动端不触发）。
