# 回复的要求

- 每个句子不超过30个字
- 一个句子只讲一件事
- 同一个东西，从头到尾用同一个词
- 用主动语态:写清楚谁去做
- 不确定的地方，直接说不确定

# GIT提交的要求

- 所有 Git 提交消息都必须包含清晰、准确的中文描述。
- 使消息尽可能简短
- 使用中文回答
- 使用常规提交格式
- 使用项目符号进行多项更改

# 编码约定

## 通用

- 命名约定只约束项目自己起的名字
- 范围：变量名、方法名、目录名、文件名
- 目录名和文件名不用复数
- 目录和文件名多个字母的话用用符号用'-'做分隔全小写
- 变量名和方法名禁止使用复数形式
- starrocks 是数据库产品名 StarRocks，可以使用

## Node.js

- 集合类命名用后缀表达结构：List / Map / Set / Arr
    - 数组/列表：`userList`
    - 键值映射：`userMap`
    - 集合：`userSet`
- 方法名用动词 + 单数名 + 后缀，例如：`getListUser()`、`getInfoUser()`、`getPageUser()`
- 其他常用后缀：数量 `userCount`、分页 `userPage`、查询条件 `userQuery`、详情 `userDetail`
- 类名保持单数（如 `User`），实例变量用 `userList` 等形式
- 异步操作：用 async/await；不用回调或链式调用
- 配置：环境变量集中在 `getXxxConfig()` 读取；必填项缺失直接抛错；带默认值
- 错误处理：不静默吞错；错误信息带上下文（文件名、序号、字段名）

- 时间：时区处理用 luxon；锁死 Asia/Shanghai，不用运行环境本地时区
- 业务时间戳约定为上海 wall-clock 的绝对毫秒；换算工具集中在 `src/lib/todo.js`
- 文件写入：用临时文件 + 重命名的原子写
- 注释：中文注释解释"为什么"；不写复述代码的注释
- 模块：使用 CommonJS；内置模块加 `node:` 前缀（如 `require('node:fs')`）
- 文件首行写 `'use strict'`
- 字符串用单引号；语句末尾写分号
- 大数字转数值前用 `toSafeInt` 校验（见 `src/common.js`）
- 本地时间格式化用 `formatLocalDateTime`（见 `src/common.js`）
- 原子写统一用 `atomicWriteJson`（见 `src/common.js`）
- 大数字：一律按字符串承载；转数值前先校验安全整数范围