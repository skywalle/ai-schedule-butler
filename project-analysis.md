# todo-day 项目分析

## 1. 项目概述

todo-day 是一个中文单页待办事项应用。它把任务管理拆成四个视图：四象限看板、双模式清单、月历、进度统计。录入走自然语言，数据落在服务端 MariaDB，localStorage 只当离线缓存。

应用已完成全栈化改造：任何设备打开同一地址，看到的是同一份清单。

## 2. 技术栈

| 层 | 选型 | 版本 |
| --- | --- | --- |
| 前端框架 | React | 19.2 |
| 构建工具 | Vite | 7.1 |
| 前端语言 | TypeScript | 5.9 |
| 后端框架 | Fastify | 5.x |
| 数据库驱动 | mysql2/promise | 3.x |
| 数据库 | MariaDB（MySQL 协议） | 11.8 |
| 字体 | Geist 可变字体（正文 + 等宽） | — |

前端是 ESM，后端按项目约定用 CommonJS。

## 3. 目录结构

```
index.html              入口；#root 用 display:contents 保持 body 容器链
src/
  main.tsx              React 挂载（StrictMode）
  App.tsx               壳：侧边栏、四视图切换、同步逻辑、导出
  components/           Sidebar / Board / Kanban / List / BigCalendar / Progress
  lib/
    api.ts              服务端状态同步客户端
    todo.js             纯逻辑：解析、分桶、排序、种子数据
    heat.js             18 周热力格数据
    edit.js             编辑抽屉
    kit.js              主题、图表、toast、CSV
    tool.js             海报、分享链接、屏幕栈、store
    types.ts            Item / State 类型
  styles/               kit.css（token）→ tool.css（壳）→ app.css（页面）
server/                 Fastify 后端
  src/config.js         环境变量配置（带默认值）
  src/common.js         toSafeInt、formatLocalDateTime
  src/db.js             连接池 + 幂等建表
  src/repo/state.js     loadState / upsertState
  src/route/state.js    /api 路由 + 入参校验
  src/server.js         入口，托管 dist/
public/fonts/           Geist 字体
```

## 4. 数据模型

`src/lib/types.ts` 定义两个类型。

Item（单条任务）：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| id | number | 自增主键（前端 nid 派发） |
| t | string | 任务内容 |
| p | number | 优先级：1 高 / 2 中 / 3 低 |
| due | number | 到期日零点时间戳，0 表示没排期 |
| g | string | 分组名 |
| quad | 1-4 | 四象限（重要 × 紧急） |
| status | 0-2 | 待完成 / 进行中 / 已完成 |
| done | boolean | 冗余标记，兼容旧数据 |
| at | number | 完成时间戳 |
| note | string | 备注 |

State（全站状态）：`items` 数组 + `sort` 排序方式 + `nid` 下一个 id + `titles` 自定义列名。

## 5. 后端设计

后端按 AGENTS.md 的 Node.js 约定编写：CommonJS、首行 `'use strict'`、单引号、分号、方法名「动词 + 单名 + 后缀」。

- **config.js**：`getServerConfig()` / `getDbConfig()` 读环境变量。数值先过 `toSafeInt` 校验，脏值在启动前抛错。
- **db.js**：mysql2 连接池是模块级单例。`initSchema()` 幂等建表，库被清空也能自愈。
- **repo/state.js**：单行 JSON 存全量 State（id 固定 1）。`INSERT ... ON DUPLICATE KEY UPDATE` 单语句原子完成，并发保存不会互相覆盖出脏行。
- **route/state.js**：入参校验返回带字段下标的错误文案（如 `state.items[0].t 为空`），前端可直接定位；错误一律带上下文抛出，不静默吞错。
- **server.js**：数据库不可用就拒绝启动——持久化是核心能力，静默降级等于丢数据。检测到 `dist/` 存在时用 @fastify/static 托管，单进程同时供页面与 API。

## 6. API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/health | 数据库探活，返回本地时间 |
| GET | /api/state | 拉取全量状态；无数据返回 `{"state": null}` |
| PUT | /api/state | 整体保存状态；校验失败返回 400 与字段级错误 |

前端同步策略：启动先读 localStorage 立即渲染，再从服务端拉全量覆盖；此后每次变更先落本地缓存，再防抖 500ms 推送服务端；推送失败 toast 提示并保持本地。

## 7. 前端架构

**数据流**：`App.tsx` 持有单一 `st` state，所有修改经 `patch` 做不可变更新（浅拷贝 items 数组）。`live` ref 保证防抖推送读到最新值。

**自然语言录入**（`todo.js` 的 `parseInput`）：一行字同时解析优先级（`!`/`!!`/`!!!`）、象限（「重要」「紧急」自由组合）、状态（「进行中」）、日期（今天/明天/后天/下周/月日）、分组（`#标签`）。手机打字是唯一高频录入方式，所以解析器优先于表单。

**视图层**：

- `Sidebar`：视图导航 + 优先级/分组筛选，分组色按名字散列取色，不用存数据。
- `Board`：艾森豪威尔四象限，象限与列名可重命名。
- `Kanban`：待完成/进行中/已完成三列，pointer events + setPointerCapture 拖拽（HTML5 DnD 移动端不触发）。
- `List`：按逾期/今天/明天/以后/没排期/已完成分桶，全部清单模式支持筛选与四种排序。
- `BigCalendar`：月历总览，可改期。
- `Progress`：四项计数、7 天柱图、18 周热力格，清理已完成、导出 CSV 与海报。

**样式体系**：三层 CSS。`kit.css` 定义设计 token（暖纸调色板 + 暗色主题、发丝线、等宽数字）；`tool.css` 画应用壳；`app.css` 写本页组件。主题切换改 `data-theme`，图表通过 `kit.js` 注册的 builder 原地重建，不重载页面。

**基础设施亮点**：

- `tool.js` 的 `poster`：Canvas 2D 两遍式绘制 1080px 宽海报（先测量排版成 op 列表再一次绘制），等 `document.fonts.ready`，种子噪点防大平涂。
- `tool.js` 的 `share`：deflate-raw 压缩 + base64url 编进 hash 的纯前端分享链接。
- `store`：包一层 try/catch，隐私模式下 localStorage 抛错也不炸。

## 8. 部署与运维

环境变量（均有默认值，见 `server/src/config.js`）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| SERVER_HOST | 0.0.0.0 | 监听地址 |
| SERVER_PORT | 8787 | 服务端口 |
| MYSQL_HOST | 127.0.0.1 | 数据库地址 |
| MYSQL_PORT | 3306 | 数据库端口 |
| MYSQL_USER | todo | 应用账号 |
| MYSQL_PASSWORD | todo_day | 应用密码 |
| MYSQL_DATABASE | todo_day | 库名 |

首次部署：

1. 安装 MariaDB，创建库 `todo_day` 与用户 `todo`（仅授权本库）。
2. `npm install`（根目录与 `server/` 各一次）。
3. `npm run build` 构建前端。
4. `npm run server` 启动；建表由服务自动完成。

日常开发（热重载）：

- `npm run dev`：前端 Vite，监听 0.0.0.0:5173，改代码即时热更新；`/api` 自动代理到 8787
- `npm run dev:server`：后端 Fastify，`node --watch` 改代码自动重启
- 局域网其他设备经 `http://<本机IP>:5173` 直接访问

## 9. 已知限制与遗留问题

- **无鉴权**：v1 为单工作区，任何能访问服务的人共享同一份数据。多用户需加登录态并按用户隔离 `todo_state` 行。
- **整体同步的并发覆盖**：两端同时编辑时，后保存者覆盖先保存者。数据量小可接受；冲突合并需引入版本号。
- **首屏拉取竞态**：服务端全量到达前用户在本地做了编辑，会被覆盖。概率极低，暂未处理。
- **遗留组件**：`Calendar.tsx`、`Recap.tsx`、`Stats.tsx` 未被 `App.tsx` 引用，是旧版残留，可清理。
- **info.md 描述滞后**：其中「数据存在 localStorage」等表述属于纯前端时代，以本文档为准。
