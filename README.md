# AI日程大管家

自然语言录入的待办清单 + 日程管理工具。它把任务管理拆成四个视图：四象限看板、三列看板、分桶清单、月历与进度统计，数据落在服务端 MariaDB，浏览器 localStorage 只作离线缓存。任何设备打开同一地址，看到的是同一份清单。

同时内置 MCP 服务，让 AI 助手可以直接帮你管理待办。

## 功能特性

- **自然语言录入**：一行字解析优先级（`!`/`!!`/`!!!`）、四象限（重要 × 紧急）、状态、日期（今天/明天/后天/下周/月日）、分组（`#标签`）。例如：`明天 交周报 !`、`#项目 3月5日 提审 重要`
- **四象限看板**：艾森豪威尔矩阵，象限与列名可重命名
- **三列看板**：待完成 / 进行中 / 已完成，支持拖拽排序（pointer events，移动端可用）
- **分桶清单**：逾期 / 今天 / 明天 / 以后 / 没排期 / 已完成，支持筛选与四种排序
- **月历视图**：总览与改期
- **进度统计**：四项计数、近 7 天柱图、18 周完成热力格
- **团队管理**：部门与员工的增删改，任务可指派到部门与员工
- **导出**：CSV 导出、Canvas 生成的完成海报
- **明暗双主题**：暖白纸底 + 墨绿强调色，深色为暖黑，默认跟随系统
- **MCP 接入**：AI 助手通过 MCP 协议直接读写待办

## 技术栈

| 层 | 选型 | 版本 |
| --- | --- | --- |
| 前端框架 | React | 19 |
| 构建工具 | Vite | 7 |
| 前端语言 | TypeScript | 5.9 |
| 后端框架 | Fastify | 5 |
| 数据库驱动 | mysql2/promise | 3 |
| 数据库 | MariaDB（MySQL 协议） | 11 |
| 字体 | Geist 可变字体 | — |

前端是 ESM，后端按 CommonJS 编写。

## 快速开始

前置要求：Node.js 20+，MariaDB 10.4+（或 MySQL 8）。

```bash
# 1. 创建数据库与用户（示例）
# CREATE DATABASE todo_day;
# CREATE USER 'todo'@'localhost' IDENTIFIED BY '你的密码';
# GRANT ALL PRIVILEGES ON todo_day.* TO 'todo'@'localhost';

# 2. 安装依赖（根目录与 server 各一次）
npm install
cd server && npm install && cd ..

# 3. 按需配置环境变量（都有默认值，见 server/.env.example）
cp server/.env.example server/.env

# 4. 构建前端
npm run build

# 5. 启动（单进程同时托管页面与 API，建表自动完成）
npm run server
```

打开 `http://localhost:8787` 即可使用。

### 日常开发（热重载）

```bash
npm run dev         # 前端 Vite，监听 0.0.0.0:5173，/api 自动代理到 8787
npm run dev:server  # 后端 Fastify，node --watch 自动重启
```

局域网其他设备经 `http://<本机IP>:5173` 直接访问。

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SERVER_HOST` | `0.0.0.0` | 监听地址 |
| `SERVER_PORT` | `8787` | 服务端口 |
| `MYSQL_HOST` | `127.0.0.1` | 数据库地址 |
| `MYSQL_PORT` | `3306` | 数据库端口 |
| `MYSQL_USER` | `todo` | 应用账号 |
| `MYSQL_PASSWORD` | `todo_day` | 应用密码 |
| `MYSQL_DATABASE` | `todo_day` | 库名 |
| `MYSQL_CONNECTION_LIMIT` | `5` | 连接池上限 |

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 数据库探活，返回本地时间 |
| GET | `/api/state` | 拉取全量状态；无数据返回 `{"state": null}` |
| PUT | `/api/state` | 整体保存状态；校验失败返回 400 与字段级错误 |

前端同步策略：启动先读 localStorage 立即渲染，再从服务端拉全量覆盖；此后每次变更先落本地缓存，再防抖 500ms 推送服务端；推送失败提示并保持本地。

## MCP 服务

`server/src/mcp/server.js` 是一个 stdio 传输的 MCP server，让 AI 助手直接管理待办，自然语言语义与网页录入一致。

```bash
cd server && npm run mcp
```

在 MCP 客户端注册 stdio server，命令：

```bash
node <项目路径>/server/src/mcp/server.js
```

工具一览：

| 工具 | 说明 |
| --- | --- |
| `getListTodo` | 按状态、日期桶、关键字、象限、部门、员工过滤读取 |
| `addItemTodo` | 自然语言新增，如「明天 交周报 !」 |
| `setStatusTodo` | 修改状态：待完成 / 进行中 / 已完成 |
| `patchItemTodo` | 改标题、日期、优先级、象限、关键字、备注 |
| `setAssignTodo` | 指派到部门或员工 |
| `removeItemTodo` | 按 id 批量删除 |
| `getListDept` / `getListEmp` | 读取部门 / 员工列表 |

## 目录结构

```
index.html              入口
src/
  main.tsx              React 挂载
  App.tsx               壳：侧边栏、视图切换、同步逻辑、导出
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
server/                 Fastify 后端（CommonJS）
  src/config.js         环境变量配置（带默认值）
  src/common.js         toSafeInt、formatLocalDateTime
  src/db.js             连接池 + 幂等建表
  src/repo/state.js     loadState / upsertState
  src/route/state.js    /api 路由 + 入参校验
  src/mcp/              MCP 服务（stdio）
  src/server.js         入口，托管 dist/
public/fonts/           Geist 字体
```

## 截图

> 待补充：四象限看板、月历视图、进度统计。

## 已知限制

- **无鉴权**：当前为单工作区，任何能访问服务的人共享同一份数据。多用户需加登录态并按用户隔离数据。
- **整体同步的并发覆盖**：两端同时编辑时，后保存者覆盖先保存者。数据量小可接受；冲突合并需引入版本号。
- MCP 工具调用串行执行；整状态替换模型下，MCP 写入与浏览器同时编辑存在覆盖风险。

## 路线图

- [ ] 多用户与登录鉴权
- [ ] 数据版本号与冲突合并
- [ ] 真实截图与演示视频

## License

[MIT](LICENSE)
