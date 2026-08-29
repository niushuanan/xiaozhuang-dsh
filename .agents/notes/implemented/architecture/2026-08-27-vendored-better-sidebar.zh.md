# Agent Note：工作台侧边栏 vendor 为服务化的一等界面，并退役 Computer Use 浏览器桥接

Status: implemented

[English](2026-08-27-vendored-better-sidebar.md) | 中文

## Problem

产品一直没有按会话隔离的工作台：文件、diff、终端、浏览、后台任务与子代理活动要么躺在模型转录里，要么散落在一次性面板中；每个自研插件还各自发明 UI 扩展接缝。浏览走的是 Computer Use Chrome 桥接（扩展配对 + 每会话 Playwright 上下文），对多数「看页面」的任务而言过重。

## Decision

把 omdsh-dev/DSH-better-sidebar v0.17.0（MIT）vendor 进 `packages/workbench/better-sidebar`，作为 fork 的一等包深度适配，而不是 npm 安装：

- **服务化扩展点。** 内置 tab 与文件预览器和未来任何插件走同一个 `ctx.betterSidebar` 服务（`registerTab` / `registerFileViewer`）注册，带单调 `features` 能力清单、tab 生命周期回调与定向打开 `openTab(seed, scope)`。cordis augmentation 经 `import type {} from '@deepseek-ai/dsh-better-sidebar/client'` 可达（根导出刻意不合并——host 面无法解析 React 型 client 模块）。
- **按会话隔离的布局状态。** 每会话 `dsh-sidebar:v1:<id>` localStorage 持久化 + 全字段净化 + 跨会话宽度键 + `?dsh-sidebar-reset` 逃生通道。右侧栏 + 底部面板分栏树、自由悬浮窗、<768px 合并抽屉全部骑在同一个 reducer store 上。
- **终端后端改写为 fork 的 subprocess 接缝。** 上游直接使用 node-pty 的用法替换为 `ctx.subprocess.spawnTerminal`（transcript 环、park/重连宽限、每会话配额语义保留），`SubprocessTerminalHandle` 增加可选 `resize?()`（本地 node-pty 驱动实现）。UI 终端是用户动作、以用户权限运行；模型终端仍留在受 sandboxPolicy 治理的 `ctx.terminals` 接缝（`tool-terminal`）上，并镜像为只读侧边栏 tab（`agent-terminal`，`agent-terminal.read`/`agent-terminal.close` 带每会话归属校验）。上游 `terminal_*` 工具集保持未注册（`agentTerminalTools: false`），避免工具重复。
- **浏览器替换。** web-app bundle 不挂载 Computer Use 的 host/client 行（源码仍可用于恢复）；vendor 的沙箱 iframe 浏览器、协议分流外链拦截、嵌入拒绝探测与 `browserAllowedLoopback` 白名单共同组成浏览面。地址框提供显式的网址与直接搜索模式，并允许用户配置新标签页的默认值；直接搜索使用可在同一沙箱中显示结果的 Bing，网址模式继续执行协议与回环地址校验。禁止 framing 的站点会得到清晰的系统浏览器回退，不再尝试无效的强制 iframe 加载。这**部分取代**了[原生 Computer Use 的 Note](../../implemented/feature/2026-08-21-native-computer-use-and-browser-bridge.zh.md)：其中的桥接/隔离浏览器决策已经退役，桌面控制理由与恢复路径继续有效。`sidebar_open` 默认开启，模型可在调用方会话的侧边栏打开文件/文件夹/网页（按会话排队、断线重放）。
- **fork 约定合规。** 真实 Loader 组合启动测试（真实 webServer/web-app/session/tools/subprocess 树，围栏 200/403 断言）；测试文件名声明编译面（`*.client.spec.*`）；staged lint、包 invariant、两个 tsconfig 聚合全绿。bundle 单行挂载；live profile 补丁层同 id 再加一行，让 `watchUserPatches` 免重启热挂载。

## Consequences

- 工作台（资源管理器/编辑器/终端/Git/浏览器/后台任务/侧边对话）已经通过 profile 补丁热更新路径在运行实例上在线；删掉 profile 行即事务性回滚。
- `dsh-better-sidebar` 成为 fork 自有包：上游更新必须经过文档化的适配接缝重新移植（locale 字典形式、fork 服务面、chunk CSS 管线）。
- Web 组合不包含 `/computer` 桌面控制与 `/browser`（隔离 Playwright + 已连接桥接），因此不需要浏览器桥接扩展。恢复它们需要重新加入两行 bundle 挂载。
- 侧边卡片浏览器仍是 iframe，而不是 Chrome 引擎。它能使用允许嵌入的页面和搜索结果，但远端 `X-Frame-Options` 或 CSP `frame-ancestors` 策略即使在本地沙箱关闭后也优先生效；这些页面必须转到系统浏览器。
- 已知限制（沿用）：19 种第三语言词典与 better-locale 整合未带；设置页导航图标未带（fork 无契约）；生态插件目录空载；`ctx.betterSidebar` 的 host/client 类型传播需要 `/client` 导出。

## Alternatives considered

- **npm 安装 + 适配插件。** 被拒：fork 的 client 服务面差异足以让原版 bundle 行为错位（layout-push 选择器、locale 注册、sessions API），而且内部改写（subprocess 终端后端）需要源码在树内。
- **原生重写工作台。** 被拒：上游实现经数百个单测硬化（已全量移植），vendor 让 diff 可对照起源审查。
- **保留 Computer Use 桥接。** 主人否决：沙箱 iframe 浏览器以少得多的机制覆盖观看场景；桥接源码仍在仓库中可回滚。
- **使用 Google iframe 搜索。** 真实 Chromium 验证只返回 Google 的访问错误页，没有得到搜索结果，因此被拒绝。Bing 能在同一沙箱中显示结果列表，而且不需要增加浏览器进程或代理服务。
