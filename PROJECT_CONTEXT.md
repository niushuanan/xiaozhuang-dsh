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
- `packages/client/ui-settings-models/src/client/`：模型提供方、动态模型目录和模型能力分类的设置入口；`inputModalities` / `input` 同时驱动页面显示与运行时图片路由。
- `packages/core/agent-loop/src/`：执行 turn/step、模型请求和工具循环。
- `packages/client/ui-conversation/src/` 与 `packages/client/ui-attachment/src/`：Web 会话输入和原生图片附件交互。

## 4. 最近改了什么

### 2026-08-21 18:27 - 增加可编辑的纯文本与原生视觉模型分类

- 本次任务：在现有“设置 → 模型”页面增加模型视觉能力分类，让当前模型和插件新增的动态模型都能由用户明确标记为“纯文本”或“原生视觉”，并由同一配置决定图片走 `image_vision` 还是模型原生输入。
- 改了哪些文件：`packages/client/ui-settings-models/src/client/ModelCapabilitySelect.tsx`、`DeepSeekModelsEditor.tsx`、`ModelListEditor.tsx`、`ModelsSection.module.css`、`locales.ts`，两组组件测试、该包中英文 README 与 `README.i18n.yaml`；更新本机 `~/.dsh/settings.yaml` 和本文件；删除本次升级创建的 `~/.dsh/backups/pre-dsh-0.1.1-rc.1-20260821/`。
- 改了什么：每个 DeepSeek 与 pi-ai 模型行都直接显示能力选择框；“纯文本”写为 `[text]`，“原生视觉”写为 `[text, image]`；新增和端点获取的动态模型默认归为纯文本；当前 DeepSeek、Kimi、GLM 与 Qwen 模型补齐显式能力配置。页面继续写适配器原生的 `inputModalities` / `input` 字段，没有新增第二套路由状态。
- 为什么这样改：模型名称或插件来源不能可靠代表视觉能力；让用户在模型目录中维护能力事实，才能在新模型出现时无需改代码，并避免把图片误发给纯文本模型或让视觉模型重复调用工具。
- 影响了哪些模块：模型设置 UI、DeepSeek 与 pi-ai 动态模型目录、本机模型能力配置，以及既有原生视觉／视觉插件路由判定；不改变凭据、会话、附件和其他插件。
- 验证：6 个相关测试文件共 319 项通过，客户端类型构建、包构建、官方生产构建、定向 lint 与中英文配对检查通过；真实 3080 页面显示 DeepSeek V4 Flash/V4 Pro、Kimi、GLM-5.3 为纯文本，DeepSeek Vision Exp 与 Qwen3.8-Max 为原生视觉。真实新增模型默认纯文本，切换原生视觉后成功写入 `[text, image]`，随后已删除验收模型并确认设置无残留。

### 2026-08-21 - 升级至 0.1.1-rc.1 并打通原生视觉与文本模型视觉插件

- 本次任务：把本机 DSH 从 `0.1.0-rc.7` 升级到官方 `0.1.1-rc.1`（官方提交 `528c682e061696f5a160f363f236ecbf53cbd006`），按 DeepSeek 官方接口文档配置 V4 Flash、V4 Pro 和 V4 Flash Vision Exp，并让 GLM-5.3、V4 Pro 两个纯文本模型继续通过 `image_vision` 使用图片。
- 改了哪些文件：合并官方 `0.1.1-rc.1` 全部仓库变更；适配 `packages/host/apiproxy/src/api-proxy.ts`、`packages/host/apiproxy/tests/api-proxy-models.spec.ts`、`packages/llm/llm-deepseek/src/adapter.ts`、`packages/llm/llm-deepseek/src/serialize.ts` 及其测试、`packages/llm/llm-pi-ai/src/adapter.ts`、`packages/llm/llm-pi-ai/src/context.ts` 及其测试、`packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx`、`packages/client/ui-conversation/src/client/skeleton/PermissionSelect.tsx`、DeepSeek 中英文 README 与配对清单；更新本机 `~/.dsh/settings.yaml` 和 `~/.dsh/profiles/web/packages/vision-local/`；更新本文件。
- 改了什么：视觉模型保留官方原生 `image_url` 输入；纯文本模型把图片稳定投影为带 `attachment:<id>` 的工具提示，由 `image_vision` 读取原附件；移除 Host 和 DeepSeek adapter 对纯文本模型图片消息的前置拒绝；配置 DeepSeek 1M 上下文、384K 最大输出及视觉模型图片输入能力；视觉插件升级到 1.1.0，并明确区分原生视觉和工具桥两条路径。
- 为什么这样改：新版本已经提供 DeepSeek 原生视觉通道，但 GLM-5.3、V4 Pro 等纯文本模型仍需使用现有视觉插件；两条通道必须并存，才能既使用新模型，又不破坏已有模型和插件工作流。
- 影响了哪些模块：DSH 官方 0.1.1-rc.1 全部上游能力、Web 图片发送、Host 附件持久化、DeepSeek/pi-ai 模型适配、会话导航和权限图标、本机模型目录与 `image_vision` 插件；没有清空或迁移现有会话、附件和其他插件。
- 验证：4 个相关测试文件共 158 项通过，官方生产构建和 Host 重建通过；真实 3080 页面中，GLM-5.3 与 V4 Pro 均实际调用 `image_vision` 并识别出截图标题“模型”，DeepSeek V4 Flash Vision Exp 不调用插件即可原生识别同一图片。

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

### 2026-08-18 17:57 - 升级本机 DSH 至 rc.7 并适配插件

- 本次任务：把本机源码运行的 DeepSeek Harness 从 `0.1.0-rc.5` 升级到官方 `0.1.0-rc.7`（官方提交 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`），保留现有会话、附件、设置和 `team-work` / `vision-local` 插件，并完成真实产品路径验收。
- 改了哪些文件：合并官方 rc.7 的仓库变更；新增 `docs/superpowers/specs/2026-08-18-dsh-rc7-upgrade-design.md` 与 `docs/superpowers/plans/2026-08-18-dsh-rc7-upgrade.md`；适配 `packages/host/apiproxy/tests/api-proxy-models.spec.ts` 和 `packages/client/ui-conversation/tests/skeleton.client.spec.tsx`；更新本机插件 `~/.dsh/profiles/web/packages/team-work/lib/index.js`、`~/.dsh/profiles/web/packages/team-work/package.json`，并新增 `~/.dsh/profiles/web/packages/team-work/test/plan-mode-lifecycle.test.mjs`；更新本文件。
- 改了什么：ApiProxy 图片测试桩补齐 rc.7 新增的批量 `saveImages` 契约；子 Agent 面包屑测试对齐本地“返回主 Agent”交互；Team Work 1.0.1 在 `agent/created` 和第一条 `agent/pre-step` 边界补同步，确保新会话的 preset realm 就绪后开启 plan mode；`vision-local` 无需改代码，已按 rc.7 的附件、草稿图片和工具链动态验证兼容。
- 为什么这样改：rc.7 的 Agent preset/plan mode 生命周期比 rc.5 更严格，新会话可能先记录 `permission/preset`、再注册 Agent，且会话内 `planMode` 服务到首个 pre-step 才确定可用；只监听权限事件会让第一条 Team Work 请求漏开计划模式。
- 影响了哪些模块：源码启动器和官方 rc.7 全部上游能力、ApiProxy 图片测试、会话层级导航、本机 Team Work 计划先行与子 Agent UI、本机视觉附件桥；没有迁移或清空 `~/.dsh` 数据，也没有新增并行 DSH 服务。
- 验证：`pnpm run typecheck`、`pnpm run build`、ApiProxy/DeepSeek 图片定向测试 40 项、`ui-conversation` 430 项和 Team Work 生命周期测试 2 项通过；全量单测 13,496 项通过，12 项在全套并发时超时但均独立复跑通过。3080 原位重启后，旧历史会话可打开，新文本会话返回 `rc7-ok`，Team Work 新会话进入 `exit_plan_mode` 计划待审，历史子 Agent 可通过“返回主 Agent”回到父会话，正常尺寸截图经 `image_vision` 识别出 `Settings`。
