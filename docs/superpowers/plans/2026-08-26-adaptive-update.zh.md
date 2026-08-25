# DSH 原生自适应更新实施计划

[English](2026-08-26-adaptive-update.md) | 中文

> **执行要求：** 必须使用 `superpowers:executing-plans` 按任务逐项实施，步骤以复选框追踪。

**目标：** 先在小庄 DSH 本地最新版本上开发原生“自适应更新”插件，再由这个插件把产品适配到官方最新 master。

**架构：** 一个 Host/Client 原生插件启动独立于当前进程的稳定版 worker。worker 使用彼此分开的审查与候选 Git worktree、带影子 DSH Home 的稳定 Headless Agent、确定性候选验证，以及停止—快照—切换—重启事务，并在失败时自动恢复代码和数据。

**技术栈：** TypeScript、React、Cordis、Node 子进程与文件系统 API、Git worktree、Vitest、Playwright/Web 回放、CSS Modules、macOS 写时复制快照。

**规格：** [`docs/superpowers/specs/2026-08-26-adaptive-update-design.zh.md`](../specs/2026-08-26-adaptive-update-design.zh.md)

## 全局约束

- 必须先在本地提交 `d25f90205803ad5f9fa3db4b5b1aff8bdd5b5410` 上开发插件，再合入官方提交 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。
- 设置入口与页面标题严格使用“自适应更新”，页面不放一句话介绍。
- 审查和适配由当前稳定版 DSH 完成，候选代码不能修复自己。
- 切换前不触碰真实 DSH 数据，切换失败同时恢复代码和数据。
- 完成后不保留 worktree，最多保留一个上版本数据写时复制快照。

---

### 任务 1：持久化操作状态与自有清理

先为原子状态写入、schema 校验、单任务约束和受控清理编写失败测试，再实现 `types.ts`、`state.ts`、`retention.ts`。清理只能删除登记过的审查/候选/影子路径，不跟随符号链接，并且只保留一个快照。

### 任务 2：仓库审查与插件影响报告

使用真实临时 Git 仓库编写失败测试，构造本地产品提交、官方提交、重叠插件和文本冲突。实现有界子进程、精确 ref fetch、merge base/差异盘点、试合并、包/插件映射和一次性审查 worktree。

### 任务 3：稳定 Agent 审查与候选适配

先验证影子 Home 只复制 `.env`、`.credentials.yaml`、`settings.yaml`、`AGENTS.md`、`SYSTEM.md`，不复制 Session 和附件。再用脚本化稳定 Agent 编写 worker 失败测试，证明审查与适配使用两棵不同工作树，并且审查失败时绝不开始适配。

### 任务 4：确定性验证与安全切换

先验证未解决合并、任一检查失败、只有 Host 就绪或 Client 资源缺失都会阻止切换。再用临时 Git 仓库和假进程验证：脏 checkout 被拒绝、成功候选前移、launchd 自行拉起时不重复启动、真实就绪失败时恢复旧提交和数据目录。

### 任务 5：本机 Host API 与独立 worker

为仅限本机的状态读取、单任务启动、不支持的 checkout 和陈旧 worker 恢复编写失败测试。实现 `/plugins/ui-adaptive-update/api/state`、`/start`、仓库发现、任务文件、源码/构建 worker 启动和空闲检查，并通过真实 Cordis Loader 组合测试验证注册与卸载。

### 任务 6：原生设置页与手绘图标

先编写组件失败测试，锁定准确标题、无介绍语、空闲操作、审查阶段、受影响插件报告、失败恢复和完成状态。手绘 16 px 开放保护环/稳定内核 `currentColor` SVG，接入设置导航；实现轮询控制器、页面、中英文词典、语义 token CSS 与 Slot 注册。

### 任务 7：包装配与文档

补齐包 manifest、Host/Client 编译面、worker 独立产物、Web bundle 行与依赖、聚合引用；编写包级双语契约与 Agent Note，记录借鉴来源及放弃进程内热重载的原因。先通过插件定向测试、类型、构建、文档和 invariant 检查，再在没有合入官方代码的状态下提交插件。

### 任务 8：第一次真实自更新与发布门禁

在隔离 Web 端口启动本地插件并调用真实启动 API，先看到持久化审查报告并确认当前页面可用；然后由插件的稳定 Agent 适配官方提交，完成确定性验证、影子启动和安全切换。验收同端口的新 Client、既有测试对话、worktree 清理和单快照上限，再补齐根 `README.md`、`README.zh.md`、`README.i18n.yaml` 与 `PROJECT_CONTEXT.md`，执行预推送检查、提交并推送 `feat/adaptive-update`。
