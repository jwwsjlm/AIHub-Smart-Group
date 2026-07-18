# 帅API智能分组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将帅API性能页的模型维度分组推荐并入现有单文件 Tampermonkey 脚本。

**Architecture:** 保留 AIHub `Controller` 不变，增加独立的帅API数据适配函数和 `ShuaiController`。入口按 hostname/path 路由；帅API通过同源 fetch 读取性能接口，使用独立 DOM 前缀和设置存储键。

**Tech Stack:** Tampermonkey userscript, browser Fetch API, DOM API, Node test runner。

---

### Task 1: 扩展脚本元数据和纯函数

**Files:**
- Modify: `aihub-smart-group.user.js`
- Test: `tests/aihub-smart-group.test.cjs`

- [ ] 增加帅API默认配置、数据归一化、模型选项和排序函数。
- [ ] 增加测试覆盖倍率排序、模型过滤、可靠性阈值、警告排除和空数据。
- [ ] 保持导出的 AIHub 函数兼容。

### Task 2: 实现帅API控制器和悬浮卡片

**Files:**
- Modify: `aihub-smart-group.user.js`

- [ ] 增加同源 `/api/perf-metrics/groups` 请求适配，处理 `data.groups`、数组和错误响应。
- [ ] 增加可最小化悬浮 UI，包含时间窗、模型选择、阈值、警告开关和刷新。
- [ ] 增加每分钟刷新、错误提示、最低倍率/可靠推荐/候选列表渲染。

### Task 3: 路由、文档和验证

**Files:**
- Modify: `aihub-smart-group.user.js`
- Modify: `README.md`

- [ ] 将入口路由到 AIHub 或帅API性能页，更新版本和中文元数据。
- [ ] 更新安装说明和帅API功能说明。
- [ ] 运行 `node --check` 与 `node --test`，确认工作区变更仅限目标文件。
