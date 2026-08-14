# Project Context

## 1. 这个项目是干什么的

DeepSeek Harness（`dsh`）是 DeepSeek 开源的插件化 Agent Harness。用户通过 CLI 启动 Web 或 Headless profile；Cordis 按 bundle、profile patch 和插件配置组装模型适配器、工具、会话持久化、权限与 UI。当前仓库处于 developer preview，主要本地产品入口是 `dsh web`，默认在 `http://127.0.0.1:3080` 提供浏览器界面。

## 2. 代码结构是什么

- `apps/cli/`：`dsh` 命令行入口，负责 profile 启动、插件管理与 Web 模式分发。
- `apps/web/`：Vite/React Web 前端及真实浏览器测试、快照。
- `packages/core/`：Session、Agent、Agent Loop、System Prompt 与 Tools 等运行主干。
- `packages/host/`：Web Server、静态资源和 ApiProxy；浏览器的 `session.prompt` 从这里进入 Agent。
- `packages/llm/`：统一 LLM 接口以及 DeepSeek 等 Provider 的请求序列化和流式响应。
- `packages/client/`：浏览器运行时、会话输入、附件、布局和设置等 UI 插件。
- `packages/bundle/`、`packages/preset/`：可组合的默认能力与每会话 Agent 配置。
- `packages/session/`、`packages/attachment/`：会话日志、投影、持久化和图片附件存储。
- `examples/`、`apps/*/tests/`、`packages/*/*/tests/`：真实 composition、浏览器和包级回归测试。
- `docs/`、`.agents/notes/`：架构、测试政策、维护约束与重要变更说明。

核心消息流是：Web 会话输入 → Host ApiProxy → Agent inbox/Session log → Prompt 与工具组装 → LLM Adapter → Session 事件 → Web UI 投影。

## 3. 关键入口在哪里

- `apps/cli/src/bin.ts`：源码启动入口；本地 `pnpm dsh web` 和当前 launchd 服务均通过 tsx 加载它。
- `apps/cli/src/profile-boot.ts`：加载 profile、bundle 与 patch 层。
- `apps/web/src/main.ts`：浏览器应用启动入口。
- `packages/host/apiproxy/src/api-proxy.ts`：实现 `session.prompt` 等业务 RPC，并把消息交给 Agent。
- `packages/host/apiproxy/src/fetch/handler.ts`：把 `/api/*` HTTP 请求映射到 ApiProxy；实现异常会成为 HTTP 500。
- `packages/llm/llm-deepseek/src/serialize.ts`：把 Harness 消息与工具调用序列化为 DeepSeek Chat Completions 请求。
- `packages/core/agent-loop/src/`：执行 turn/step、模型请求和工具循环。
- `packages/client/ui-conversation/src/` 与 `packages/client/ui-attachment/src/`：Web 会话输入和原生图片附件交互。

## 4. 最近改了什么

### 2026-08-14 01:51 - 初始建档

- 本次任务：为现有 DeepSeek Harness 仓库补建项目上下文。
- 改了哪些文件：`PROJECT_CONTEXT.md`。
- 改了什么：记录产品用途、主要代码结构、消息主链路和关键入口。
- 为什么这样改：仓库此前缺少项目级交接文档，后续排查和修改需要先有可核验的导航层。
- 影响了哪些模块：仅文档，不影响构建或运行。

### 2026-08-14 02:06 - 修复视觉附件消息链路

- 本次任务：修复 Web 会话发送图片时的 HTTP 500，并确保纯文本 DeepSeek 模型能通过本机 `image_vision` 工具理解原生附件栏中的图片。
- 改了哪些文件：`packages/host/apiproxy/src/api-proxy.ts`、`packages/host/apiproxy/tests/api-proxy-models.spec.ts`、`packages/llm/llm-deepseek/src/serialize.ts`、`packages/llm/llm-deepseek/tests/serialize.spec.ts`、`packages/llm/llm-deepseek/README.md`、`packages/llm/llm-deepseek/README.zh.md`、`packages/llm/llm-deepseek/README.i18n.yaml`，以及本机 Web profile 插件 `~/.dsh/profiles/web/packages/vision-local/lib/index.js`。
- 改了什么：恢复 ApiProxy 在附件持久化路径需要的 `hasImage` 判定，但不再以文本模型能力为由拒绝图片消息；DeepSeek serializer 将图片块投影为 `attachment:<id>` 视觉工具注记；视觉插件改用正确的 `agent.id` 读取当前会话日志并物化附件；同步中英文说明并补充两条核心回归测试。
- 为什么这样改：此前删除图片拒绝门禁时误删了后续仍使用的变量，导致所有 `session.prompt` 在源码运行入口抛出 `ReferenceError`；修复该错误后，真实验收又发现插件读取了不存在的 `agent.sessionId`，导致附件虽然存在却无法交给视觉模型。
- 影响了哪些模块：Web 普通文本发送、原生图片附件发送、ApiProxy 附件持久化、DeepSeek 请求序列化、本机 `image_vision` 工具桥和相关文档；不增加新的发送按钮或用户操作步骤。
