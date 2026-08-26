# Project Context

## 1. 这个项目是干什么的

Xiaozhuang DSH 是基于 DeepSeek Harness（`dsh`）持续迭代的社区插件增强发行版，保留上游开源 Agent Harness 与 Cordis“一切皆插件”的运行主干，并增加 Computer Use、模型用量、会话控制、选中引用、长期记忆、外部智能体和并行 worktree 等本地生产能力。用户通过 CLI 启动 Web 或 Headless profile；Cordis 按 bundle、profile patch 和插件配置组装模型适配器、工具、会话持久化、权限与 UI。当前仓库仍跟随上游 developer preview，主要本地产品入口是 `dsh web`，默认在 `http://127.0.0.1:3080` 提供浏览器界面。

## 2. 代码结构是什么

- `apps/cli/`：`dsh` 命令行入口，负责 profile 启动、插件管理与 Web 模式分发。
- `apps/web/`：Vite/React Web 前端及真实浏览器测试、快照。
- `packages/core/`：Session、Agent、Agent Loop、System Prompt 与 Tools 等运行主干。
- `packages/host/`：Web Server、静态资源和 ApiProxy；浏览器的 `session.prompt` 从这里进入 Agent。
- `packages/llm/`：统一 LLM 接口以及 DeepSeek 等 Provider 的请求序列化和流式响应。
- `packages/client/`：浏览器运行时、会话输入、附件、布局和设置等 UI 插件；`ui-chat` 提供不绑定工作区与执行权限的原生纯聊天入口，`ui-composer-add-menu` 为工作会话提供命令／插件／Skill，为纯聊天提供文件与图片上传，`ui-skill-manager` 提供原生 Skill 管理、浏览与自适应导入，`ui-plugin-catalog` 统一承载“小庄的插件”目录、启停和选择性导出。
- `packages/memory/`：全局双文档记忆、修订、AI 维护、定时扫描与相关召回插件。
- `packages/session-query/`：会话查询与导出插件；当前同时承载原始 Session 记录和面向普通用户的对话长图导出。
- `packages/bundle/`、`packages/preset/`：可组合的默认能力与每会话 Agent 配置。
- `packages/session/`、`packages/attachment/`：会话日志、投影、持久化和图片附件存储。
- `examples/`、`apps/*/tests/`、`packages/*/*/tests/`：真实 composition、浏览器和包级回归测试。
- `docs/`、`.agents/notes/`：架构、测试政策、维护约束与重要变更说明。

核心消息流是：Web 会话输入 → Host ApiProxy → Agent inbox/Session log → Prompt 与工具组装 → LLM Adapter → Session 事件 → Web UI 投影。

## 3. 关键入口在哪里

- 本机完整 checkout 位于 `/Users/zhuanghongkai/Desktop/迭代DSH/xiaozhuang-dsh`；`~/.local/bin/dsh` 与 `com.deepseek.harness.web` LaunchAgent 都从这里启动 3080。旧的 `/Users/zhuanghongkai/ZCodeProject/deepseek-harness` 只保留指向新位置的兼容链接，供历史会话继续解析原工作目录。
- `apps/cli/src/bin.ts`：源码启动入口；本地 `pnpm dsh web` 和当前 launchd 服务均通过 tsx 加载它。
- `apps/cli/src/profile-boot.ts`：加载 profile、bundle 与 patch 层。
- `apps/web/src/main.ts`：浏览器应用启动入口。
- `packages/host/apiproxy/src/api-proxy.ts`：实现 `session.prompt` 等业务 RPC，并把消息交给 Agent。
- `packages/host/apiproxy/src/fetch/handler.ts`：把 `/api/*` HTTP 请求映射到 ApiProxy；实现异常会成为 HTTP 500。
- `packages/llm/llm-deepseek/src/serialize.ts`：把 Harness 消息与工具调用序列化为 DeepSeek Chat Completions 请求。
- `packages/client/ui-model-selection/src/client/`：会话模型与推理强度选择入口；切换模型时根据该模型公布的强度列表选择最高档，同一模型内仍允许手动调档。
- `packages/client/ui-settings-models/src/client/`：模型提供方、动态模型目录和模型能力分类的设置入口；`inputModalities` / `input` 同时驱动页面显示与运行时图片路由。
- `packages/core/agent-loop/src/`：执行 turn/step、模型请求和工具循环。
- `packages/core/system-prompt/src/index.ts`：组装有序 system 段，并实施 complete persona、用户 authoritative System Prompt、受保护所有者段和最终渲染约束。
- `packages/context/agent-instructions/src/index.ts`：逐模型步骤读取 `$DSH_HOME/SYSTEM.md` 与 `$DSH_HOME/AGENTS.md`，同时维护项目级 `AGENTS.md`／`CLAUDE.md` 的低权限工作区上下文。
- `packages/client/ui-settings-general/src/`：通用设置、`SYSTEM.md` 编辑器及其本机 Host API；文件不存在时直接暴露当前 Web 基础 System Prompt。
- `packages/client/ui-adaptive-update/src/`：原生“持续适配”Host/Client 入口；支持主动更新和六小时官方仓库监控，每次候选都由窄范围 Agent 做兼容处理，再完成候选构建、空闲切换、数据快照与自动回滚。
- `packages/client/ui-composer-add-menu/src/` 与 `packages/client/ui-commands/src/`：工作会话输入框的“命令、插件与技能”统一入口、纯聊天的图片／可读文本文件上传，以及按 Session 发布的官方命令目录；点击命令只把 `/命令` 写入草稿，不会立即执行。
- `packages/client/ui-skill-manager/src/`：原生“Skill 管理”设置页、工作 Session 作用域目录解析、纯聊天时的最近工作目录回退、同页文件预览，以及文件／文件夹／ZIP／GitHub 的固定低成本模型自适应导入与个人目录原子替换。
- `packages/client/ui-plugin-catalog/src/`：原生“小庄的插件”Host/Client 入口；闭合能力目录包含“持续适配”等可独立启停／导出的能力，不收录输入框加号等产品基础交互，并把用户所选插件打成带 AI 安装说明、Cordis 组装信息和逐文件哈希的 ZIP。
- `packages/client/ui-chat/src/client/` 与 `apps/cli/config/agent-presets/chat/`：原生“开始聊天”入口、空白聊天复用和纯聊天 Agent 能力边界；会话不绑定工作区，不暴露工作模式、Agent 预设、命令／Skill 或执行权限，但保留图片与小型可读文本文件上传。
- `packages/client/ui-conversation/src/` 与 `packages/client/ui-attachment/src/`：Web 会话输入和原生图片附件交互。
- `packages/client/ui-multi-window/src/client/`、`packages/client/runtime/src/client/window-context.ts` 与 `ui-conversation` 的 `conversation.session.panes`：当前页面多对话分屏、每块隔离导航／草稿，以及副块精简布局入口。
- `packages/client/ui-selection-actions/src/client/`：DSH 会话划词、当前草稿引用、来源编号、同项目侧边聊天和主动记忆入口。
- `packages/memory/memory-system/src/`：产品中显示为“长期记忆”的固定 `~/.dsh/memory/` 双文档、以单调游标增量推进的静默期模型维护（会话安静后整理、启动补扫、失败记录可见、设置页可手动立即整理）、设置页 API 和 `agent/pre-step` 相关召回。
- `packages/computer-use/computer-use/src/browsers.ts` 与 `assets/browser-bridge/service-worker.js`：浏览器 Agent 的结构化网页选区、元素和有界 DOM 证据入口。
- `packages/session-query/session-log-export/src/client/`：会话头部“导出对话”菜单、原始记录下载控制器，以及只保留用户问题和助手正文的单张 PNG 长图生成入口。

## 4. 最近改了什么

### 2026-08-27 05:30 - 分段胶囊白底滑丸（Token 修复已端到端验证）

- 本次任务：用户认为白底分段胶囊不合适，提出新样式（大胶囊白底、两个小胶囊黑底白字、选中段为黑药丸、未选中边白底黑字）并要求切换像流水一样自然平移；同时要求手动刷新 Token 用量表。
- 改了哪些文件：`packages/client/ui-sidebar` 的 `SidebarRoot.tsx` 与 `SidebarRoot.module.css`、`packages/client/ui-chat/src/client/ChatAction.module.css`；侧栏测试断言同步。
- 改了什么：分段容器改为浅色底 + 一枚可滑动的墨黑药丸（`.modeThumb`，绝对定位，宽 50%，按 `data-position` 在左右两座之间 `translateX` 平移，`transition: transform 220ms`）；两段为纯文字（宽态），选中段文字变白色盖在药丸上，未选中段黑字直接衬白底，hover 浅灰；折叠窄栏隐藏药丸、保留墨底/透明图标段。Token 手动刷新无需额外动作：新进程启动即完成首次刷新，b 槽 05:17:13 报告中 03-05 桶已出现全部 DSH 用量（clients=dsh）。
- 为什么这样改：药丸平移把“模式切换”从状态跳变变成物理滑动，符合分段控件直觉；白底容器与上一轮的浅色页面背景协调。
- 影响了哪些模块：仅分段胶囊的呈现与动效；模式判定、点击语义、槽契约零变化。ui-sidebar/ui-chat 在纯聊天（06）闭包，主仓推送后需同步 `dsh-pure-chat`。
- 验证：sidebar-root 7/7（新增 thumb 左右位置断言）、styles 4/4、ui-chat 2/2；client 类型检查通过；Token 修复经真实运行验证（03 桶 233 条 DSH、04/05 桶 codex+dsh 合并）。

### 2026-08-27 05:10 - Token 总览修复 DSH 用量丢失 + 侧栏工作模式分段胶囊

- 本次任务（一）：用户反馈 Token 总览“用量趋势”空白——审查发现 DSH 会话用量整体丢失：会话扫描 NDJSON 输出约 647KB，宿主插件的 `appendOutput` 按 64KB 截断，被切断的中间行让 `ndjsonSessions` 的 `JSON.parse` 无容错抛错，随后被 `catch { sessions = [] }` 静默吞掉，最终趋势图只剩 Codex 用量。
- 改了哪些文件（一）：`~/.dsh/profiles/web/packages/token-overview/lib/index.js`（`appendOutput` 支持按调用设置 captureLimit、扫描调用改无上限、`ndjsonSessions` 逐行容错并导出）与 `test/host.test.mjs`（新增容错用例）。
- 改了什么（一）：扫描输出是数据本体不再截断；单条坏行只丢自己、绝不丢整份扫描。插件测试 8/8 通过（新增容错用例）。
- 本次任务（二）：用户不喜欢侧栏“开始工作 + 开始聊天”两个堆叠胶囊，要求合并为一个分段控件（左 Agent & Coding、右聊天）。
- 改了哪些文件（二）：`packages/client/ui-sidebar` 的 `SidebarRoot.tsx`、`SidebarRoot.module.css`、`locales.ts`、`contract/slots.ts` 与测试；`packages/client/ui-chat` 的 `ChatAction.tsx`、`ChatAction.module.css`。
- 改了什么（二）：宽态渲染一个墨色分段胶囊（延续上一轮黑底白字），左段“Agent & Coding”启动普通会话、右段“聊天”由 `sidebar.primary.action` 槽贡献；选中段白药丸反色、跟随当前会话是否纯聊天（`agentPreset === 'chat'`）实时切换；折叠窄栏退化为两个 36px 图标段（选中段墨底白图标）。槽契约新增 `segment`/`active` 两个可选 owner 字段，单一消费者 ui-chat。
- 为什么这样改：分段切换器把“两个动作”收敛为“一个模式选择”，与当前会话状态绑定，层级和直觉都更接近系统级分段控件。
- 影响了哪些模块：仅侧栏主操作区与纯聊天入口的呈现/契约字段；会话列表、工作区浏览、页脚零变化。ui-sidebar 与 ui-chat 都在纯聊天（06）闭包，token-overview 属编号 16 映射，主仓推送后需同步 `dsh-pure-chat` 与 `dsh-token-overview`。
- 验证：sidebar-root 7/7、pointer-scrollbars 7/7、styles 4/4、ui-chat 2/2、token-overview 8/8；client face 类型检查通过；sidebar-snapshot 4 项仍为已记录的预存红线。

### 2026-08-27 04:35 - 修复鲸少女拖动“刹不下来”

- 本次任务：用户反馈拖动鲸少女后松开鼠标，她仍跟随光标移动，必须再点一下才能解除。
- 改了哪些文件：`packages/client/ui-product-companion/src/client/ProductCompanion.tsx`（松手早退分支与 window 移动监听）；`tests/product-companion.client.spec.tsx` 新增兜底用例。
- 改了什么：拖动手势中角色 div 的 `pointerup` 早退分支调用了 `stopPropagation`，原生事件被拦在冒泡路上，挂在 window 的“松手提交并清理”监听永远收不到——`dragState` 残留、移动监听继续跟手，下次点击才重置。去掉该拦截（提交权完全归 window 监听），并给 window 移动监听加兜底：`buttons === 0`（按键已不在）即以松开前最后一次拖动位置提交并收尾，覆盖一切被吞的 pointerup（含系统级丢失）。提交语义为“最后真实拖动位置”，无按钮事件不写入。
- 为什么这样改：拖动手势的释放权必须收不到事件也能恢复；早退分支的本意（不触发穿透点击）已由 finish 的 suppress 机制承担，拦截是冗余且有害的。
- 影响了哪些模块：仅拖动手势的释放可靠性；拖动几何、泊位持久化、点击/双击/穿透手势零变化。触达编号 05 仓库 `niushuanan/dsh-whale-girl`，主仓推送后需同步。
- 验证：包测试 45/45（新增“pointerup 被吞后 buttons=0 兜底提交且之后移动不再跟手”用例）。

### 2026-08-27 04:25 - 含图片的排队消息支持编辑（图片保留，只改文字）

- 本次任务：用户反馈排队消息一旦带图片就无法编辑，需要修复。
- 改了哪些文件：`packages/host/apiproxy/src/api-proxy.ts`（`updateQueue` edit 应用语义）、`packages/client/ui-conversation/src/client/queue/QueueDock.tsx`（解锁条件与编辑初值）、`tests/queue-dock.client.spec.tsx` 用例更新、新增 `packages/host/apiproxy/tests/api-proxy-queue-edit.spec.ts`。
- 改了什么：edit 的 wire 契约保持不变（仍只收纯文本），服务端应用时改为**保留原消息全部非文本块**——图片块原样跟随，替换文本占据第一个原文本块位置并合并多余文本块；Client 解锁条件从“纯文本”放宽为“含任意文本块”，编辑器初值取消息文本部分，纯图行仍锁定（无字可编）。
- 为什么这样改：旧实现用整体替换 content 的语义，编辑必然丢图，于是服务端以 `QUEUE_EDIT_NON_TEXT` 硬拒、UI 整行禁用；“只改文字、图片不动”才是编辑含图消息的直觉。
- 影响了哪些模块：队列编辑语义与 dock 解锁面；队列其余操作（删除/插话/折叠）与消息流零变化。apiproxy 属宿主核心不在插件映射；ui-conversation 在纯聊天（06）闭包，主仓推送后需同步 `dsh-pure-chat`。
- 验证：queue-dock 19/19（混合行可编辑、纯图锁定、wire 仍纯文本），新增 host 侧三用例（混合行图保留文本替换、纯文本行行为不变、非文本 payload 仍拒），全仓 typecheck 通过。

### 2026-08-27 04:05 - “开始工作／开始聊天”改为黑底白字

- 本次任务：用户反馈侧栏“开始工作”与“开始聊天”两个入口按钮白底灰边偏丑，要求 icon 与文字白色、黑底、去灰边。
- 改了哪些文件：`packages/client/ui-sidebar/src/client/SidebarRoot.module.css`（`.newSession`）与 `packages/client/ui-chat/src/client/ChatAction.module.css`（`.action`）。
- 改了什么：两处按钮从 `button-elevated-fill` 白底 + `border-l2` 灰边 + 主色字，改为 primitives 主按钮同一组 token——`button-primary-fill` 墨底、`label-primary-foreground` 反色字（浅色主题黑底白字、深色主题自动反转）、无边框（transparent），hover 从浮动灰改为 `button-primary-hover`；图标随 `currentColor` 一并变白。折叠态/窄栏的透明覆盖样式保持不变。
- 为什么这样改：两个入口是主动作，理应使用与 primitives primary 一致的实心墨底层级；灰边白底是次级按钮语言，层级错位且显平淡。
- 影响了哪些模块：仅两个入口按钮的配色；尺寸、圆角、布局、折叠态与 rail 态零变化。ui-sidebar 与 ui-chat 都在纯聊天（06）闭包内，主仓推送后需同步 `dsh-pure-chat`。
- 验证：ui-chat 8/8、ui-sidebar 21/25（4 个失败为 sidebar-snapshot 预存红线，与两轮前 test:gui 记录的名单一致，非本次引入）。

### 2026-08-27 03:55 - 模型用量面板秒开：磁盘缓存 + 先显后刷

- 本次任务：用户反馈点开“模型用量”卡片每次都要缓冲很久。
- 改了哪些文件：`packages/client/ui-provider-quota/src/index.ts`（缓存策略重写）、`src/client/QuotaAction.tsx`（过期静默补刷 effect）、双语 README 与配对记录、新增 `tests/usage.host.spec.ts`、`tests/quota-action.client.spec.tsx` 新用例。
- 改了什么：快照从“仅进程内存 5 分钟”升级为三层——内存 5 分钟 TTL、磁盘镜像 `~/.dsh/provider-quota-cache.json`（进程启动即预读、原子写）、过期条目按 stale-while-revalidate 响应（立即返回旧值 + 后台重采集，采集完成前“200 即已落盘”）；只有 `?force=1` 与彻底冷启动（无任何缓存）才在关键路径上现场采集。Client 打开面板收到过期快照时自动静默补一次强刷，数字原地更新、无转圈。
- 为什么这样改：旧实现重启后缓存清零、过期即阻塞，最慢厂商（GPT 走 Codex app-server 冷启动握手）把整卡拖住十几秒；“点开立刻有数、后台悄悄变新”才是用量面板的正确直觉。
- 影响了哪些模块：仅 ui-provider-quota 的缓存与加载时序；四家数据解析、密钥解析、面板布局零变化。触达编号 14 仓库 `niushuanan/dsh-model-usage`（发布源 `model-usage`），主仓推送后需同步。
- 验证：包测试 10/10（新增宿主路由三用例：冷采集落盘、过期磁盘秒回 + 后台刷新落盘、坏缓存冷启动；新增 client 过期秒显 + 静默强刷用例）；client face 类型检查通过。

### 2026-08-27 03:45 - 插件目录实时显示用户改过的精灵名

- 本次任务：用户把鲸少女改名为“落溪”后，设置页侧栏变 了，但“小庄的插件”目录里仍显示静态默认名“鲸少女”——产品 bug。
- 改了哪些文件：`packages/client/ui-plugin-catalog/src/client/PluginCatalogSection.tsx`；`tests/components.client.spec.tsx` 新增两用例。
- 改了什么：目录组件挂载时派生一份行清单，`product-companion` 行显示与 ui-product-companion 共享的持久化名（`dsh.product-companion` 记录的 `displayName`，去空白、缺省或坏记录回退默认“鲸少女”）；搜索也按该名匹配。设置壳本就按激活 section 惰性挂载，改名后切到目录页即见新名，无需重启。宿主侧 `catalog.ts` 导出元数据保持产品默认名（导出说明面向另一台 DSH，不带个人命名）。
- 为什么这样改：目录此前是一份静态清单，与侧栏的动态 label 数据源不一致；两侧读取同一持久化契约后，用户可见名在所有目录面一致。
- 影响了哪些模块：仅插件目录的鲸少女行显示与搜索；开关状态、导出选择、其余行零变化。ui-plugin-catalog 不在 11 个固定发布映射内，无需同步独立仓库。
- 验证：包测试 10/10（新增改名显示 + 搜索命中、坏记录回退两用例）。

### 2026-08-27 03:40 - 排队消息支持多行显示与换行编辑

- 本次任务：用户反馈排队消息永远单行截断，要求允许多行空间。
- 改了哪些文件：`packages/client/ui-conversation/src/client/queue/QueueDock.tsx` 与 `QueueDock.module.css`；`tests/queue-dock.client.spec.tsx` 新增两用例。
- 改了什么：预览从 `nowrap`+ellipsis 改为换行显示（保留排队文本自带换行，`pre-wrap` + 3 行封顶省略号），行高从固定 36px 改为 `min-height` 随内容生长，列表滚动上限 180→240px；行内编辑器从单行 `<input>` 换成自适应 `<textarea>`（Enter 保存、Shift+Enter 换行、Escape 取消，与主输入框键位一致）。
- 为什么这样改：排队消息是用户撰写的内容，单行截断让长消息不可读；多行封顶 3 行防止单条占满整个列表。
- 影响了哪些模块：仅排队 dock 的显示与编辑形态；队列操作（编辑/删除/插话）、折叠逻辑与消息流零变化。ui-conversation 不在 11 个固定发布映射内；纯聊天闭包是否携带该包已核对（见验证）。
- 验证：queue-dock 19/19 与 input-bar 82/82 通过（新增多行渲染与 Shift+Enter 用例）。

### 2026-08-27 03:35 - 划词菜单一次点击即关

- 本次任务：用户反馈划词后的“引用／记忆／侧边聊天”浮层停留过久，点击其他位置需要两次才能关掉。
- 改了哪些文件：`packages/client/ui-selection-actions/src/client/SelectionActions.tsx` 的 `dismiss` 监听；`tests/selection-actions.client.spec.tsx` 新增回归用例。
- 改了什么：删除关闭条件里的“选区已塌陷”判断——浏览器在松开点击时才塌陷选区，`pointerdown` 时选区必然展开，旧条件让第一次点击永远关不掉、第二次才生效。现在菜单外任意一次按下立即关闭；拖选新文字的流程不受影响（按下关旧菜单、松开捕获到新选区后菜单重现），Shift/方向键扩展与 Escape 关闭路径不变。
- 为什么这样改：关闭守卫建立在错误的事件时序假设上；“菜单外一次按下即关闭”是浮层控件的标准直觉，旧守卫想保护的“新拖选”场景实际由松开时的重新捕获覆盖。
- 影响了哪些模块：仅 ui-selection-actions 的划词浮层与记忆结果条关闭时机；三个动作、引用标记、侧边聊天交接均不变。触达编号 08+09 仓库 `niushuanan/dsh-selection-memory`（selection-actions 侧），主仓推送后需同步。
- 验证：包测试 17/17（含新增“选区展开态首次外部按下即关、新选区重开”回归用例）。

### 2026-08-27 03:30 - 鲸少女支持沿输入框左右拖动并记忆相对泊位

- 本次任务：用户要求桌面精灵（鲸少女）能在输入框上左右拖动，且输入框此后切换位置/宽度时，她出现在“最后被放置的相对位置”。
- 改了哪些文件：新增 `packages/client/ui-product-companion/src/client/composer-anchor.ts`（三个纯几何函数）；`store.ts` 删除无消费方的 `position`/`home`/`setPosition`/`setHome`/`resetPosition` 与 `CompanionHabitat`，新增持久化 `composerOffsetRatio`（0–1，缺省 1 = 历史右泊位）；`ProductCompanion.tsx` 锚定改为按比例推导并实现 window 级拖动手势（5px 阈值区分点击、拖动提交经 store、吞掉合成点击与点击穿透、`pointercancel` 不提交）；删除死文件 `habitats.ts`；CSS 加 `cursor: grab`/`touch-action: none`/拖动态样式；双语 README 更新泊位契约并重录配对；新增 Agent Note `2026-08-27-companion-draggable-berth{,.zh}.md` 与配对记录。
- 改了什么：按住精灵水平拖动即沿输入框卡片移动（抓取偏移随行、只改水平、垂直保持贴框顶设计），松手把最终比例写入 localStorage；输入框此后移动、分屏切换或变宽窄时，全部既有观测路径从该比例重推锚点，她总回到同一相对位置（既有溶解传送动画原样工作）。未拖过 5px 就是普通点击：单击/双击/右键/语音/穿透手势全部保持原行为。
- 为什么这样改：旧实现把精灵硬编码在右缘，无任何移动能力，store 旧字段是无消费方的死代码；“持久化相对比例 + 输入框为唯一参照系”让位置记忆靠构造成立，而不是坐标回放启发式。
- 影响了哪些模块：仅 ui-product-companion；触达编号 05 映射仓库 `niushuanan/dsh-whale-girl`（发布源 `product-companion`），主仓推送后需同步该独立仓库。
- 验证：包测试 44/44（新增比例↔坐标映射、拖动提交、轻点不拖三组用例）；全仓 typecheck 通过；translation pairing 与 README 配对绿（仅剩两条已记录的 rc7 预存单语文档红线）。

### 2026-08-27 03:05 - 提问卡片与计划评审卡文字可选中复制

- 本次任务：用户反馈 `ask-user` 弹出的问题卡片（选项、标题、描述）整页文字无法选中复制，要求在最符合直觉的前提下修复。
- 改了哪些文件：`packages/client/ui-user-questions/src/client/QuestionComposer.module.css` 与 `PlanReviewPanel.module.css` 各加 `user-select: text`。
- 改了什么：排查确认无任何显式禁选样式（主题与容器层干净），不可选源自 Chromium UA 把 `<button>` 文本设为不可选——问题页选项行与评审卡决策行都是按钮。两张卡片声明为可选文本：问题标题、详情、选项标签与描述、计划正文都可拖选复制；翻页/最小化/跳过/提交等纯动作按钮保持默认不可选。拖选起手于按钮内、终点在按钮外时浏览器会抑制点击，选项点选手势不受影响。
- 为什么这样改：选项与计划是用户要引用的内容，按钮默认禁选让整卡显得“防复制”；区分“内容可选、动作按钮不可选”贴合系统惯例，也保住双击回退等多选手势的可预期性。
- 影响了哪些模块：仅 ui-user-questions 两张卡片的选择行为；DOM、文案、布局与键盘流程零变化。该插件不属于 11 个固定发布映射，无需同步独立仓库。
- 验证：ui-user-questions 40/40 通过，bundle 构建通过；`test:gui` 中 ui-user-questions 与 ui-conversation 两包 535/535 通过（test:gui 其余 9 项失败位于 icons/settings-models/sidebar/scrollbar/workspace，均为 PROJECT_CONTEXT 已记录的预存红线，与本次 CSS 无交集）。

### 2026-08-27 02:40 - 长期记忆改为“对话平息即整理”，告别永不执行的零点任务

- 本次任务：用户反馈长期记忆的 AI 自动维护机制实际从未生效，要求按最符合用户直觉的方式重做触发与可见性。本机 `~/.dsh/memory/state.json` 证实零点维护一次都没成功过（无 `lastMaintenanceAt`、无 `ai.md`），且旧 `lastDailyCursor` 只写不用、错过的日子被静默永久丢弃。
- 改了哪些文件：新增 `packages/memory/memory-system/src/scheduler.ts`（`IdleMemoryScheduler`）与 `tests/scheduler.spec.ts`；改造 `src/index.ts`（Config 化 `idleDelayMs` 默认五分钟）、`store.ts`（游标迁移 + 失败记录校验）、`types.ts`（`lastMaintenanceCursor`/`lastMaintenanceError`/`MaintenanceOutcome`）、`api.ts` 与 `client/api.ts`（`POST /maintain` 与 `organizeAiMemory`）、`MemorySettings.tsx`/`locales.ts`（AI Tab “立即整理”按钮与失败行）；删除 `domain.ts` 三个零点函数；`maintenance.ts` 版本原因改名 `auto-maintenance`；更新双语 README×3、包 tsconfig/package（登记 schemastery 依赖）、web bundle 注释与本文件。
- 改了什么：废除每日 00:00 墙钟调度，换为单游标增量三触发——会话静默 `idleDelayMs` 后整理（默认 5 分钟，任何会话活动重置计时器；计划内整理只吃早于静默地平线的事件，绝不与进行中对话赛跑）、启动补扫停机积压、设置页手动“立即整理”直达当前时刻。批次串行且运行中触发合并为一次后续整理；全部批次成功才推进游标并清除失败记录，失败窗口整体在下个触发点重试；失败以 `{at,message}` 持久化并在设置页展示。版本历史活文档语义、脱敏、召回门控、flash 路由与独立开关均未变。
- 为什么这样改：普通用户的记忆心智是“聊完就记住了”（ChatGPT Memory updated 模型），而非“每日零点结算”；旧设计触发点选在设备最易休眠的时刻、错过不补、失败不可见，三者叠加导致功能形同虚设。
- 影响了哪些模块：仅 memory-system 包与其设置面；召回注入格式零变化，划词主动记忆路径不变。触及编号 08+09 共用仓库 `niushuanan/dsh-selection-memory` 的发布源闭包，主仓推送后需同步该独立仓库。
- 验证：包测试 36/36 通过（含 5 个新调度器假时钟用例：启动补扫地平线、静默门控与活动重置、失败保游标 + 错误持久化后整窗重试清错误、显式整理包含最新消息且并发返回 busy、运行中触发的恰好一次合并跟进）；`tsc -b packages/memory/memory-system/tsconfig.host.json` 与全仓 typecheck 通过；docs:build、config-catalog、translation pairing、memory 两个 README 与 Agent Note 配对均绿，其中 config-catalog 再生同时补齐了上一轮 `hidden` 开关漏更的目录与中文对侧（含 plugin-catalog/skill-manager/adaptive-update 段与两处清单欠行）。已知预存红线与本次无关、未处理：`verify-type-equiv` 的 subagent 能力漂移、`verify-export-jsdoc` 的 memory-system 包存量注释缺失与 session-log-export 缺失、`verify-doc-graphs` 的 event-producer 图谱陈旧、`docs/superpowers/*rc7-upgrade*` 两份单语文档缺对侧。

### 2026-08-27 01:05 - 模型可见性开关：隐藏而不删除

- 本次任务：把智谱 GLM-5.3-Flash（320B-A18B）接入本机 DSH 并重列 DeepSeek V4 Flash 后，按用户需求给设置页的模型目录加"每个模型一个展示开关"，让过多前端模型可以先隐藏、随时恢复，而不必删除配置。
- 改了哪些文件：`packages/llm/llm-deepseek/src/adapter.ts`、`src/index.ts` 与 `README.md`/`README.zh.md`/`README.i18n.yaml`；`packages/llm/llm-pi-ai/src/catalog.ts`、`src/config.ts`、`src/adapter.ts` 与三份 README；新增 `packages/client/ui-settings-models/src/client/ModelVisibilityToggle.tsx`，改 `DeepSeekModelsEditor.tsx`、`ModelListEditor.tsx`、`locales.ts`、`ModelsSection.module.css` 与两份 README 及配对清单；新增 Agent Note `.agents/notes/implemented/architecture/2026-08-26-model-visibility-hidden-flag{,.zh}.md` 与 i18n 记录；补丁 `apps/web/tests/snapshots/models-settings/declared-edit.expected.md`、`apps/web/tests/snapshots/onboarding-deepseek-config/models.expected.md`；两个 llm 包与 ui-settings-models 的定向测试；更新本文件。
- 改了什么：两个 adapter 的模型条目都支持可选 `hidden: true`——只在目录广告面生效（各 adapter 的 `listModels()` 过滤，全部消费方经 `ctx.llm.listModels()` 统一收口）；精确路由与容量元数据不受影响，被隐藏模型仍可被显式引用和既有会话选择使用（advisory 契约）。pi-ai 经 `RouteCatalog.hiddenIds` → `ResolvedPiAiProviderProfile.hiddenModels` 随 profile 快照传递。设置页两条模型行各加一枚眼睛开关（aria-pressed + 隐藏行降透明度），恢复展示清除字段而非写 `false`。
- 为什么这样改：用户看到太多前端模型烦躁，但删除配置后怕需要时找不回；广告面过滤让"不展示但仍可用、可逆"成为一等语义。
- 影响了哪些模块：LLM 目录协议的消费方零改动（选择器、默认模型、子代理协作等自动跟随）；11 个独立插件仓库均为自包含 profile 插件，不含这些共享包，本次无需同步。已知预存在问题记录在案：`ui-settings-models/tests/styles.client.spec.ts` 下拉 chevron 门与 `apps/web/tests/snapshots/` 一批导航/composer 按钮 goldens 在干净树上即红（组合早于快照演化），留给下一轮清理。
- 验证：受影响包测试 831 项通过（唯一失败为上述预存样式门，stash 干净树复现确认与本改动无关）；`tsc -b tsconfig.client.json` 通过；改动包 oxlint 0 告警；Agent Note 格式门通过；官方生产构建通过；`DSH_SNAPSHOT=replay test:web` 中 models-settings/onboarding 相关 golden 补丁后对应用例转绿。

### 2026-08-26 20:07 - 迁移本机产品 checkout 并建立自动发布规则

- 本次任务：把完整 Xiaozhuang DSH 产品代码迁入当前“迭代DSH”工作目录，并用 DSH 原生可自动读取、但不会推送的本机项目指令，固化每次产品改动后的主仓库发布和 11 个独立插件仓库按影响范围同步规则。
- 改了哪些文件：仓库内修改 `AGENTS.md` 与本文件；本机创建并通过 `.git/info/exclude` 排除 `AGENTS.local.md`，替代旧 `PLUGIN_REPOSITORIES.local.md`；更新 `~/.local/bin/dsh`、`~/Library/LaunchAgents/com.deepseek.harness.web.plist` 和 Web Profile 的两个源码包链接，并在旧 checkout 地址保留目录兼容链接。
- 改了什么：完整 2.1 GB checkout 原样迁到 `/Users/zhuanghongkai/Desktop/迭代DSH/xiaozhuang-dsh`；启动器、LaunchAgent 和 Profile 源码依赖全部改为新路径。`AGENTS.local.md` 明确实现类任务完成后自动更新项目上下文、定向验证、commit、push 和远端回读，并在改动涉及固定 11 个独立插件仓库时，从主仓库已推送 commit 临时生成、同步、验证和清理对应仓库。公开 `AGENTS.md` 删除了对旧本机同步清单的引用。
- 为什么这样改：单独同步清单不会天然进入 AI 的项目指令链，也无法保证以后每轮修改都执行；DSH 已原生支持根目录 `AGENTS.local.md` 覆盖层，配合 Git checkout 私有排除，可以同时做到自动读取、规则集中和绝不推送。子目录承载代码避免与“迭代DSH”现有截图和实验产物混放，旧路径兼容链接则避免历史会话因搬迁失效。
- 影响了哪些模块：影响本机 checkout 位置、3080 启动路径、AI 项目维护流程和多仓库发布流程；不改变任何插件源码、产品交互、用户数据、对话、附件、设置、tag 或 Release，因此本次不需要同步 11 个独立插件仓库。第 1–2 节仍然准确，第 3 节已补充新的本机入口。

### 2026-08-26 19:52 - 发布 11 个可单独安装的公开插件仓库

- 本次任务：完整保留 Xiaozhuang DSH 主仓库，同时把用户选定的 12 项能力按 11 个边界发布为可单独下载、交给 AI 安装的公开 GitHub 仓库；选中操作与长期记忆共用一个仓库。
- 改了哪些文件：更新 `AGENTS.md`、`README.md`、`README.zh.md`、`README.i18n.yaml` 和本文件；当时的 checkout 另有被 `.git/info/exclude` 排除的 `PLUGIN_REPOSITORIES.local.md`，记录公开仓库映射与后续按影响范围同步的本机工作流，后续已由 20:07 的 `AGENTS.local.md` 项目指令取代。
- 改了什么：创建 `dsh-teamwork`、`dsh-parallel-worktree`、`dsh-image-vision`、`dsh-whale-girl`、`dsh-pure-chat`、`dsh-multi-window`、`dsh-selection-memory`、`dsh-adaptive-update`、`dsh-skill-manager`、`dsh-model-usage` 和 `dsh-token-overview` 11 个公开仓库；每个仓库使用 `master`，包含 MIT、双语首页、真实截图、插件代码、AI 安装说明、逐文件哈希 manifest、`dsh-plugin`／`deepseek-harness` Topic，以及 `xiaozhuang-v0.4.2` tag、Release 和安装 ZIP。主 README 的对应 11 项标题链接到独立仓库，08 与 09 指向同一 `dsh-selection-memory`；`run` 与 `run-from-source` 隐藏锚点继续承接用户指南的既有链接。
- 为什么这样改：完整发行版适合一次体验全部能力，独立仓库则让只需要一两个插件的用户缩短下载和安装路径；单向发布副本保持主仓库为唯一开发源，避免多仓库反向合并和 submodule 增加维护复杂度。
- 影响了哪些模块：影响 GitHub 文档、开源发布入口和后续维护流程，不移动或删除主仓库代码，不改变插件运行、开关、用户数据、对话、附件、设置或本地 3080 产品。第 1–3 节已复核，项目用途、代码结构和运行入口不变。

### 2026-08-26 18:20 - README 首屏加入 dshfind 小标与展示卡

- 本次任务：把 dshfind 为当前仓库生成的小标和项目展示卡加入 README 首屏，帮助用户直接识别社区收录状态并跳转插件详情页。
- 改了哪些文件：更新 `README.md`、`README.zh.md`、`README.i18n.yaml` 和本文件。
- 改了什么：在现有 release／DSH Plugin／MIT 徽章之后加入可点击的 dshfind 小标，并在首屏链接区之前居中展示可点击的 dshfind 项目卡；英文图片使用 `lang=en`，中文图片使用 `lang=zh`，两者都指向 dshfind 的无语言前缀详情路由，由站点处理最终语言跳转。
- 为什么这样改：小标适合快速表达社区收录与热度，展示卡能在首屏强化项目名称、作者和 DSH 插件身份；两者都直接链接到对应语言的 dshfind 详情页，信息完整但不增加本地图片体积。
- 影响了哪些模块：只影响 GitHub 根 README 的首屏外链展示和双语配对记录，不改变运行代码、插件功能、用户数据、发行包或本地 3080 产品。第 1–3 节已复核，项目用途、结构和关键入口不变。

### 2026-08-26 18:17 - README 增加 16 个插件逐项实拍图册

- 本次任务：把根 README 从少量代表图升级为完整产品图册，让用户不展开清单、不阅读实现说明，就能逐项看懂当前 16 个原生插件的真实形态。
- 改了哪些文件：更新 `README.md`、`README.zh.md` 和 `README.i18n.yaml`；新增 `docs/assets/readme/plugins/01-computer-use.webp` 至 `16-token-overview.webp` 共 16 张当前 3080 实拍图，并更新本文件。
- 改了什么：删除原先 3 张代表图与折叠插件清单，按“工作能力／对话体验／数据与用量”三类展开全部插件；每项只保留编号、名称、一句用户价值和一张独立实拍，覆盖 Computer Use、Teamwork、worktree、图片入口、鲸少女、纯聊天、双会话分屏、划词操作、长期记忆、持续适配、Skill 文件预览、连续消息流、Agent 预设、模型配额、会话运行详情和整机 Token 总览。截图统一转为 WebP，16 张合计 375,632 bytes（约 367 KiB）；鲸少女设置图裁掉本地规则正文，其他画面只展示产品演示会话和界面状态。
- 为什么这样改：插件目录只说明“有什么”，不能帮助首次访问仓库的用户判断“它长什么样、在哪里用、是否已经做成产品”。逐项大图配一句话能把阅读路径压到最短，同时 WebP 控制了 GitHub 首次加载和仓库体积。
- 影响了哪些模块：只影响 GitHub 根 README、双语配对记录和文档图片，不改变运行代码、插件开关、会话数据、模型调用、发行包或 3080 产品。第 1–3 节已复核，项目用途、代码结构和关键入口不变。

### 2026-08-26 17:37 - 根 README 产品化重构

- 本次任务：解决根 README 文字过多、结构松散和缺少产品画面的问题，让首次访问仓库的用户能快速理解、下载和判断产品价值。
- 改了哪些文件：重写 `README.md`、`README.zh.md`，新增 `docs/assets/readme/plugin-catalog.png` 与 `docs/assets/readme/skill-manager.png` 两张当前 3080 真实界面截图，刷新 `README.i18n.yaml`，并更新本文件。
- 改了什么：首屏收敛为一句定位、版本／Topic／许可证徽章、四个关键链接和插件目录实拍；把全部能力按六个用户任务归组，以 Skill、Computer Use 和模型用量三段真实画面串联产品；保留发行包与源码两条启动路径，把 16 个插件折叠为三类清单，并把数据、模型和兼容更新压缩成三条必要说明。中英文使用完全相同的信息层级。
- 为什么这样改：根 README 应承担产品入口而不是内部实现说明书。先展示“能做什么”和真实界面，再提供最短启动路径，能显著降低首次阅读成本；实现细节继续由包 README、开发指南和架构文档承载。
- 影响了哪些模块：只影响 GitHub 根 README、两张文档截图和双语配对记录，不改变运行代码、插件行为、发行包、用户数据或 3080 产品。第 1–3 节已复核，项目用途、代码结构和关键入口不变。

### 2026-08-26 17:15 - 小庄插件页头卡片视觉收敛

- 本次任务：修正“小庄的插件”页头卡片底色不协调、灰色描边显得笨重的问题，同时保留用户此前要求的卡片分区。
- 改了哪些文件：修改 `packages/client/ui-plugin-catalog/src/client/PluginCatalogSection.module.css`，并在 `apps/web/tests/settings-chrome.e2e.ts` 增加真实浏览器样式契约；更新本文件。
- 改了什么：去掉 Hero 的 1 像素灰色边框、蓝灰渐变和悬浮阴影，改用主文字色 3% 混入页面底色的自适应中性色面；圆角、间距、导出按钮、Star 链接和统计保持不变。浏览器契约直接检查最终计算样式没有边框、阴影和背景图片，且仍有不透明背景色。
- 为什么这样改：边框、阴影和渐变同时出现会让轻量设置页产生厚重、廉价的套框感；只靠极浅色面与留白建立层级，既能保留卡片识别，也不会出现可见灰线或偏蓝底色。
- 影响了哪些模块：只影响“小庄的插件”页头视觉和对应 Web 回归，不改变插件目录、启停、导出、设置导航、数据或其他插件。第 1–3 节已复核，项目用途、代码结构和关键入口不变。
- 验证：真实 Web 样式契约先在旧版复现 `borderTopStyle: solid`，改动后通过；完整 production build 通过。真实 3080 浅色设置页确认页头为轻微可辨识的中性卡片，无灰线、阴影和渐变，浏览器 0 error／0 warning；验收快照已移入废纸篓，可恢复。

### 2026-08-26 16:51 - 插件目录边界、纯聊天上传与界面收敛

- 本次任务：补齐“小庄的插件”中的重要独立能力，去掉不应作为插件展示的基础交互，修正 Skill 管理图标与记忆名称；同时让纯聊天输入框通过原生加号上传图片和文件，并把导出选择栏收敛为纯文字状态。
- 改了哪些文件：修改 `ui-plugin-catalog` 的目录、导出闭包、Hero／导出栏样式和测试，修改 `ui-settings-general` 的 Skill 图标映射，修改 `memory-system` 的可见名称，扩展 `ui-conversation` 与 `ui-composer-add-menu` 的聊天上传契约、交互和测试；刷新生成的 Client slot 目录，并同步根目录、Web bundle、纯聊天、对话、输入加号、插件目录、长期记忆的中英文 README、翻译配对记录与本文件。
- 改了什么：插件目录保持 16 项，但以“持续适配”替换“命令、插件与技能”，后者明确作为输入框基础交互而非可启停插件；“记忆体系”改为“长期记忆”，Skill 管理复用产品既有 Skill 星标文档图标。纯聊天现在始终显示加号，菜单只提供图片和可读文本文件两项，不泄露工作区引用、命令或 Skill；图片继续走原有持久附件链路，小型文本／Markdown／表格／代码在 256 KB 范围内读入当前草稿，不增加通用文件存储协议。插件 Hero 使用更轻的原生卡片层级，导出区“全选 16 个／已选 N 个”移除胶囊与外框，仅保留文字和最终主按钮。
- 为什么这样改：用户不应该把每个界面增补都理解成插件；只有能独立启停、拥有完整用户价值并可单独导出的能力才进入插件目录。纯聊天上传是完整聊天输入的基础动作，关闭它会让产品残缺，因此保留为原生交互；有限文本读入复用既有草稿与图片链路，避免为小需求引入新的附件存储、权限和失败状态。
- 影响了哪些模块：影响通用设置侧栏、插件目录与导出选择条、长期记忆的可见名称，以及纯聊天输入加号；不改变工作会话的文件夹／命令／插件／Skill 入口，不改变图片附件持久化、模型请求、聊天无工具权限边界、插件实际开关、历史数据或记忆存储格式。第 1–3 节已复核，项目用途与顶层结构保持不变，相关关键入口已按当前行为更新。
- 验证：相关 6 个 Vitest 文件 132／132、生成 Client slot 目录校验、7 组双语配对、`git diff --check` 与完整 production build 通过。真实 3080 设置页确认 Skill 管理使用既有星标文档图标，16 项目录含“持续适配”“长期记忆”且不含基础输入加号；Hero 为轻量卡片，导出模式的“全选 16 个／已选 0 个”均为无外框纯文字。真实“开始聊天”后无工作区、模式和权限控件，加号只显示“上传图片／上传文件”；选择现有 Markdown 后正文确实写入草稿，清空草稿后退出，浏览器 0 error／0 warning。Playwright 验收快照已移入废纸篓，可恢复。

### 2026-08-26 16:14 - 消息即时回显与开始入口竞态修复

- 本次任务：修复聊天和 Agent 工作会话发送后先出现 “Deep diving...” 而用户消息延迟显示，以及连续点击“开始聊天／开始工作”时旧异步结果覆盖最后一次选择的问题；同时把插件页 Star 入口改成明确可点击的蓝色仓库地址。
- 改了哪些文件：修改 Client Session／Workspace 运行时契约与实现、测试运行时、纯聊天启动器、对话消息与滚动渲染、插件目录 Hero 样式和对应定向测试；同步根目录、runtime、ui-chat、ui-conversation、ui-plugin-catalog 的中英文 README、翻译配对记录与本文件。
- 改了什么：`Session.prompt()` 在第一次异步等待前发布本地用户消息，持久 `user/message` 到达后按文字与先进先出顺序原位接管；发送失败会撤下对应回显。`SessionRuntime.openWhenReady()` 用单调导航意图统一仲裁聊天和工作启动，每次点击都重新取得最新意图，旧 create／connect 完成后不再抢回页面。插件 Hero 直接显示 `https://github.com/niushuanan/xiaozhuang-dsh（点击打开 ↗）`，使用产品品牌蓝、新标签页和安全 rel 属性。
- 为什么这样改：用户发送动作已经在本机发生，自己的消息不应等待 Host 往返后才可见，更不应被运行状态抢先；开始入口则必须服从最后一次明确手势，而不是网络与会话创建的完成顺序。Star 入口只有文字暗示但没有可见 URL 和有效蓝色变量，用户难以识别其可交互性。
- 影响了哪些模块：影响普通聊天与 Agent 工作会话的发送首帧、异步会话导航选择和插件目录开源入口；不改变 Host 日志、模型请求、历史数据、聊天／工作能力边界、插件启停、导出内容或用户设置。第 1–3 节已复核，项目用途、结构与关键入口仍然准确。
- 验证：定向失败测试先复现本地回显缺失、旧异步启动覆盖最新点击和 Star 链接不可识别，修复后本次 12 个相关测试文件 211／211、完整 Host／Client／Web production build 与五组双语配对通过。真实 3080 在工作和纯聊天中发送后都先显示且只显示一个用户气泡，再显示 “Deep diving...” 状态；“开始聊天→开始工作”最终落在有 Workspace 的“新会话”，“开始工作→开始聊天”最终落在无 Workspace／权限控件的“新聊天”。Star 地址显示为品牌蓝 `rgb(65, 118, 230)`，点击在新标签页打开目标 GitHub 仓库；浏览器 0 error／0 warning。

### 2026-08-26 15:11 - 原生插件后台负载与整机卡顿优化

- 本次任务：在不改变任何插件功能、会话数据或用户入口的前提下，修复产品突然整体卡顿，并让记忆体系只在每天本地零点运行、错过后不补跑。
- 改了哪些文件：修改 `memory-system` 的定时运行与会话扫描、`ui-provider-quota` 的按需加载与 Codex 管道错误边界、Host／Client Computer Use 的权限探测、`ui-product-companion` 的素材前瞻解码及对应定向测试；同步根目录、四个原生插件包、Computer Use 包、记忆设计／计划和三份既有 Agent Note 的中英文说明、翻译配对记录与本文件。
- 改了什么：记忆插件启动与 Agent 创建时不再扫描历史，只在持续运行实例的本地 00:00 处理刚结束自然日，逐条加载会话并在会话间让出事件循环；错过零点直接等待下一天。模型用量不再在 Host 或客户端启动时请求厂商，首次打开面板才加载；Codex stdin 的 `EPIPE` 只结算为 GPT 提供方错误。关闭的浏览器工作区不再轮询本机权限；Host 把相同权限状态合并为一次进行中探测和一份生命周期缓存，只有开始或完成授权时才失效，避免上游原生助手继续累积。数字伙伴不再挂载即解码 56 个语义帧和 96 张遮罩，只提前两帧及下一组遮罩，并按 URL 去重。
- 为什么这样改：此前记忆补跑会把全部压缩会话并发解压和克隆，Host 内存峰值与主线程停顿会让聊天、模型切换和设置页一起变慢；额度插件的未处理 `EPIPE` 还能终止宿主并再次触发启动扫描。Computer Use 与数字伙伴又分别持续创建权限探测进程和集中解码素材。四处都属于插件后台工作，不应抢占用户当前对话的主链路。
- 影响了哪些模块：只影响四个原生插件的后台调度、资源加载与失败隔离；主动记忆、相关召回、模型用量展示与手动刷新、Computer Use 授权／浏览器自动打开、数字伙伴动作、全部插件开关和已有数据格式保持不变。项目用途、代码结构和关键入口已复核，第 1–3 节除记忆计划说明外仍然准确。
- 验证：定向测试先分别复现启动扫描、并发会话加载、关闭态权限探测、全量素材预解码、额度启动请求与 Codex `EPIPE`，最终 12 个相关测试文件 72／72、受影响包类型检查和完整 production build 通过。真实 3080 重启后常驻内存从历史扫描时约 1.8 GB 峰值回落到约 38–46 MB；模型切换、开始聊天、普通消息、额度首次打开和手动刷新均可用，实测首字约 1.2 秒、完整短回复约 2 秒，Host 未再因 `EPIPE` 重启。关闭浏览器工作区时不请求权限；清理 184 个历史遗留原生助手后，服务启动为 0，首次主动状态查询为 1，连续查询仍为 1，3080 与 Host PID 稳定。Agent 启动不再触发记忆维护，已有会话与插件功能保持可用；文档格式、链接、预算、Agent Note 和本次 11 组双语配对门禁通过。全量 GUI 仍有 7 个文件／11 项既有快照、样式与语法超时基线失败（320 个文件／4184 项通过，1 项跳过），Web 回放仍有 36 个文件／64 项旧文案、选择器与快照基线失败（48 个文件／229 项通过，7 项跳过），均不在本次四个插件改动链路中，未用扩张修复掩盖现有基线债务。

### 2026-08-26 14:04 - Skill 管理导入入口与阅读布局优化

- 本次任务：把三种 Skill 导入方式合并为规范的单一入口，并解决 Skill 目录、说明、文件树和正文同时展开导致内容严重拥挤的问题。
- 改了哪些文件：`packages/client/ui-skill-manager/src/client/SkillManagerSection.tsx`、对应样式与组件测试、`apps/web/tests/skill-manager.e2e.ts`、两级 TypeScript 测试工程归属及三份 Web 快照、根目录和 Skill 包双语 README、原生 Skill Agent Note、翻译配对记录和本文件。
- 改了什么：页面只保留一个黑色“导入 Skill”下拉按钮，文件与文件夹直接打开选择器，GitHub 选择后才展开行内地址输入框；首屏使用双列自适应 Skill 目录，打开 Skill 后切换为带返回入口的专注阅读区，让文件树与正文获得完整宽度。说明默认三行并可展开；预览标题显示路径和大小；Markdown 可视化只省略开头 frontmatter，不修改源内容。
- 为什么这样改：三套并列控件重复且让 GitHub 输入长期占位；在设置弹窗真实宽度里永久展示 Skill 目录、文件树与正文三列，会把正文压成不可读窄栏。目录到阅读区的主从切换减少了同时出现的层级，但仍保持同页浏览和一步返回。
- 影响了哪些模块：只影响原生 Skill 管理页的导入入口、目录与文件阅读呈现；不改变导入 API、固定 DeepSeek 模型、文件／ZIP／GitHub 处理、安全限制、原子替换、Skill 注册表、权限和用户数据。项目用途、顶层结构与关键入口未变化，第 1–3 节已复核。
- 验证：组件测试先锁定统一菜单、GitHub 条件输入、说明展开、frontmatter 隐藏和目录到阅读区切换；相关包与 Web production 构建通过。新增的正式 Web 组合无密钥快照锁定目录、GitHub 表单和详情三种状态，并验证正文宽于文件树且超过 300 像素。真实 3080 页面确认 30 个 Skill 以双列目录展示，`lark-approval` 详情中 17 个文件与正文恢复正常宽度，说明可展开并可返回目录；导入菜单含三项，GitHub 输入只在选中后出现并自动获得焦点，浏览器 error／warning 为 0。

### 2026-08-26 13:23 - Skill 产品名称统一为“Skill 管理”

- 本次任务：把截图中只叫“Skill”的原生能力统一命名为“Skill 管理”，并提交推送。
- 改了哪些文件：`packages/client/ui-skill-manager/src/client/`、`packages/client/ui-plugin-catalog/src/`、两包定向测试、根目录与相关包双语 README、翻译配对记录和本文件。
- 改了什么：设置导航、设置页标题、页面可访问名称、插件目录卡片和插件导出清单统一显示“Skill 管理”；内部设置 id `skill`、插件 id `skill-manager` 与用户已有启停、排序状态保持不变。
- 为什么这样改：“Skill”只表达对象，“Skill 管理”明确表达该入口用于查看、预览和导入 Skill，与页面实际任务一致。
- 影响了哪些模块：只影响 Skill 管理与插件目录的用户可见名称、导出 manifest 名称和对应说明；不改变 Skill 发现、文件预览、AI 导入、权限、会话选择或数据格式。项目用途、顶层结构和运行入口未变化，第 1–3 节已复核，仅同步当前产品名称。
- 验证：四个定向测试文件 9／9、完整 Host／Client 与 Web production 构建、四组双语配对和差异检查通过。真实 3080 设置导航、页面 H2、页面可访问名称、插件目录卡片与开关均显示“Skill 管理”，浏览器 error／warning 为 0。全量 GUI、Web 回放、lint 与 `doc-sync` 仍命中主分支既有快照、样式、类型文档、旧翻译、换行、JSDoc 和 lint 欠账，本轮未扩张修复这些无关基线问题。

### 2026-08-26 13:08 - 最终需求复核、Skill 管理补齐与主分支收口

- 本次任务：重新逐项回顾原生纯聊天、命令／插件／Skill 统一入口、Skill 管理、插件导出和持续适配是否严格落实，并让本机实际打开的产品、Git 本地分支和远端仓库都只指向最全面的最新主分支。
- 改了哪些文件：`packages/client/ui-skill-manager/src/client/index.ts`、`packages/client/ui-skill-manager/tests/apply.client.spec.ts`、根与 Skill 包双语 README、翻译配对记录和本文件；同时在唯一主工作树重新生成正式运行产物并清理旧临时工作树。
- 改了什么：真实浏览器发现纯聊会话被选中时，Skill 管理页沿用了无 Skill 的聊天预设，导致已安装能力看起来消失；现在仅管理页回退到现有列表中的最近工作会话，继续展示实际可管理的个人／项目／运行时 Skill，纯聊天自身仍无文件夹、模式、加号、权限、Skill 或工具。完整 official 构建补齐主工作树中 Git 忽略的原生包 `lib/` 与 Web 产物，使 launchd 从主工作树稳定提供 3080。Git 本地与远端只保留 `master`，旧 detached 临时工作树也从 worktree 注册和磁盘中移除。
- 为什么这样改：设置页服务的是“查看和管理已经拥有的 Skill”，不能因为用户恰好在无执行能力的聊天里就假装这些能力不存在；但聊天的产品边界又必须继续严格无工具。分支名称收口还不够，本机常驻进程和忽略构建产物也必须确实来自同一个最新主工作树，才能保证用户打开的是最新产品。
- 影响了哪些模块：影响 Skill 设置页选择读取上下文、对应说明、主工作树运行产物和本地 Git worktree 状态；不改变工作会话实际 Skill 注册表、纯聊天执行权限、导入写入目录、用户会话／附件／设置或持续适配开关。项目用途与顶层结构未变化，第 1–3 节已复核，仅补充 Skill 关键入口说明。
- 验证：失败测试先稳定复现纯聊选中时请求 `chat` Session，修复后改为最近 `work` Session；相关 57 个 Vitest 文件 668／668 与完整 official 构建通过。真实 3080 已确认“开始工作／开始聊天”、纯聊天无工作控件、加号显示命令并只写入草稿、纯聊选中时 Skill 仍显示 30 项、`lark-doc` 同页显示多文件目录／正文、插件全选 16 项并实际下载 AI 安装 ZIP、持续适配自动更新每 6 小时已开启，浏览器错误／警告为 0。launchd 监听进程 cwd 为唯一主工作树；旧 31987 进程停止，1.7 GB detached worktree 已移除。

### 2026-08-26 12:45 - 原生 Skill、统一添加面板与轻量 Agent 兼容更新

- 本次任务：依次完成最近未收尾的原生能力：让输入框加号同时提供官方命令、插件与 Skill；新增可浏览和自适应导入的原生 Skill 页面；统一复用既有 Skill 图标；让产品自有 AI 功能固定使用低成本 DeepSeek 模型；并把“持续适配”改成每次更新都调用范围极窄的 Agent，同时保留冲突时的有界兼容处理。
- 改了哪些文件：新增 `packages/client/ui-composer-add-menu/` 与 `packages/client/ui-skill-manager/`；修改 `ui-commands`、`ui-conversation`、`ui-plugin-catalog`、`ui-adaptive-update`、`memory-system`、Web bundle、TypeScript 工程和锁文件；同步 Client Slot／Cordis／配置生成目录、根目录、Client、Bundle、插件目录及各原生包的中英文 README、翻译配对记录、三组双语 Agent Note 与本文件。
- 改了什么：加号面板标题统一为“命令、插件与技能”，先列当前 Session 已发布的官方命令，再列插件和 Skill；选择命令只写入斜杠草稿。设置新增 **Skill** 原生页面，使用 `IconSkillOutline16`，按当前 Session 的 cwd、实时 Agent、预设与作用域注册表显示实际可调用的 Skill；点击后同页查看文件树、说明和 Markdown／代码／文本／图片，导入支持文件、文件夹、ZIP 与 GitHub 仓库。导入只用无工具的 `deepseek-official/deepseek-v4-flash-vision-exp`，经不可信暂存、大小限制、结果校验和个人目录原子替换完成；长期记忆与兼容更新的产品自有 AI 路由也固定到同一模型。持续适配无论是否发生 Git 冲突都调用一次 Agent：无冲突只看直接重叠与契约，最多五分钟；有冲突只处理冲突文件和直接依赖，不设强制超时，但提示词禁止扩张到无关模块。候选仍只保留安装、一次构建、最多一次构建修复、空闲切换、数据快照和自动回滚。
- 为什么这样改：用户在输入框里不应记住“加号只能找 Skill、斜杠才能找命令”两套入口；Skill 也不应只在调用瞬间可见。复用当前 Session 的真实注册表和既有图标，能让页面与 Agent 实际能力一致。更新 Agent 的价值是兼容官方破坏性变化，不是做全仓深审，因此把输入、时限和允许修改范围收窄，保留必要判断同时避免过去数小时的等待。
- 影响了哪些模块：影响输入框添加菜单、官方命令目录、Skill 设置与个人 Skill 安装、插件目录计数／导出清单、持续适配候选准备、长期记忆辅助模型、Web 原生 composition 和公开说明；不改变普通工作或纯聊天所选模型，不在导入时执行上传代码，也不改变对话、附件、用户设置和 DSH Home 数据格式。Profile 中旧的外部添加菜单与插件中心装配行已移除，保留原有开关状态；旧包目录未删除。
- 验证：真实 `http://127.0.0.1:3080/` 的加号面板显示“命令、插件与技能”，官方命令 `browser` 等位于 Skill 之前，点击只写入 `/browser` 草稿；设置页 **Skill** 显示当前会话 30 个 Skill，打开 `lark-doc` 后同页显示目录与 `SKILL.md` 分节正文。相关 55 个 Vitest 文件共 665 项、Host／Client 类型检查、五个原生包 bundle、Web production build、Client／Cordis／配置生成目录、包 README 模型体验／限制、14 组本次双语配对和差异检查通过。全仓 `doc-sync` 的其余失败只来自既有 type-equiv、旧文档配对／换行和全仓 JSDoc 债务，本次涉及路径的 JSDoc 已清零。

### 2026-08-26 11:40 - 新增原生纯聊天插件

- 本次任务：在现有 Agent 工作产品旁新增符合用户直觉的纯聊天入口，让用户不选择文件夹、不进入工作模式也能立即开始普通对话，并让该能力继续服从原生插件启停与导出体系。
- 改了哪些文件：新增 `packages/client/ui-chat/` 与 `apps/cli/config/agent-presets/chat/`；修改 Client session 创建契约与 fixture、侧栏插槽与文案、会话输入壳、工作区会话树、Agent 预设可见性、Web bundle、插件目录与导出清单、图标、定向测试、根和相关包双语 README、设计／实施文档、Agent Note、TypeScript 工程、锁文件及本文件。
- 改了什么：侧栏原“新会话”改为“开始工作”，其下新增同规格的“开始聊天”和手绘三点气泡图标。点击后以内部 `chat` 预设创建或复用唯一空白聊天；该会话进入独立“聊天”分组并保留历史，但没有 workspace/cwd，不显示工作区、添加、工作模式、Agent 预设、权限或分屏入口，只保留模型选择、上下文、发送、搜索和标题等聊天必需能力。`chat` 是完整但无工具的内部 persona，不进入普通工作预设选择器。插件中心新增第 15 项“纯聊天”，开关控制入口，导出时闭合包含 UI、运行时契约和内置预设源码。
- 为什么这样改：用户真正需要的是在同一个熟悉对话页里区分“让 Agent 干活”和“只跟模型说话”，不是理解第二套会话系统。复用既有会话持久化、历史、模型和标题能力，可以保持最短路径；以 durable preset 作为能力边界，又能确保聊天不会因为隐藏几个按钮就暗中继承项目目录或执行工具。
- 影响了哪些模块：影响侧栏主操作、Session 创建参数与投影、会话分组和纯聊天输入姿态、内置预设过滤、Web 原生插件 composition、插件中心启停／导出和公开说明；不改变既有工作会话、项目历史、附件、模型配置、用户凭据或 DSH Home 数据格式。关闭“纯聊天”只移除新建入口，已有聊天历史仍可读取，不会被插件开关删除。
- 验证：相关 13 个 Vitest 文件 231／231、Host／Client 完整类型检查、237 项包结构门禁、正式 production build 与真实 built-plugin graph 快照通过；真实隔离 Web 页面点击“开始聊天”后出现独立 Chats／New Chat，输入可写，Agent 预设与权限控件为 0，浏览器错误为 0。连续点击只保留 1 个空白聊天，刷新后仍为 1；连接本机模拟 DeepSeek Provider 后，真实 `chat` Session 完成一次消息请求与响应，Provider 收到的工具数为 0，完整纯聊天 persona 生效。真实内存导出生成 1,433,218 bytes、540 个条目的 ZIP，并确认包含 `ui-chat` 源码、`chat` 预设和 AI 安装说明。验收服务已停止，临时 DSH Home 已移入废纸篓。

### 2026-08-26 10:55 - 原生插件中心支持选择性导出

- 本次任务：让用户在“小庄的插件”原页面选择一个、多个或全部插件，导出为可以直接交给 AI 安装到另一套 DSH 的代码包，并给版本冲突提供有边界的自适应安装兜底。
- 改了哪些文件：新增 `packages/client/ui-plugin-catalog/` 的 Host、Client、闭合导出目录、ZIP 生成器、定向测试与双语 README；在 Web bundle、Cordis composition、TypeScript 工程、Client 目录和锁文件中注册原生包；新增双语设计、实施计划和 Agent Note；更新根目录双语 README、翻译配对记录与本文件。
- 改了什么：把原先放在本机 Profile 的“小庄的插件”迁为仓库原生 Host/Client 产品。页面 Hero 增加“导出插件”，进入后复用现有 14 项目录显示复选框、全选、已选数量、取消和下载；选择模式不操作运行开关。全选固定覆盖目录中的 14 项能力，不受搜索结果和当前启停状态影响。Host 只接受本机同源请求，只从服务端闭合清单收集所选源码和必要运行资产，在内存中生成 ZIP；包内包含普通说明、AI 指令、安装与冲突处理流程、Cordis rows、来源 commit 和逐文件 SHA-256，排除账号、凭据、对话、设置、Git、依赖、测试与缓存。导出器本身是基础设施，不进入可导出目录。
- 为什么这样改：插件导出的真实任务不是让用户理解 DSH 内部组装，而是得到一个可转交、可安装、可在目标版本有冲突时窄范围适配的完整能力包。把入口放在用户已经管理插件的页面并复用同一目录，可以不新增设置页或“导出中心”；闭合服务端清单和最小安装说明又避免把整个仓库、私人数据或无限制 Agent 权限打进压缩包。
- 影响了哪些模块：影响插件设置页、Web bundle composition、选中插件代码收集和 ZIP 下载；不改变现有插件启停语义、对话、附件、账号、用户设置或 DSH Home。Profile 中既有 Teamwork 外部协作者配置仍由同一页面管理；导出时只读取源文件，不修改任何插件状态。
- 验证：新增 Host/Client 定向测试 7／7、Host/Client 类型检查、原生包 bundle 和 Web production build 通过。隔离 DSH Home 的真实 `http://127.0.0.1:31989/` 设置页完成单选 Teamwork 与全选 14 项下载；全量 ZIP 为 16,189,963 bytes，包含 14 项插件和 602 个哈希文件，并确认没有 node_modules、Git 元数据、凭据、会话／对话、环境文件、测试或构建缓存。验收结束后已停止隔离服务并把临时 Home 与下载包移入废纸篓。

### 2026-08-26 10:23 - 自适应更新升级为自动监控的“持续适配”

- 本次任务：把原生更新插件改名为“持续适配”，保留主动更新，并新增用户开启后立即生效、每六小时检查官方仓库的自动更新；同时大幅缩短官方版本兼容链路。
- 改了哪些文件：新增 `packages/client/ui-adaptive-update/src/automatic.ts`；修改该插件的 Host API、配置、Client 页面、胶囊样式、候选工人、冲突准备、验证清单、类型、包信息和双语 README；修改 Web bundle 注释、持续适配图标说明、根目录双语 README、既有原生更新 Agent Note 与配对记录；删除该插件四个已不再代表产品链路的深审、回放、验证和页面测试文件；更新本文件。
- 改了什么：设置入口和页面标题统一为“持续适配”，新增“自动更新 · 每 6 小时”胶囊；开关偏好原子保存在 DSH Home 之外，开启时立即读取官方分支，之后每六小时检查一次，只有本地尚未包含的新官方提交才复用主动更新事务。更新不再让 Agent 做独立语义深审；Git 无冲突时零模型调用，有冲突时只调用一次 Agent 处理冲突文件和直接依赖。候选只做锁定依赖准备和一次生产构建，构建失败最多一次窄范围修复；删除插件回归、独立全仓类型检查、Web 回放和切换前影子启动。空闲切换、写时复制数据快照、重启就绪检查以及代码和数据自动回滚保持不变。
- 为什么这样改：此前首次自适配耗时约三小时四十分钟，主要时间消耗在全仓深审、多轮 Agent、插件测试、283 项 Web 回放和影子启动；普通用户无法把这种等待当作可用的更新体验。持续监控与冲突级适配把日常更新收敛为接近普通 Git 合并的路径，同时保留最直接防止产品写到一半崩溃的数据和切换边界。
- 影响了哪些模块：影响持续适配设置页、自动更新偏好、官方仓库轮询、候选冲突处理、候选构建清单和公开说明；技术包 ID、API 根路径与控制目录保持不变，已有状态和安装 composition 不需要迁移。会话、附件、凭据、真实 DSH Home、空闲切换、快照保留与失败回滚不变。第 1–3 节已复核并更新持续适配入口说明，其余用途与结构仍然准确。
- 验证：按用户本次“不要再验证”的明确要求，没有运行测试、构建、类型检查、浏览器验收或产品自更新实验；本条只记录已落地的代码与文档范围。

### 2026-08-26 10:04 - 原生“自适应更新”完成首次自更新到 rc.2

- 本次任务：先在本地最新版本完成原生自适应更新插件，再由它自己把当前分支从 `25a5dbc08524` 审查、适配并切换到官方 `b150a551b8d4`（`0.1.1-rc.2`），验证它能真实吸收预览阶段的破坏性更新。
- 改了哪些文件：新增 `packages/client/ui-adaptive-update/` 的 Host、Client、后台工人、测试、构建与双语文档；在 `packages/bundle/web-app/`、`ui-primitives` 和 `ui-settings-general` 注册原生入口与手绘图标；合并官方 rc.2 的 431 个变更文件并处理 10 个冲突文件；修复 `apps/web/tests/hmr-live.e2e.ts` 的构建产物泄漏、完成页当前版本显示与回归；同步 TypeScript 工程、lockfile、根目录双语 README 和本文件。
- 改了什么：设置页标题和入口都为“自适应更新”，无一句话介绍。用户启动后，独立工人锁定官方提交，在可丢弃审查工作树输出深度冲突报告，再在同一候选区按有界多轮 Agent 适配。只有依赖、插件回归、Host/Client 类型、生产构建、Web 回放和影子 Host/Client 全通过，且对话空闲后，才做带 DSH Home 写时复制快照的原子切换；任何失败都保留旧产品或自动恢复代码和数据。成功后删除审查、候选和影子目录，仅保留最新一份回滚快照。
- 为什么这样改：DSH 上游仍在早期预览期，直接在当前源码和真实数据上解决破坏性冲突，会让产品在写到一半时崩溃。把正在服务的版本、审查区、候选区、影子环境和真实 DSH Home 分开，可以让数小时的审查与修复都发生在产品之外，只把一次可回滚的短切换暴露给用户。
- 影响了哪些模块：影响 Web 设置导航、原生插件 composition、Git 工作树、Agent 审查/适配、候选验证、Web 运行时切换、DSH Home 快照，以及官方 rc.2 图像管线、权限文案和相关原生插件；审查和验证期间不修改对话、附件或用户设置。第 1–3 节的用途、结构和关键入口已复核，仍然准确。
- 验证：真实任务耗时约 3 小时 39 分，审查了 33 个重叠文件、10 个合并冲突和 13 个受影响插件，在多轮反馈中把 Web 回放从 69 项失败收敛到 283 项全绿，并证明同一候选可连续两次回放而不污染构建产物。外部门禁的依赖、原生插件 45 项回归、类型、构建、Web 回放和影子 Host/Client 全部通过；切换期间产品恢复为 HTTP 200。验收 Home 中 122 个会话文件、87 个附件与回滚快照逐文件相同，附件聚合哈希仍为 `7f4bdf95c424edd345623f18dc63ca0af0851c0721c8e1b5f7696260b37eb226`；旧会话已在 31987 真实页面打开。候选、审查和影子目录均为空，只保留 1 份约 75 MB 快照。

### 2026-08-26 00:05 - 强化版本品牌与公开仓库入口

- 本次任务：把主页旧“预览版”标识替换为当前 Xiaozhuang DSH 品牌版本，在“小庄的插件”加入 MIT GitHub 仓库入口，并收紧公开仓库的外部改动入口。
- 改了哪些文件：修改 `packages/client/ui-conversation/src/client/locales.ts` 与对应 Hero 回归测试；本机 Web profile 修改插件中心代码、契约测试、双语包说明和项目上下文；当前仓库删除 `.github/dependabot.yml`，同步 Dependabot 决策说明的中英文与配对记录，并更新根 `README.md`、`README.zh.md`、`README.i18n.yaml` 与本文件。
- 改了什么：主页中英文 Hero 统一显示 `Xiaozhuang DSH · v0.4.2`；插件中心 Hero 增加指向 `niushuanan/xiaozhuang-dsh` 的“MIT 开源 · 在 GitHub 给小庄一个 Star”链接；关闭仓库自动版本更新 PR 来源，并在公开说明中明确源码与 Issues 继续开放、PR 和写权限不对外开放。
- 为什么这样改：旧“预览版”无法表达产品归属和当前发行版本，插件页也没有把用户引向正式开源仓库；自动依赖 PR 又会持续制造维护噪音。把品牌、版本、开源入口和维护方式一次对齐，用户能看懂产品身份，仓库所有者也能保持唯一改动控制权。
- 影响了哪些模块：影响 Web 空会话 Hero、插件中心顶部展示、公开双语说明和 GitHub 仓库维护配置；不改变会话、插件启停、Loader 映射、能力运行逻辑、MIT 许可证或公开 Issues。第 1–3 节已复核，项目用途、顶层结构和关键入口仍然准确。
- 验证：会话 Hero 测试 18／18、本机插件中心 Host／Client 契约 11／11、客户端语法、会话插件 bundle、Web production build、两组定向双语配对、Markdown 全仓链接与 `git diff --check` 通过；真实 3080 主页显示 `Xiaozhuang DSH · v0.4.2`，插件页外链文字、目标、安全属性和新标签页跳转均正确，浏览器 0 错误／0 警告。完整 `doc-sync` 28 项中 17 项通过；本次删除配置产生的唯一链接失败已修复并单独复验，其余 10 项为当前工作树既有的目录、生成文档、JSDoc 和翻译债务。

### 2026-08-25 23:31 - 小庄插件目录对齐当前产品名称与图标

- 本次任务：逐项检查本机“小庄的插件”14 项能力，修正与当前真实产品入口不一致的旧名称、通用占位图标和过期说明，并把目录契约同步到公开双语说明。
- 改了哪些文件：本机 Web profile 中修改 `packages/xiaozhuang-plugins/lib/client.js`、对应契约测试、双语包说明和 `PROJECT_CONTEXT.md`；当前仓库修改根 `README.md`、`README.zh.md`、`README.i18n.yaml` 与本文件。
- 改了什么：10 项过期展示完成同步；Computer Use、鲸少女、记忆体系、Token 总览等复用真实设置入口图标，多对话分屏复用产品双栏图形，图片理解和会话运行详情使用语义图标；五个旧名称更新为“图片理解”“鲸少女”“添加、插件与技能”“Agent 预设”“会话运行详情”，划词说明补入侧边聊天。其余四项已经一致，保持不变。
- 为什么这样改：同一能力在设置目录和插件中心使用不同名称或通用图标，会让用户误以为是两个产品；真实产品入口应当是目录品牌信息的唯一来源。
- 影响了哪些模块：只影响本机插件中心的目录展示、搜索命中词和对应契约，以及仓库公开说明；不改变插件 ID、Loader 映射、开关状态、设置入口或能力运行逻辑。第 1–3 节已复核，项目用途、顶层结构和关键入口仍然准确。
- 验证：本机插件中心 10／10 定向测试、语法检查与 `git diff --check` 通过；真实 `http://127.0.0.1:3080/` 设置页显示 14 项全部开启，新名称、图标和说明正常，浏览器 error／warning 为 0。

### 2026-08-25 23:03 - 设置目录恢复直接拖动排序

- 本次任务：修复用户按住设置目录并立即移动时排序手势被取消、只有完全静止一秒才可能拖动的问题，并准备 Xiaozhuang DSH v0.4.2 补丁发行包。
- 改了哪些文件：修改 `packages/client/ui-settings-general/src/client/SettingsRoot.tsx`、组件测试、`apps/web/tests/settings-chrome.e2e.ts`、设置外壳与仓库根双语 README、两组翻译配对记录及本文件。
- 改了什么：指针按下后移动超过 6 px 单击容差时，不再取消待定手势，而是立即进入同一套排序状态并显示插入线；停住一秒后再移动的原入口继续保留。普通单击仍切换分区，释放拖动仍自动保存顺序。公开下载入口升级到 v0.4.2。
- 为什么这样改：旧实现把长按等待期内的自然移动当成取消信号，真实用户一开始拖动就失去排序资格；单元测试只模拟“静止一秒再移动”，因此没有覆盖普通拖动路径。把越过单击容差解释为明确拖动意图，才能符合目录条的直接操作直觉。
- 影响了哪些模块：只影响设置侧栏排序手势、对应浏览器回归和发行说明；不改变导航宽度、排序持久化、栏目内容、图标或其他插件。第 1–3 节已复核，项目用途、顶层结构和关键入口仍然准确。
- 验证：新增组件回归先稳定复现移动后插入线为 0，再确认直接移动可排序；设置根组件 22／22 通过。真实 Web 回归在旧构建中确认直接拖动后“模型”仍停在原位，重建设置插件和 Web 后同一路径把它移动到目录末尾。

### 2026-08-25 22:44 - 设置目录选中与悬停背景恢复统一宽度

- 本次任务：修复设置目录在加入长按拖拽排序后，选中态与悬停态背景会随栏目文案长度变化的问题，并准备 Xiaozhuang DSH v0.4.1 补丁发行包。
- 改了哪些文件：修改 `packages/client/ui-settings-general/src/client/SettingsRoot.module.css`、`apps/web/tests/settings-chrome.e2e.ts`、设置外壳与仓库根双语 README、两组翻译配对记录及本文件。
- 改了什么：让拖拽包装层内的每个导航按钮重新占满 164 px 导航可用宽度；新增真实浏览器几何回归，直接比较设置目录全部按钮的渲染宽度；公开下载入口升级到 v0.4.1。
- 为什么这样改：新增 `.navRow` 包装层后，按钮不再是纵向 Flex 列表的直接子项，原有自动拉伸随之丢失，按钮退回按图标和文字内容收缩。统一按钮宽度恢复了此前的设置导航视觉规则，同时保留长按排序所需的包装层和插入线。
- 影响了哪些模块：只影响设置侧栏导航按钮的水平尺寸、对应浏览器回归和发行说明；不改变导航顺序、长按拖拽、当前分区、设置内容或其他插件。第 1–3 节已复核，项目用途、顶层结构和关键入口仍然准确。
- 验证：真实 Web 回归在修复前测得 5 种设置项宽度并按预期失败；设置插件与 Web 产物重建后，同一用例确认全部导航项宽度一致。设置根组件 21／21、两组双语配对与 `git diff --check` 通过，完整 official profile Host／Client／Web 构建成功并记录 212 个客户端产物。

### 2026-08-25 22:26 - 整合分叉并排、目录拖入分屏和设置目录排序，准备 v0.4.0

- 本次任务：把 `feat/fork-split-drag` 与 `feat/settings-nav-reorder` 两个隔离 worktree 的产品改动统一整合到最新 `master`，同步完整产品 README，并准备 Xiaozhuang DSH v0.4.0 预构建发行包。
- 改了哪些文件：整合 `packages/client/runtime/`、`ui-conversation`、`ui-workspace`、`ui-multi-window` 的分叉与拖拽链路，整合 `ui-settings-general` 的目录排序与持久化；加入对应 Web／组件测试和设置排序 Agent Note；更新仓库根、相关包双语 README、翻译配对记录和本文件。
- 改了什么：从目录会话行或已完成回合发起分叉时，来源对话继续留在主块，新分支默认在旁边打开；目录里的现有对话也可直接拖入当前对话面成为副块，并显示明确接收态。设置页目录普通点击仍直接切换，主键长按约一秒后可上下拖动，释放即按真实行落点重排并保存在本机。窄分栏引用预览继续受当前输入区边界约束。根 README 的能力表、分屏说明、引用说明和下载命令统一升级到 v0.4.0。
- 为什么这样改：分叉的核心任务是保留来源并对照探索，目录拖入是用户已经形成的直接分屏心智；设置目录个性化也应在原列表就地完成，不增加排序页面、模式开关或保存按钮。把两项独立改动一次收口，可以避免多套分支和发行说明长期分叉。
- 影响了哪些模块：影响 Web 对话分叉入口、目录拖拽协议、多对话分屏接收态、设置目录顺序和公开发行说明；不改变 Session fork 的 Host 语义、对话内容、四块上限、各设置分区内容、插件注册顺序、Agent、模型、权限或记忆数据。第 1–3 节已复核，项目用途、顶层结构和既有关键入口仍准确。
- 验证：两个来源 worktree 均为干净单提交分支；整合后的对话编排、分屏、目录、设置排序、引用预览共 10 个定向 Vitest 文件 123／123 通过，四组双语文档配对和 `git diff --check` 通过，完整 official profile Host／Client／Web 构建成功并记录 212 个客户端产物。

### 2026-08-25 22:14 - 侧边聊天引用预览自适应当前分块

- 本次任务：修复窄屏侧边聊天中悬停“已选文本”时，原文预览超出当前分块和屏幕的问题。
- 改了哪些文件：修改 `packages/client/ui-selection-actions/src/client/SelectionReferenceDock.module.css`、样式回归测试和中英文 README，刷新翻译配对记录，并更新本文件。
- 改了什么：预览气泡不再相对紧凑引用按钮定位，而是相对输入区整行靠右定位；最大宽度同时受 520 px 与当前输入区宽度约束，并把内边距计入宽度。连续长链接、路径或代码可在任意位置换行。
- 为什么这样改：侧边聊天是独立窄分块，按整个浏览器视口限宽会忽略分块边界；用户需要在当前输入区附近完整阅读原文，不能让预览压到相邻对话或屏幕外。
- 影响了哪些模块：只影响当前对话和侧边聊天输入区的引用悬停预览；不改变引用内容、来源编号、草稿持久化、发送序列化、侧边聊天创建或记忆体系。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：样式契约和既有引用 Dock 共 2 个 Vitest 文件 3／3 通过，完整 Client TypeScript／library 与 Web production build 通过。真实 3080 页面缩至 984 px 后，在宽 464 px 的侧边聊天内选取长段落并悬停：预览与输入区左右边界同为 26–430 px、宽 404 px，完全位于当前分块；把内容替换为 800 个连续字符后，正文 `scrollWidth` 与 `clientWidth` 同为 355 px，确认不会横向溢出。仓库 GUI 门禁另有 4118 项通过、1 项跳过；3 项与本次模块无关的既有门禁未通过，分别是模型能力下拉样式、Computer Use 滚动条表面绑定，以及产品精灵素材比对在全量并发时超时。

### 2026-08-25 21:00 - 收口划词入口、单一引用投影并发布 v0.3.0

- 本次任务：按真实划词体验把三入口贴到选区正上方，重画引用与记忆图标，统一所有记忆入口，并消除输入框内外重复出现“已选文本”的问题；随后把本轮选中操作与双文档记忆体系作为一个完整版本提交、推送和发布。
- 改了哪些文件：修改 `ui-selection-actions` 的定位、引用写入和双语说明，修改 `ui-primitives` 的引用／脑形记忆 SVG 与回归，扩展 `ui-input-trigger`／`ui-conversation` 的 Dock 引用投影与结构化草稿持久化契约；补强 `memory-system` 的空变更、首日扫描、批量维护、召回边界和设置重试；同步根双语 README、翻译配对和本文件。远端新增 `xiaozhuang-v0.3.0` tag、GitHub Release、预构建源码包与校验文件。
- 改了什么：工具条使用真实 40 px 高度紧贴选区上沿四像素，引用改为双引号线框，记忆改为 16 px 双半球脑形线框；设置目录和划词入口共用同一记忆图标。引用在草稿中只保留零宽结构化身份，用户只看到输入框上方一条带编号、可悬停原文和可移除的注释；结构化来源随草稿持久化并在刷新后恢复，多个相同引用也按准确编辑区间删除。发送时仍展开完整有界来源并与用户正文保持清晰分隔。主动记忆无内容变化时不制造版本或撤销；AI 记忆首次只扫描当天，长对话分批完整维护；召回内容作为不可信数据放在当前请求之前，加载失败可直接重试。README 的默认下载入口升级到 v0.3.0。
- 为什么这样改：操作浮层必须与选中的来源建立直接空间关系；复制图标和星光图标会让“引用”“记忆”语义混淆；同一引用同时出现在注释区和正文里既重复又挤占输入空间。Dock 单一投影保留来源、序列化和删除能力，同时让用户只管理一个对象。
- 影响了哪些模块：影响 DSH 消息选区浮层、输入引用的可见投影与草稿恢复、引用模型序列化分隔、记忆维护与召回安全边界、设置导航和本轮公开发行入口；不改变来源正文、两份记忆文档的严格分离、侧边聊天分块、模型、权限或沙箱。
- 验证：先以失败回归锁定工具条上方定位、两枚新图标、Dock-only 引用及后续结构化恢复／记忆维护行为，再完成 19 个相关测试文件 298／298、Host／Client TypeScript、234 个包结构门禁、Client library 与 Web production build。真实 3080 页面测得工具条高度 40 px、底边与选区顶边相隔 4 px；引用后页面只有一处“已选文本”、编辑区没有 `@已选文本`，整页刷新后仍保留同一条结构化引用，移除后草稿恢复为空。划词与设置入口回读到同一枚 16 px 脑形 SVG，页面 error／warning 为 0。发行阶段从最终提交执行 official profile 构建，并从独立解压目录验证锁定依赖安装和 Web 启动。

### 2026-08-25 20:42 - 收敛记忆设置页文案与书签图标

- 本次任务：按 DSH 既有设置页规范精简记忆体系界面，只保留用户真正需要的双文档切换、编辑、更新时间和可执行操作。
- 改了哪些文件：修改 `packages/memory/memory-system/src/client/MemorySettings.tsx`、`locales.ts`、对应设置页测试，修改 `packages/client/ui-primitives/src/icons/index.tsx` 与图标回归，并更新本文件。
- 改了什么：Tab 改名为“选中记忆／AI主动记忆”，继续使用与插件配置一致的下划线交互；底部最多显示一条与当前文档相关的“更新于…”时间，没有时间就不占位，没有历史版本就不显示恢复按钮。设置目录图标收敛为单个 16 px 圆角书签轮廓，只用 1.3 px `currentColor` 描边、无填充、无内部文字线和装饰。内部 `user`／`ai` 文档类型、文件和维护机制保持不变。
- 为什么这样改：设置页应直接服务“切换文档并编辑”这一条任务，机制说明、重复时间和不可执行按钮都会增加理解成本；纯书签轮廓也更贴近 DSH 现有小尺寸线性图标。该图标属于代码内原生 SVG，因此按 `imagegen` skill 的边界直接编辑矢量代码，没有生成位图素材。
- 影响了哪些模块：只影响记忆体系设置页的可见标签、辅助名称、更新时间呈现和设置目录图标；不改变记忆文件内容、存储路径、主动写入、每日扫描、召回、撤销或模型调用。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：先用两条失败回归分别锁定旧 Tab 名称和双时间展示、旧双路径图标，再完成实现。记忆、图标和设置映射 8 个相关 Vitest 文件 123／123 通过，根 Host／Client TypeScript、完整 library 与 Web production build 通过。重启 LaunchAgent 后，真实 `http://127.0.0.1:3080/` 确认新 Tab、2 px 下划线、无机制说明、单一或空的更新时间、无历史时不显示恢复按钮；设置目录 SVG 为单路径、无填充、1.3 px 描边，页面无浏览器错误。

### 2026-08-25 19:57 - 重做划词引用交互与记忆设置界面

- 本次任务：依据 Codex 划词截图和 DSH 现有产品规范，把选中操作改成横向三入口，并把当前对话引用、来源注释、侧边聊天和两份记忆文档收敛为直觉一致的原生体验。
- 改了哪些文件：`packages/client/ui-selection-actions/` 的工具条、引用 occurrence、来源编号、输入框 Dock、文案、测试和双语 README；`packages/client/ui-conversation/` 的已发送引用展示；`packages/memory/memory-system/` 的设置页与测试；`packages/client/ui-primitives/` 的记忆图标与回归；`packages/client/ui-settings-general/` 的侧栏图标映射；根与 `packages/client/` 双语 README、配对记录和本文件。
- 改了什么：划词菜单改为“引用／记忆／侧边聊天”横排；引用追加到当前草稿而不覆盖已有输入，输入框显示“1 个已选文本”，悬停展示完整原文，来源正文可见时显示对应编号，滚出视口后编号隐藏，移除或发送后一起清理。侧边聊天复用同一结构化引用，在同项目现有分块聊天中打开新对话，并通过目标分块一次性交接引用，不在发起侧暗存第二份；达到分块上限时先阻止交接。已发送消息只显示用户可理解的引用注释，不暴露模型侧 `<quoted_selection>` 包装，空格分隔和多引用也沿用同一展示。记忆设置改用产品既有下划线 Tab，命名为“我的记忆／AI 记忆”，移除技术副标题、每日扫描说明和不可用的恢复按钮，并换用新绘制的线性书签文档图标。记忆写接口同时收紧为本机可信来源和 JSON 请求。
- 为什么这样改：用户的即时追问不应被迫创建新对话，也不应靠复制粘贴丢失来源；“引用”和“侧边聊天”应分别承担当前上下文追问与分支探索。设置页只需让用户看见、编辑和保存记忆，不应把内部召回或维护策略当作界面说明。
- 影响了哪些模块：影响 DSH 消息选区浮层、当前与分栏输入草稿、消息引用展示、多分块父子窗口确认、设置导航、双文档编辑界面和记忆本机 API；不自动发送消息，不改写来源正文，不合并用户记忆与 AI 记忆，也不改变现有 Agent 召回、每日维护、模型或权限边界。
- 验证：相关 18 个 Vitest 文件 204／204、根 Host／Client TypeScript、完整 Host／Client library、234 个包结构门禁、Web production build、三组双语配对和 `git diff --check` 通过；图标包构建缺失曾在真实设置入口稳定复现 React 运行时错误，补齐静态 bundle 后入口恢复。重启本机 LaunchAgent 后，记忆文档 GET 为 HTTP 200，非 JSON 写请求为 415，跨站写请求为 403。真实 `http://127.0.0.1:3080/` 已确认横向三按钮、当前草稿引用与悬停原文、来源编号随可见性隐藏；“侧边聊天”在同项目分块只向目标输入框交接 1 条引用，主输入框保持 0 条，移除和关闭后没有回流；简化后的“我的记忆／AI 记忆”设置页无技术说明、无不可用恢复按钮，浏览器 error／warning 为 0。

### 2026-08-25 19:10 - 原生选中引用与 AI 双文档记忆体系

- 本次任务：以两个可分别启停的 DSH 原生插件交付“选中操作”和“记忆体系”，让用户在 DSH 回答中划词后只选择引用或记忆，并让 Agent 维护而非机械累积长期经验。
- 改了哪些文件：新增 `packages/client/ui-selection-actions/`、`packages/memory/memory-system/` 及双语设计／计划；修改 `ui-conversation` 消息来源锚点、`ui-multi-window` 可调用分栏服务、`ui-settings-general`、Web bundle/profile、Computer Use 浏览器桥、根与相关包双语 README、TypeScript 工程引用、锁文件、本机插件中心和本文件。
- 改了什么：引用会在同项目创建或复用空白对话，以一次性同源交接把结构化引用卡片送入独立分栏且不自动发送；卡片前端只显示短标签，提交时才序列化带不可信边界的选区与上下文。主动记忆通过当前会话模型对用户文档做完整增删维护，支持结果与撤销；AI 文档每天本地 12:00 扫描成功游标后的全部用户／助手对话并重新判定保留项。两份全局 Markdown 都在设置中可见、可编辑、可保存和恢复上一版；每轮只召回少量相关低权限片段。浏览器 Agent 新增选中文字、页面 URL、元素定位和有界 DOM 的结构化读取工具。
- 为什么这样改：复制粘贴会丢失来源和上下文，简单把选中文字写进“记忆”又会快速堆成不可用垃圾。把用户主动入口与长期维护拆为两个原生插件，同时复用现有会话、输入、分栏、Agent 和插件中心能力，可以用最少新概念完成“就地追问”和“沉淀经验”，并保持用户主动记忆高于 AI 推断。
- 影响了哪些模块：影响 DSH 用户／助手消息的可选区来源标记、同页多对话服务、输入引用 occurrence、全局记忆文件与 Host API、Agent 首步上下文、Computer Use 浏览器工具、设置和本机插件目录；不修改原消息、不会自动发送引用，不把网页内容当指令，也不改变模型、权限、沙箱或外部浏览器的安全边界。
- 验证：16 个相关 Vitest 文件 93／93、五个相关 TypeScript 工程、三个 Client bundle、234 个包结构门禁和本次文档配对通过；插件中心 Host／Client 9／9。真实 `http://127.0.0.1:3080` 已确认 AI 回答划词只显示“引用／记忆”、引用在同页新分栏留下未发送卡片、两份设置文档可编辑、两个插件开关独立且启用。真实记忆请求到达模型调用层后因本机现有模型 API key 失效而明确失败，文档保持不存在、没有脏写；模型改写、存储、API、冲突、恢复、插件关闭提示和每日维护成功路径由定向测试覆盖。

### 2026-08-25 16:19 - 通用设置暴露并编辑现有 System Prompt

- 本次任务：在通用设置底部提供与全局 `AGENTS.md` 相同保存体验的 System Prompt 编辑器，并在首次打开时直接显示产品当前基础提示词。
- 改了哪些文件：修改 `packages/core/system-prompt/`、`packages/context/agent-instructions/`、`packages/client/ui-settings-general/`、根及相关包中英文 README、配对记录、依赖锁和本文件。
- 改了什么：新增固定 `$DSH_HOME/SYSTEM.md`，缺失时前端 API 返回当前 Web persona；保存使用内容修订校验和原子替换，草稿干净时自动同步，冲突时阻止覆盖，支持 Cmd/Ctrl+S，保存中的后续输入不会被旧响应覆盖。Host 在写入前校验模板，只接受产品明确支持的 `model`／`cwd` 变量，避免错误模板阻断下一轮请求。运行时每个模型步骤重新读取该文件，替换 deployment persona，并在所有 DSH 普通提示词之后、受保护 `AGENTS.md` 之前恢复。
- 为什么这样改：空白附加框会让用户无法判断现有 System Prompt，也不能真正修改产品当前行为；直接展示当前值并把保存结果接入同一 assembly 权威层，才能形成“看见当前值 → 修改 → 下一轮生效”的最短闭环。
- 影响了哪些模块：影响通用设置可见内容、Web 本机文件接口、system prompt 组装和全局指令读取；优先级固定为 `AGENTS.md > SYSTEM.md > DSH 其他提示词`。不改变模型供应商规则、工具权限、沙箱、审批和操作系统硬权限。
- 验证：System Prompt、Agent instruction、通用设置 Host／Client 共 7 个定向 Vitest 文件 219／219 通过；根 Host／Client library 与 Web production build 完整通过，四组中英文 README 配对和 `git diff --check` 通过。LaunchAgent 从 PID 38296 重启为 53438，3080 与新 API 均为 HTTP 200；真实通用设置页确认底部编辑器显示现有 `You are a coding agent powered by the {{model}} model...`，固定路径为 `~/.dsh/SYSTEM.md`、未修改时保存禁用且优先级说明正确。没有写入真实 `SYSTEM.md`。

### 2026-08-25 15:40 - 全局 AGENTS.md 提升为 DSH 内部最高指令

- 本次任务：把鲸少女设置页编辑的 `~/.dsh/AGENTS.md` 从普通 user 角色 guidance 提升为整个 DSH 主 Agent 链路中受保护的最高 system 指令，同时保留模型供应商侧策略与外部硬权限边界。
- 改了哪些文件：修改 `packages/core/system-prompt/`、`packages/context/agent-instructions/`、Web Host 与三个内置 Agent 预设组合、`ui-product-companion` 文案和定向测试；同步仓库根及相关包中英文 README、配对记录和本文件。
- 改了什么：system-prompt 新增唯一 protected 段语义，支持异步逐步读取、按 assembly 省略和关闭变量插值；该段不能被作用域同名段、complete persona 或 assembly listener 覆盖，并始终在 system prompt 最后恢复。Web Host 只负责全局所有者文件，标准／Code／Cordis 预设只负责项目指引，minimal 与用户自定义预设也会继承 Host 所有者段。项目 `AGENTS.md`／`CLAUDE.md` 继续以较低权限 user 上下文运行，全局文件不再在历史中重复注入。
- 为什么这样改：原实现明确把用户全局文件包装为可被 system、developer 和直接用户提示覆盖的 workspace guidance，且 minimal 完全绕过该插件；把所有者文件放到 Host 级受保护 system 段，才能以一条来源覆盖所有会话和预设，又不把不可信项目规则一并提升为 system prompt injection。
- 影响了哪些模块：影响 system prompt 组装、Agent instruction 发现／恢复、Web preset 组合和全局规则说明；不修改现有 `~/.dsh/AGENTS.md` 内容、不改变模型 Provider 服务端规则、工具 schema、沙箱、审批或操作系统权限。项目用途与代码结构未变化；第 3 节补充了两条新的关键提示词入口。
- 验证：先确认 protected／complete 冲突与全局文件 system 注入测试失败，再实现并通过 system-prompt、agent-instructions、产品伙伴三组定向 Vitest 共 223 项；三个相关 TypeScript 工程类型检查、完整 Host library 构建、四组中英文文档配对与 `git diff --check` 均通过。

### 2026-08-25 15:02 - 补齐发布门禁的严格类型断言

- 本次任务：在推送前按仓库正式 Host／Client 工程图复核，修复包级检查未覆盖的两处严格 TypeScript 测试断言。
- 改了哪些文件：`packages/client/ui-product-companion/tests/product-companion-assets.spec.ts`、`packages/client/ui-multi-window/tests/split-pane-workspace.client.spec.tsx` 和本文件。
- 改了什么：消散遮罩覆盖量的相邻数组读取明确为循环不变量；分屏测试把国际化消息提升为普通字符串后再进行参数替换，避免只在全仓 Client 类型图中出现的只读字面量 `reduce` 推断冲突。
- 为什么这样改：局部 Vitest、插件类型检查和 bundle 均能证明核心路径，但正式发布还必须通过根工程 Host／Client 图；测试代码本身也不能成为公开版本无法构建的阻塞点。
- 影响了哪些模块：不改变运行时行为、素材、交互、会话、输入或任何用户设置，只收紧两条回归测试的类型表达。
- 验证：遮罩素材测试 10／10、`npm run build:lib:host`、`npm run typecheck:contracts-ready` 均通过；后续预推送会再次执行相同门禁。

### 2026-08-25 14:40 - 稳定工作态动作并让精灵为底层操作让行

- 本次任务：修复 Agent 工作期间人物不断大幅晃动、后台任务也驱动人物，以及精灵覆盖输入区或按钮后抢走用户操作的问题。
- 改了哪些文件：`packages/client/ui-product-companion/src/client/ProductCompanion.tsx`、`ProductCompanion.module.css`、组件与素材回归测试；仓库根及插件中英文 README、配对记录，以及本文件。
- 改了什么：工作态移除与 12 帧图像不同步的 2 秒整身旋转／位移动画。只有当前会话开始运行或发生新的任务事实时才播放一次短专注帧序列，并以 5.2 秒节流避免流式更新把动作重新变成连续循环；其余时间回到稳定帧，后台会话只继续更新任务数与任务列表。精灵视觉仍浮在最上层，但主键落在其下方的原生输入、按钮、链接、选择器或编辑区时，会先命中底层控件；没有可操作底层内容时才保留精灵单击／双击，右键关闭菜单不变。
- 为什么这样改：整身 CSS 动画与独立换图各自循环会造成相位漂移，放大人物在输入框边上的晃动；DOM 顶层元素也不会天然把鼠标事件“传回”底下控件。把动作改为 Agent 事件驱动的短反馈、在点击时以浏览器真实命中结果决定归属，既保留陪伴感，也不让角色成为工作阻碍。
- 影响了哪些模块：影响数字伙伴的当前会话状态投影、专注帧调度、主键命中与相关说明；不改输入框锚点、换位材质、尺寸、语音、任务面板、右键菜单、会话数据、模型调用或插件热插拔。项目用途、结构和关键入口已复核，第 1–3 节仍准确。
- 验证：先新增三条失败回归，分别复现“无新进度仍持续换帧”“只有后台会话运行仍进入专注轨道”“覆盖控件仍被角色抢走”，再完成实现。素材与组件定向 Vitest 共 37／37、产品伙伴 Host／Client TypeScript、客户端 bundle、两组双语配对和 `git diff --check` 均通过。真实 `http://127.0.0.1:3080/` 在全新页面确认角色正常锚定输入框右上方、输入框仍可获得焦点，页面无错误覆盖层；底层控件优先与 240ms 单击去重由 DOM 命中组件回归锁定。

### 2026-08-25 14:10 - 角色换位时同步收起与恢复圆形控件

- 本次任务：修复输入框真实换位时，人物已经开始身体消散而麦克风、任务数两个圆键仍在旧输入框位置停留过久的视觉拖尾。
- 改了哪些文件：`packages/client/ui-product-companion/src/client/ProductCompanion.tsx`、`ProductCompanion.module.css`、两组定向回归测试、仓库根与插件双语 README 及配对记录，并更新本文件。
- 改了什么：把两个圆键明确标记为角色附属件。进入 `departing` 后立即从可访问树和键盘操作中暂时移出、禁用点击，并在消散前 40% 内完成淡出；人物完全不可见时根节点才切坐标，`arriving` 阶段圆键保持隐藏，等人物在新输入框锚点重新聚合后才淡回。根节点尺寸、输入框锚点判断、角色图、遮罩与语音／任务业务行为均未改变。
- 为什么这样改：圆键只是角色身边的操作附件，不是独立悬浮在输入框上的第二套控件。让它们用同一个两阶段生命周期，用户看到的是角色和附件一起离开、一起到达，而不是人物消散后按钮还残留在旧位置。
- 影响了哪些模块：只影响 `ui-product-companion` 的换位期间控件显示、可访问性和点击阻断，以及相应说明和回归；不改变麦克风听写、任务计数、并发任务面板、角色尺寸、输入内容或 Agent 状态。
- 验证：素材／组件定向 Vitest 33／33、插件 bundle 通过。真实 `http://127.0.0.1:3080/` 以展开／收起侧栏触发输入框从右侧 `1166` 移至 `1054`：离场中段圆键透明度为 `0.005`、`pointer-events: none`，隐藏切点为 `0`；新锚点重组阶段才恢复到 `0.27` 后继续出现，根节点全程保持 `164 × 147`。稳定页面无浏览器 error／warning；第 1–3 节已复核，无需调整。

### 2026-08-25 13:36 - 鲸少女护臂改为珍珠白与极浅冰蓝

- 本次任务：继续优化用户认可的人物形象，不再通过缩放身体制造“变瘦”，而是把原先与深色躯干糊成一团的前臂护甲做成轻色材质，让上半身轮廓更清楚、更轻盈。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v14/` 五张身份保持母表和 `assets/v14/` 蓝黑 136 张运行帧；修改素材构建脚本、Host 素材白名单、Client 资源 URL、发行清单、素材／组件测试、插件与素材双语 README；同步仓库根双语 README、配对记录和本文件。
- 改了什么：通过内置 ImageGen 分别编辑趴伏、专注、等待、完成和兼容动作母表，只把腕部到肘下的护臂主体改成珍珠白、极浅冰蓝高光和细钴蓝收边；黑色手套、蓝色上臂甲、黑色腿部、脸、身材、姿势、动作顺序和品红抠图底保持原设计。运行人物切换到不可变 `/v14/` 地址；夜航黑派生增加浅冰材质保护，不再把白蓝护臂重新压成炭黑。V13 消散遮罩从 V14 人物真实像素重新生成，因此换位时浅色护臂也作为同一人物材质自然消散。
- 为什么这样改：截图里的“粗”主要来自黑色手套、深色护臂和黑蓝躯干连成一块，而不是人体比例本身。用明度与冷色材质建立边界，比继续削减身体或压缩图片更自然，也不会破坏已经认可的脸型和动作。
- 影响了哪些模块：只影响 `ui-product-companion` 的人物原画、蓝黑派生、静态分发、预加载、消散材质和视觉回归；人物 132 × 118／164 × 147 外框、四种 Agent 状态、输入框锚点、48 帧换位节奏、麦克风、任务气泡、全局规则和热插拔边界不变。V12 保留为旧素材，当前运行路径只使用 V14。
- 验证：素材构建生成 136 张 V14 人物帧、40 张 V9 兼容门体帧和 96 张 V13 人物材质遮罩；蓝黑轮廓逐像素一致。新增护臂回归在四种语义状态的前景区域检查浅白冰蓝像素占比均大于 14%，两套皮肤差异小于 3%，防止夜航黑再次把护臂吞回深色主体。素材／组件定向 Vitest 32／32、Host／Client TypeScript 和插件 bundle 通过；测试还发现并修复专注母表 1 px 尺寸偏差引起的网格残线，没有放宽人物组件数或趴姿外框标准。真实 `http://127.0.0.1:3080/` 加载 `/v14/blue-lounge-09.png`，原图 384 × 384、放大外框恒为 164 × 147、旧 `/v12/` 请求为 0，页面截图确认浅色护臂与黑蓝躯干分离；页面无应用 error，只有重启服务瞬间的预期重连 warning。

### 2026-08-25 12:58 - 人物本体 48 帧消散、改名边界与全局规则编辑

- 本次任务：依次解决三条真实设置体验问题：角色换位的消散仍像外加泡沫、改名编辑态越出设置窗口、规则编辑器错误读取会话目录而把已有全局 `AGENTS.md` 显示为空。
- 改了哪些文件：`packages/client/ui-product-companion/scripts/build-product-companion-assets.mjs`、`assets/v13/`、`ProductCompanion.tsx`、`ProductCompanion.module.css`、`ProductCompanionSettings.tsx`、`ProductCompanionSettings.module.css`、`animation.ts`、`locales.ts`、`global-rules-host.ts`、`global-rules.ts`、Host／Client 工程配置、插件清单与定向测试；删除旧 `project-rules` Host／Client 代码和测试；同步插件、素材及仓库根双语 README、配对记录和本文件。
- 改了什么：从 136 张 V12 生产角色帧的真实像素并集生成 48 张身体遮罩和 48 张片段遮罩，只让现有人物的靴子、发梢、服装、皮肤与头发逐步消散，脸部延后，单程时长增至 1040 ms、相邻帧衔接缩至 28 ms。改名表单固定最大 348 px，并在滚动区顶部为聚焦描边留出 4 px，说明缩成一句。规则编辑器改为固定读取 DSH 实际全局注入的 `~/.dsh/AGENTS.md`，显示完整最新内容；可见且草稿干净时自动同步，保存后从所有对话下一轮起生效，修订冲突时明确载入最新版本，不再出现“重新读取／创建并保存”两套含混状态。
- 为什么这样改：高级感必须来自同一角色材质有方向、有层次地消失和重组，而不是在角色外再叠一团圆泡；设置组件必须服从既有窗口边界；规则入口的产品含义是修改整个 DSH 的 Agent 行为，因此目标必须与 Agent 运行时每轮真实加载的全局文件一致，不能跟随偶然的会话工作目录。
- 影响了哪些模块：影响 `ui-product-companion` 的换位材质、设置布局、全局规则 Host API、预加载、说明和定向回归；不改变 V12 人物身份、132 × 118／164 × 147 固定尺寸、输入框真实位移判定、麦克风、任务气泡、模型调用或其他插件。旧 V11 素材仍可留在工作树中，但当前运行路径和发行白名单只使用 V13。
- 验证：素材构建生成 136 张 V12 人物帧、40 张 V9 兼容门体帧和 96 张 V13 人物材质遮罩；三个定向 Vitest 文件 34／34、Host／Client TypeScript 与插件 bundle 通过。真实 `http://127.0.0.1:3080/` 在 1280 × 720 设置窗口中确认改名表单位于滚动区内、最大宽度 348 px、弹窗上下均在视口内且旧长文案消失；规则编辑器加载现有 276 字符的 `~/.dsh/AGENTS.md`，首行为 `# Persona (all models)`，页面没有“重新读取”和“创建并保存”。宽屏侧栏换位采样完整经过 `departing → arriving → idle`，48 张 V13 遮罩全部出现，人物地址始终为 V12，根节点全程恒为 164 × 147；中间态显示 `body-mask-23`／`body-mask-22`／`fragment-mask-23`，页面无应用 error，只有重启服务瞬间的预期重连 warning。

### 2026-08-25 12:12 - 鲸少女四套趴姿统一瘦化下半身

- 本次任务：根据真实页面截图修正鲸少女下半身过于厚重的问题，不用 CSS 局部缩放，而是重绘整套角色母图，让腰部以下更纤细并增加腿部周围留白，同时保证所有 Agent 状态和蓝黑皮肤使用一致体型。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v12/` 的趴姿、专注、等待、完成四张重绘母表与兼容传送母表，并生成 `assets/v12/` 的蓝黑 136 张运行帧；修改素材构建版本、Host 白名单、Client 资源 URL、发行清单、素材／组件测试、插件与素材双语 README；同步更新仓库根双语 README、三组配对记录和本文件。
- 改了什么：使用内置 ImageGen 对 V8 四张实际状态母表逐张做身份保持编辑，锁定已验收的脸、发型、上半身、服装、手势、动作顺序、格线和品红抠图底，只收窄腰部以下轮廓、分开抬起的双腿并增加透明留白。构建从 V12 母表生成同轮廓的深海蓝／夜航黑两套帧，运行时与 Host 全部改读不可变的 `/v12/` 地址；V11 身体消散遮罩仍直接作用于当时同一张 V12 人物图。新增视觉回归检查四种状态的右下身体占用比例必须低于 53.5%，同时相机锁定只测最大人物主体，不把完成动画里独立飞出的鲸鱼误判为人物高度漂移。
- 为什么这样改：截图中的厚重感来自源画里臀腿与靴子的真实像素轮廓，CSS 只压缩局部会破坏人体线条、接触基线和消散遮罩。重绘所有 active 状态母表才能从共同根因解决，并避免角色从休息切到专注、等待或完成时忽胖忽瘦。
- 影响了哪些模块：只影响 `ui-product-companion` 的角色生成源、蓝黑运行帧、静态分发、预加载、说明和定向视觉回归；人物外框 132 × 118／164 × 147、输入框锚点、Agent 状态映射、身体消散逻辑、语音、任务气泡、项目规则与热插拔边界不变。项目用途、代码结构和关键入口未改变，第 1–3 节已复核仍然准确。
- 验证：素材构建生成 136 张 V12 角色帧、40 张 V9 兼容门体帧和 64 张 V11 身体遮罩。新趴姿右下区域平均可见像素由 16,489 降至 14,320，减少约 13%；蓝黑轮廓逐像素一致。素材／组件定向 Vitest 31／31、Host／Client TypeScript 和插件 bundle 通过。真实 `http://127.0.0.1:3080/` 显示 `/v12/black-lounge-*.png`，放大档外框恒为 164 × 147；打开 Computer Use 触发真实换位的 102 个过渡采样完整经过 `departing → arriving → idle`，全过程只冻结同一张 `v12/black-lounge-16.png`，混用人物、旧 V8 地址和独立泡沫地址均为 0。页面无框架错误层；控制台仅有本次重启服务瞬间的预期重连 warning。

### 2026-08-25 11:21 - 泡沫换位改为角色身体本身消散重组

- 本次任务：纠正“独立泡沫云盖住人物、人物整体淡出”的错误视觉对象，让现有角色自己的头发、皮肤、衣服和身体轮廓逐步化为泡沫片段，并在新位置由同一批片段重组。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/v11/` 的 32 张 `body-mask` 与 32 张 `fragment-mask`；修改同包素材构建脚本、Host 素材白名单、发行清单、动画契约、`ProductCompanion.tsx`、CSS、文案、素材／组件测试、插件与素材双语 README；同步更新仓库根双语 README、三组配对记录和本文件。通过内置 ImageGen 生成的身体消散接触表仅用于校准动作节奏，因轻微改脸和棋盘底未进入生产素材。
- 改了什么：删除运行时独立 V10 泡沫图层、整个人物透明度／模糊动画和对应预加载路径。920 ms 换位阶段现在冻结当时真实角色图片，并把 32 级确定性遮罩直接应用到这一张图片；外缘、靴子、发梢和服装边缘先分解，脸部延后，最近移除的圆形区域再以同一人物原像素作为轻微上浮片段。每级保留前一遮罩并以 36 ms 淡出，离开完全透明后才切换坐标，到达严格反放；标准／放大、深海蓝／夜航黑全部复用同一组遮罩。
- 为什么这样改：用户要看到的是“这个角色的身体变成泡沫”，不是另一团泡沫挡住角色。遮罩直接作用于当前角色图，才能保证任意一帧中的脸、发色、肤色和服装纹理都来自同一个人物，同时避免生成式过渡帧造成换脸、改身材、尺寸跳变或视觉覆盖。
- 影响了哪些模块：只影响 `ui-product-companion` 的换位材质、素材构建／分发、预加载、说明和定向回归；输入框位置稳定判断、坐标切换时机、趴姿语义动作、蓝黑皮肤、标准／放大尺寸、任务气泡、麦克风、项目规则编辑和热插拔边界保持不变。项目用途、代码结构和关键入口未改变，第 1–3 节已复核仍然准确。
- 验证：素材构建生成 64 张 384 × 384 V11 透明遮罩；身体覆盖量从首帧全保留到末帧全透明单调下降，中间片段遮罩非空。素材／组件定向 Vitest 30／30、Host／Client TypeScript、插件 bundle、三组双语配对与 `git diff --check` 通过。真实 `http://127.0.0.1:3080/` 先关闭三块并排对话、再打开 Computer Use，两次真实输入框换位均进入 `departing → arriving → idle`；中间态同时出现 `body-mask-17`、`body-mask-16` 和 `fragment-mask-17`，所有可见图片地址始终只有同一张 `black-lounge-16.png`，旧 `bubble-effect` 地址为 0，根节点始终为 164 × 147。页面完整且无框架错误层；控制台仅保留重启本地服务瞬间的预期重连 warning，无应用 error。

### 2026-08-25 11:20 - 多对话分屏支持相邻拖动调宽

- 本次任务：为已经可用的 2–4 块并排对话增加真正的放大／缩小能力，并确保一块变宽时其他块不会错位、覆盖或丢失输入区。
- 改了哪些文件：`packages/client/ui-multi-window/src/client/SplitPaneWorkspace.tsx`、`SplitPaneWorkspace.module.css`、文案、组件测试和双语 README；`packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css`；仓库根与 client 双语 README、配对记录及本文件。
- 改了什么：每条块间边界现在都是 10 px 隐形命中区和 3 px 低干扰指示线；拖动只重新分配相邻两块的比例，总宽度和其他块保持不变。四块或窄窗口使用随总宽度收缩的 120–180 px 动态下限；主块与副块共享同一比例数组，因此第一条分隔线也能连续改变主块。双击或 Enter 恢复均分，左右方向键可细调，当前对话组合的比例保存到本机并随刷新恢复；拖动时暂时禁用嵌入页指针，防止 iframe 抢走鼠标造成断拖。
- 为什么这样改：用户需要的是在同一个并排工作台里临时聚焦某段对话，而不是固定等宽或打开另一层页面。相邻重分配比每块放一组放大／缩小按钮更直接，也不会引入“谁被挤到哪里”的额外模式；动态下限保证放大有明显效果，同时保住其他输入框的核心可用性。
- 影响了哪些模块：影响 `ui-multi-window` 的布局状态、键鼠交互和持久化，以及 `ui-conversation` 主块的 flex 最小宽度；不修改会话数据、草稿、发送、模型、Agent、窗口数量上限、澜汐、Computer Use 或其他插件。项目用途、代码结构和关键入口未改变，第 1–3 节仍然准确。
- 验证：Multi-window 4 个定向 Vitest 文件 10／10、Multi-window 与 Conversation TypeScript、两个相关 bundle、三组双语配对和 `git diff --check` 通过。真实 `http://127.0.0.1:3080/` 从会话菜单依次加到四块：初始四块分别约 249／250／250／250 px，第二条分隔线右移后只变为 249／274／226／250 px，主块和第三个副块没有变化，页面横向溢出始终为 0；刷新后 274／226／250 px 的副块比例仍然恢复。双块验证中按方向键后主副块由 499／500 变为 523／476，双击立即回到 499／500；真实页面没有错误覆盖层。

### 2026-08-25 10:38 - 麦克风统一黑色波形并取消产品录音时限

- 本次任务：修复麦克风按钮在空闲／听写／悬停之间变色和变形的问题，并去掉过短的单段听写限制；麦克风不应改变精灵本身的动作。
- 改了哪些文件：`packages/client/ui-product-companion/src/client/voice-input.ts`、`ProductCompanion.tsx`、`ProductCompanion.module.css`、组件测试、插件双语 README、仓库根双语 README、两组配对记录与本文件。
- 改了什么：麦克风入口在空闲和听写时统一为黑底白色波形，悬停保持同一背景、边框与阴影，不设置原生 `title`，听写中只让波形跳动；移除“听写即切到 waiting 人物轨道”的分支，让人物只跟随 Agent 状态。浏览器识别改为 `continuous=true`，并把用户的持续听写意图与浏览器单段识别生命周期分离：浏览器因静默或服务轮换触发 `onend` 时保留本段文字、120 ms 后自动续接，只有用户再次点击／按快捷键、关闭功能、卸载插件或系统权限／服务真正失败时结束并回填全部累计原文。
- 为什么这样改：用户把黑色跳动波形视为一个稳定的麦克风控件，颜色、按钮形态和人物动作同时变化会让同一次操作出现三个无关反馈；`continuous=false` 又把浏览器单段寿命错误暴露成产品录音时限。稳定视觉和自动续接能让“开始一次、持续说、主动结束”成为唯一主链路。
- 影响了哪些模块：只影响 `ui-product-companion` 的麦克风样式、听写生命周期、人物轨道选择、说明和定向回归；不新增设置、倒计时、录音持久化、AI 处理或模型调用。项目用途、代码结构和关键入口未改变，第 1–3 节已复核仍然准确。
- 验证：本次相关组件 Vitest 23／23、Host／Client TypeScript、插件 bundle、双语配对与 `git diff --check` 通过；回归覆盖空闲／录音按钮使用同一视觉标记、悬停无 tooltip、听写不改变人物轨道、浏览器自动结束后重新开始、跨两段累计文字直到用户主动停止。未改动的素材测试曾与组件合跑 30／30，通过后再次冷读 40 张泡沫 PNG 时先后碰到 5 秒与 15 秒进程预算超时，均没有断言失败，因此未为本次麦克风修复修改素材或放宽仓库默认测试。真实 `http://127.0.0.1:3080/` 页面确认默认按钮为 `rgb(15,17,21)` 黑底、白色波形、无 `title`、无 tooltip，角色仍为 `lounge`；全新页面内容完整、无框架错误层且浏览器 error／warning 为 0。为避免擅自触发 macOS 麦克风隐私授权，未代用户录制真实声音；底层续接与回填由浏览器组件回归验证。

### 2026-08-25 10:30 - 精灵换位改为泡沫消散与重新聚合

- 本次任务：废弃视觉突兀的传送门换位，让精灵像泡沫一样逐渐消散，并在输入框的新位置由泡沫逐渐重新出现。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v10/blue-bubble-dissolve-sheet.png` 与 `assets/v10/` 蓝黑各 20 张运行帧；修改素材构建脚本、Host 白名单、包发行清单、`ProductCompanion.tsx`、动画契约、CSS、文案、素材／组件测试，以及仓库、插件、素材三组双语 README 和本文件。
- 改了什么：通过内置 ImageGen 重新绘制不含人物的 5 × 4 泡沫接触表；构建脚本从每格边缘向内识别并清除生成式蓝色渐变背景，保留皂泡膜与珠光泡沫，再确定性生成夜航黑版本。真实换位时人物继续冻结为当前同一张趴姿原画和同一根节点尺寸，20 张泡沫帧从稀疏增长为完全遮挡再散开；人物透明度与轻微模糊按显示器刷新率连续变化，完全消失后才切换坐标，到达阶段反向播放并重新聚合。传送门图、门体缩放和生成式换位人物均退出生产路径。
- 为什么这样改：门体会让用户感到精灵被瞬间搬运，且视觉焦点与趴姿人物割裂；泡沫把“消失—换位—出现”表达成一条连续的材质变化。把人物和泡沫继续拆层，可以保住用户认可的脸型、身材和标准／放大尺寸，不再依赖生成模型在过渡帧里复刻同一人物。
- 影响了哪些模块：只影响 `ui-product-companion` 的换位特效、资源白名单、预加载、说明和定向回归；输入框锚点稳定判断、人物语义动作、蓝黑皮肤选择、标准／放大尺寸、任务气泡、麦克风、项目规则编辑和热插拔边界保持不变。项目用途、代码结构和关键入口未改变。
- 验证：素材构建生成蓝黑共 40 张 384 × 384 透明 V10 泡沫帧；抽查第 1、10、20 帧确认稀疏—完全覆盖—稀疏节奏且无渐变底色。素材与组件定向 Vitest 29／29、Host／Client TypeScript、插件 bundle、三组双语配对与 `git diff --check` 通过。真实 `http://127.0.0.1:3080/` 打开／关闭 Computer Use 触发输入框换位：离开阶段依次出现 V10 夜航黑泡沫 04→18 帧，人物保持同一张 `black-lounge-10.png` 与 164 × 147 放大外框，透明度连续降到 0 后坐标才从 `[988,461]` 切至 `[438,421]`；到达阶段按 20→02 反向聚合并恢复不透明，稳定后仍为 164 × 147。页面有完整内容、无框架错误层，浏览器 error／warning 为 0。

### 2026-08-25 07:34 - 另开窗口重构为页面内多对话分屏

- 本次任务：纠正“另开窗口”被实现为浏览器弹窗的问题，把它改成用户截图所表达的同一页面 2–4 块独立对话，并确保每块在极窄宽度下仍有自己的历史和输入框。
- 改了哪些文件：重构 `packages/client/ui-multi-window/src/client/` 的协调器、菜单 action、分屏组件、样式、双语 README 与测试；扩展 `packages/client/runtime/src/client/window-context.ts`、`ui-layout/AppFrame`、`ui-conversation` 的 slot／骨架／紧凑样式、`ui-computer-use/BrowserWorkspace.tsx`；同步更新根目录与 client 双语 README、锁文件、本机“小庄的插件”展示和本文件，并重新生成相关 Client bundle。
- 改了什么：会话菜单统一改为“并排打开”，所选对话通过新的 `conversation.session.panes` seat 直接加入当前页面；主块与副块按数量分配空间，最多四块。每个副块复用同源 DSH 文档和独立窗口身份键，因此拥有完整历史、独立草稿和发送输入，却不重复侧栏、详情栏、澜汐、用量、导出、浏览器入口或运行底栏。宽度不足时主块保留可用下限，副块组横向滚动；每个副块有独立轻量关闭键，刷新后恢复，已删除或成为主块的重复会话自动清理。打开分屏时暂时收起 Computer Use 工作区，全部关闭后恢复原状态。
- 为什么这样改：用户需要的是同一工作台同时看见并操作多个对话，而不是多个漂浮系统窗口。复用完整会话页面能保住成熟的历史、输入、模型与发送链路；只在副块裁掉低优先级外壳，比另写一套简化聊天器更稳定，也让极窄布局优先服务“阅读与发消息”这一核心任务。
- 影响了哪些模块：影响会话菜单、当前页面会话骨架、嵌入式副块布局、窗口上下文参数、Computer Use 与分屏共存策略、插件中心展示和公开说明；不修改 Session／Agent Host 事实、消息协议、模型调用、会话数据或澜汐运行逻辑。项目用途和代码结构未改变；第 3 节已补充分屏关键入口。
- 验证：Runtime／Layout／Conversation／Computer Use／Multi-window 定向 TypeScript 通过，8 个定向 Vitest 文件 55／55 通过，相关 Client bundle 全部生成。真实 `http://127.0.0.1:3080/` 从会话 `…` 点击“并排打开”后，同一 URL 出现两个 580 px 对话块；主副输入框同时写入不同草稿后互不覆盖，副块的侧栏、用量、导出、浏览器和运行底栏均为 0。820 × 900 下两个输入框各约 352 px、页面 `scrollWidth === clientWidth === 820`；继续增加到四块后四个独立 DSH 文档均加载，页面无系统弹窗。

### 2026-08-25 07:15 - 语音输入退回纯麦克风听写

- 本次任务：彻底移除鲸少女语音输入中的模型选择、提示词、AI 文字整理、调用统计与 Host 模型接口，只保留浏览器麦克风听写和原文回填，并修复麦克风按钮悬停时出现粗黑圈与系统灰色提示的问题。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/voice-input.ts`、`store.ts`、`ProductCompanion.tsx`、`ProductCompanionSettings.tsx`、对应样式／文案／组件测试、Host／Client 入口与 TypeScript 配置、包依赖和 `pnpm-lock.yaml`；删除 `src/voice-host.ts` 与对应 Host 测试；同步更新仓库、插件和素材双语 README、配对记录及本文件。
- 改了什么：听写链路现在只调用浏览器原生 `SpeechRecognition`，识别出的原文按当前光标或选区直接写回输入框；移除语音模型目录、`/voice/process` 本机接口、LLM 依赖、自动路由、处理提示、回退策略和累计统计。启动时只清理旧版本遗留的五项 AI 语音偏好，不影响名字、皮肤、快捷动作或显示设置。麦克风按钮不再设置原生 `title`，保留 `aria-label`，悬停改为轻灰底与 1 px 级柔和阴影，键盘焦点使用低强度品牌光环。
- 为什么这样改：用户需要的是可预测的“开麦克风 → 原文进入当前输入框”，不是一条隐藏的二次模型加工链；删除模型中转可以避免识别结果被改写、等待模型和额外 Token 消耗。截图中的灰色浮层来自浏览器原生 `title`，粗黑圈来自通用焦点样式，因此从共同根因而不是额外遮罩处理。
- 影响了哪些模块：只影响 `ui-product-companion` 的麦克风入口、设置、持久化迁移、Host 生命周期和说明；语音不再进入任何模型或 Agent 链路。输入框、普通消息、项目规则、人物动作、传送门、任务气泡和其他插件保持不变。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：数字伙伴组件与素材定向 Vitest 29／29、Host／Client TypeScript 和插件 bundle 通过。真实 `http://127.0.0.1:3080/` 中，鲸少女设置只显示“麦克风听写”“应用内快捷键”和隐私说明，不再出现文字处理模型、处理要求、智能整理或本机累计；麦克风按钮仍有可访问名称但 `title=null`，真实悬停为轻灰底、柔和阴影、无黑色 outline，页面控制台 error／warning 为 0。为避免代用户触发 macOS 麦克风隐私授权，没有实际录音；原始识别结果按光标写回由组件回归覆盖。

### 2026-08-25 07:15 - 传送门升级为 20 张真实能量帧

- 本次任务：继续解决独立门体只有一张静态图、换位时虽然人物不再缩放但星流和边缘能量仍显得机械的问题；用户明确要求增加真实绘制帧，让传送过程更流畅。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v9/blue-portal-effect-sheet-a.png`、`blue-portal-effect-sheet-b.png` 与蓝黑各 20 张 `assets/v9/` 运行帧；修改素材构建脚本、Host 资源白名单、Client 角色组件、动画契约、CSS、素材／组件测试和同包双语 README；同步更新仓库根双语 README、配对记录和本文件。
- 改了什么：通过内置 ImageGen 绘制 20 张纯传送门能量画面，门框外轮廓、中心和尺寸保持一致，只推进内部星流、边缘亮度与粒子。首张接触表因模型错误裁短末行，构建明确拒绝残帧，只读取 15 个完整格并从独立五帧横条补齐；构建自动检测黑色分隔线、抠除品红背景、清理残线、按真实门体边界归一并生成夜航黑。离开按 1 → 20 播放，到达按 20 → 1 反放，相邻两帧用 38 ms 淡化；门体缩放和人物遮挡仍由 680 ms 合成层动画按屏幕刷新率完成。
- 为什么这样改：一张门图即使由 CSS 以 60 Hz 展开，门内纹理本身仍完全静止，视觉上会像贴图被拉伸。人物保持单一原画、门体增加独立能量帧，既保住同一人物和固定尺寸，又让真正需要变化的星流拥有足够时间采样。
- 影响了哪些模块：只影响 `ui-product-companion` 的门体素材、预加载和传送特效播放；输入框位移判定、人物原画、标准／放大根节点、语义趴姿、任务气泡、语音、项目规则编辑和热插拔边界保持不变。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：素材构建生成蓝黑共 40 张 384 × 384 透明门体帧；抽查第 1、10、16、20 帧确认门体完整且视觉尺寸一致。素材／组件定向 Vitest 29／29、Host／Client TypeScript 与插件 bundle 通过，覆盖透明边缘、蓝黑轮廓一致、20 帧边界漂移限制、URL 边界、正向／反向序列和帧间淡化契约。真实 `http://127.0.0.1:3080/` 从主对话点击 Computer Use 触发输入框换位，连续 100 次约 16 ms 采样完整经过 `departing → arriving → idle`：20 个夜航黑门体地址全部出现，到达按 20 → 1 反放，相邻时刻最多两层用于淡化；整个传送期人物地址冻结为同一张 `black-lounge-17.png`，根节点恒为放大档 164 × 147，坐标只在遮挡中点由 `[438,421]` 切到 `[988,461]`。页面有完整内容、无框架错误层，控制台 error／warning 为 0。

### 2026-08-25 06:45 - 传送动画改为同一人物与独立门体合成

- 本次任务：彻底解决鲸少女换位传送时人物看起来缩小、姿态比例漂移和逐帧卡顿的问题；上一版虽然锁定 DOM 外框和底部基线，但生成模型仍在 12 张图里反复重画人物，视觉上并不是同一个稳定对象。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v9/blue-portal-effect.png` 与 `assets/v9/` 蓝黑运行特效；修改同包素材构建脚本、Host 白名单、Client 角色组件、动画契约、CSS、发行文件清单、素材／组件测试和双语 README；同步更新仓库根双语 README、配对记录和本文件。
- 改了什么：通过内置 ImageGen 只重绘一张不含人物的 DeepSeek 蓝色传送门，构建时从预览网格提取真实透明通道并生成夜航黑版本。传送阶段始终复用当前趴姿人物图片，不再切换到生成式传送人物帧；独立门体只用 transform 与 opacity 在浏览器合成层连续展开，人物被完全遮住后才切换坐标，再在目标位置连续收拢。标准／放大版分别保持 132 × 118 与 164 × 147 根节点，门体用同一百分比几何适配。
- 为什么这样改：增加生成帧只能缓解时间采样，无法阻止脸型、肩线、胸腰比例和画面重心在每张重绘中漂移。把人物和特效拆层后，人物身份、视觉尺寸与语义动作只有一个真源；门体由显示器刷新率插值，直接消除 24 fps 换图造成的顿挫。
- 影响了哪些模块：只影响 `ui-product-companion` 的真实换位传送、素材构建与说明；旧 V8 传送帧继续留在发行包用于兼容，但不再预解码或参与运行。输入框稳定判断、会话切换条件、语义趴姿动作、语音、任务气泡、插件热插拔和其他产品插件保持不变。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：素材／组件定向 Vitest 29／29、Host／Client TypeScript 与插件 bundle 通过；真实 `http://127.0.0.1:3080/` 打开 Computer Use 使输入框从右侧宽布局换到窄布局，连续 100 次约 16 ms 采样完整覆盖 `idle → departing → arriving → idle`，整个传送期人物地址冻结为同一张 `blue-lounge-10.png`，门体始终使用同一张 V9 特效，根节点恒为放大档 164 × 147，坐标只在门体完全展开时由 `[948,479]` 切到 `[438,439]`，新特效 GET 返回 200。

### 2026-08-25 05:25 - 插件中心增加搜索与自动分类目录

- 本次任务：在插件数量持续增长后，为“小庄的插件”增加直接搜索和小字分组标题，并建立后续新插件只登记一次即可自动归类的目录规则。
- 改了哪些文件：本机 `~/.dsh/profiles/web/packages/xiaozhuang-plugins/lib/client.js`、该插件的 UI 契约测试与新增双语 README；仓库根双语 README、配对记录和本文件。
- 改了什么：把 12 项精选能力按真实用途归为“工作能力”“对话体验”“数据与用量”三组；搜索同时匹配插件 id、名称、说明、标签和分类名称，并提供清晰空结果与一键清除。分类、数量和列表全部从 `PLUGINS` 单一元数据目录生成，缺失或未知分类自动进入“其他”，没有新增第二份开关状态或手工分组清单。
- 为什么这样改：单列列表已经难以快速定位插件；把分组写死在 JSX 又会让每次新增功能同时修改两份目录。分类元数据让插件含义由拥有者明确声明，页面负责自动组织，操作路径仍保持一个设置页和一个搜索框。
- 影响了哪些模块：只影响本机 `xiaozhuang-plugins` 的目录呈现、搜索与说明文档；Host Loader、热插拔 API、每个功能插件、设置持久化和现有开关状态保持不变。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：插件中心 Host／Client 契约 9／9、客户端语法检查通过；真实 `http://127.0.0.1:3080/` 热更新后显示 4／5／3 的三组目录，搜索 `Token` 同时命中“运行概览”和“Token 总览”，无结果状态和清除入口正常；900×700、700×700 两档真实窗口无横向溢出，页面控制台 error／warning 为 0。

### 2026-08-25 05:00 - 发布 Xiaozhuang DSH v0.2.0 可下载发行包

- 本次任务：在全部功能按板块提交并推送后，重写发行入口说明、生成可直接分享的公开版本，并从独立解压目录验证用户下载路径。
- 改了哪些文件：更新仓库双语 README、翻译配对记录与本文件；远端新增 tag `xiaozhuang-v0.2.0`、GitHub Release 和两个发行附件，附件保存在仓库外的临时发布目录。
- 改了什么：以提交 `bc7738f4a8` 打包完整源码、Host／Client `lib`、Web `dist` 和构建环境清单，生成 `xiaozhuang-dsh-v0.2.0-prebuilt-source.tar.gz` 与 `SHA256SUMS.txt`；README 增加版本页、发行包和校验文件的直接入口。发行说明以产品语言列出多窗口、对话文本／长图导出、鲸少女自定义名字、AI 语音输入、项目 `AGENTS.md` 编辑和稳定传送门。
- 为什么这样改：仓库代码和一次性本机运行不能替代可分享版本。用户需要从 README 一步到达固定版本，下载后只安装锁定依赖即可启动，并能用校验值确认附件没有损坏。
- 影响了哪些模块：不改变任何运行时代码；新增公开版本 `https://github.com/niushuanan/xiaozhuang-dsh/releases/tag/xiaozhuang-v0.2.0`。发行包大小 146,558,125 字节，SHA-256 为 `9ecb28fa3f78aad093f5f2dac8f1a989df9b8d1305ffd305c8f9e95c84fdb8c2`，不包含 API Key、登录会话、账号 Token、对话数据、`node_modules`、Git 元数据或本机 Profile。
- 验证：压缩包 17,370 个条目可完整读取，校验文件通过；在独立解压目录用 `pnpm install --frozen-lockfile --offline` 安装 938 个锁定包后，以全新临时 `DSH_HOME` 和随机端口启动成功，首页与 `blue-lounge-01.png` 角色资源均返回 HTTP 200，PNG 为预期的 384 × 384 RGBA。远端 `master` 与本地发布提交在打 tag 前为 0／0，Release API 回读到正确 tag、附件大小与 GitHub 记录的同一 SHA-256。

### 2026-08-25 04:55 - 补齐数字伙伴宿主端正式构建边界

- 本次任务：在汇总、提交和发布上述功能前，用正式发行构建检查可安装性，并修复数字伙伴新增语音／项目规则宿主模块没有进入 TypeScript 工程图的问题。
- 改了哪些文件：拆分 `packages/client/ui-product-companion/tsconfig.json` 为 Host／Client 两个工程并新增对应配置；把项目规则和语音的宿主测试改为 `.host.spec.ts`；更新根 `tsconfig.host.json`、`tsconfig.client.json`，并收紧多窗口、窗口上下文和数字伙伴测试中的品牌类型与完整偏好数据。
- 改了什么：Host 工程现在明确编译静态素材服务、语音处理、项目 `AGENTS.md` 编辑和 invariant，Client 工程只编译浏览器角色与设置；两类测试进入正确的聚合编译器，不再让浏览器工程错误吸收 Node 模块。正式类型检查暴露的 SessionId、窗口打开 mock 和 `autoTravel` 测试数据也按真实接口修正。
- 为什么这样改：Vitest 运行通过只证明运行态回归，不能证明发布包的 Host／Client 双构建边界完整。语音和项目规则是原生插件的 Host 能力，必须进入正式工程引用后才能保证其他机器从发布包启动时拿到对应声明与实现。
- 影响了哪些模块：只调整 `ui-product-companion` 的构建归属和三组测试类型，不改变语音、项目规则、角色传送、多窗口或对话导出的用户行为。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：`pnpm exec tsc -b tsconfig.host.json tsconfig.client.json` 与完整 `pnpm run build:official` 均通过；Web 生产前端完成 336 个模块转换，发行构建记录 208 个 Client 产物和 3 个公开值。

### 2026-08-25 04:34 - 传送门只响应输入框最终真实换位

- 本次任务：修复切换对话时输入框最终位置未变、鲸少女却仍播放传送门的问题；对话或窗口变化本身不能成为传送条件。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/ProductCompanion.tsx`、`tests/product-companion.client.spec.tsx`、插件双语 README、仓库双语 README 与配对记录，并更新本文件。
- 改了什么：移除输入框锚点计算对当前 Session 的无意义依赖；保留普通布局 120 ms 稳定判断和 6 px 最小有效位移，并为真实对话切换增加 360 ms 尾沿稳定窗。Session 变化现在只取消未完成传送并暂停定位，不再提供目标坐标；观察到的每次输入框几何变化都会重启计时，最终仍回到当前角色锚点时直接取消，最终坐标确实变化时才调用传送。
- 为什么这样改：真实切换时序会先把输入框短暂渲染到页面底部，约 170 ms 后再恢复原来的最终位置。旧逻辑把这段中间态当成目的地，造成“输入框没动却开门”；比较稳定后的最终锚点才能表达用户看到的真实位置变化。
- 影响了哪些模块：只影响 `ui-product-companion` 的输入框测量稳定期和传送触发条件；不改变人物素材、传送帧、Agent 状态动作、会话切换、输入框布局、消息发送、任务气泡、语音、模型调用或插件热插拔。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：两个定向 Vitest 文件 29／29、包级 TypeScript 和插件 bundle 通过。真实 `http://127.0.0.1:3080/` 刷新 Host 后，两个最终输入框矩形同为 `[296,656,818,750]` 的对话互切，1.5 秒内连续 53 次采样均为 `teleport=idle`、传送帧计数为 0；打开 Computer Use 使输入框从 `[72,656,818,750]` 真正变为 `[72,616,392,750]` 时，稳定约 120 ms 后正常进入 `departing → arriving → idle`，证明误触发被消除且真实换位链路保留。

### 2026-08-25 04:12 - 数字伙伴传送动画统一人物视觉尺寸

- 本次任务：修复鲸少女从趴姿切换到传送门时突然变成远景小人的尺寸断层，并确保标准／放大尺寸下看到的是同一个等比人物。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v8/blue-portal-sheet.png`，重新生成同包 `assets/v8/` 的蓝黑运行帧；修改素材构建脚本、24 fps 动画序列、Host 素材白名单、素材／组件测试、插件与素材双语 README、仓库双语 README，并更新本文件。
- 改了什么：用内置 ImageGen 依据现有脸型、趴姿和旧门体重新绘制 4 × 3、12 帧近景传送过程。第一帧沿用趴姿的 295 px 人物宽度，随后角色抬起上身并由逐渐展开的门体遮挡，不再切换为小比例全身站姿；构建阶段保持固定 `0.82` 光学倍率，并把 12 帧逐张平移到 343 px 输入框接触基线。运行序列由 6 张扩为 12 张，中间张按 24 fps 单拍曝光；两套皮肤从每套 62 张增加到 68 张，总计 136 张。标准／放大仍只改变同一根节点整体尺寸，不存在传送专用缩放。
- 为什么这样改：根节点宽高相同只能证明 DOM 容器没有缩放，不能证明原画里的人物看起来一样大。旧回归把人物和传送门合并后的透明轮廓当成“人物尺寸”，大门会掩盖小人的缩小；现在首帧直接对比趴姿人物宽高，并单独锁定每张传送帧的底部基线，覆盖用户真正看到的尺寸连续性。
- 影响了哪些模块：只影响 `ui-product-companion` 的传送素材、素材生成、播放时长、静态白名单和说明；不改趴姿四条语义循环、角色设置、热插拔、输入框测量、坐标切换、任务气泡、语音、会话或模型调用。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：定向素材／组件 Vitest 28／28 通过；生成后的趴姿与传送首帧人物宽度均为 295 px，12 张传送帧底部均为 343 px，蓝黑轮廓逐帧一致；标准／放大切换回归确认只改变 132 × 118 与 164 × 147 的显示框，素材比例不变。真实 `http://127.0.0.1:3080/` 刷新 Host 后，第 12 帧资源返回 200；通过展开／收起 Computer Use 工作区触发输入框换位，放大档逐帧采样覆盖 `portal-01` 至 `portal-12`，每张均解码为 384 × 384，整个传送期间根节点始终为 164 × 147 px，旧锚点到新锚点只在门体完全遮挡阶段切换，最终恢复趴姿；页面无传送专用 `scale()`。

### 2026-08-25 03:53 - Session Log 改为普通用户可理解的双格式对话导出

- 本次任务：把 Header 中直接下载的英文 `Session log` 改为清晰的“导出对话”菜单，并新增一张图片导出完整问答的能力；图片必须忽略模型思考与中间工具过程。
- 改了哪些文件：新增 `packages/session-query/session-log-export/src/client/image-export.ts` 与对应定向测试；修改同包的 Header action、下载控制器、共用弹窗、浏览器装配、双语文案、组件／控制器测试、双语 README 与配对记录，并更新本文件。
- 改了什么：点击 Header 的“导出对话”后显示同规格的“导出文本记录”和“导出对话图片”两项。文本记录保持现有 Host Session ZIP 端点和 `/export` 命令不变；图片路径先通过 Session Runtime 加载全部旧历史，再从结构化节点中只抽取用户／Steering 内容、助手正文与仍在生成的正文，明确排除 reasoning、工具调用、上下文、命令、错误卡片和用量。专用 Canvas 将内容排成一张 PNG 长图，按设备像素比清晰输出并限制最大画布尺寸／面积；文件名优先使用当前对话标题。
- 为什么这样改：原按钮把内部 `Session log` 概念和 ZIP 细节直接暴露给普通用户，且直接点击没有格式选择。基于会话数据生成专用长图比截取当前 DOM 更可靠：无需用户展开历史，也不会意外把折叠的思考过程带进分享图片；保留原路径则不破坏高级用户的完整记录归档。
- 影响了哪些模块：影响 `session-log-export` 浏览器插件的 Header 入口、状态弹窗、Session Runtime 读取与文档；不改变 Host ZIP 协议、`/export` 命令、Session 事件、Agent 运行、模型调用或其他插件。图片当前只覆盖当前 Session，附件用“【图片】”占位，子 Session 仍只随原 ZIP 导出。项目用途仍准确；第 2–3 节补充了 `packages/session-query/` 与具体导出入口。
- 验证：同包 8 个定向 Vitest 文件 23／23、包级 TypeScript、client bundle、双语说明配对与 `git diff --check` 通过。真实 `http://127.0.0.1:3080/` 已按“点击导出对话 → 选择两种格式”路径验收：菜单中文案与状态正确；图片导出真实生成 2160 × 13696、3.36 MB 的单张 PNG，逐段检查只含用户问题和助手正文，页面中存在的 `Think` 与工具过程未进入图片；原文本记录路径仍进入既有 Session ZIP 下载流程，验收时浏览器新增 error／warning 为 0。

### 2026-08-25 03:24 - 设置目录跟随精灵自定义名字

- 本次任务：修复精灵页内已显示自定义名字，但设置左侧目录仍固定写成“数字伙伴”的命名脱节。
- 改了哪些文件：修改 `packages/client/ui-settings/src/client/contract/slots.ts`、`packages/client/ui-settings-general/src/client/SettingsRoot.tsx` 与定向测试；修改 `packages/client/ui-product-companion/src/client/` 的 store、注册入口、设置页和文案，同步更新组件测试、插件双语 README 与本文件。
- 改了什么：精灵设置条目的首次显示直接读取已持久化的名字，无自定义值时显示默认名“鲸少女”；在页内保存新名时，通用设置壳层提供的可选 `setLabel` 能力会立即更新左侧目录，关闭再打开设置也保持。删除该插件未再使用的固定目录文案，改名输入的辅助名称改为“精灵名字”。
- 为什么这样改：设置目录表达的是用户正在管理的角色，不是内部插件类别；页内名字、目录、操作和显示开关应共用同一个用户事实。技术 id 和持久化 key 继续稳定，避免仅因改名破坏热插拔或旧偏好。
- 影响了哪些模块：影响设置导航标签的通用可选更名能力和 `ui-product-companion` 的名字投影；其他设置页不调用 `setLabel` 时完全沿用原注册标题。不改角色动画、会话、模型调用、项目规则编辑或插件技术身份。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：`ui-settings-general` 与 `ui-product-companion` 两个定向 Vitest 文件 39／39 通过；`ui-settings`、`ui-settings-general` 和 `ui-product-companion` 定向 TypeScript 工程、三个插件 bundle 及双语说明配对检查通过。真实 `http://127.0.0.1:3080/` 中初始目录显示“鲸少女”；临时改为“小蓝验收”后目录和页内标题同步变更，关闭再打开设置仍保留，验收后已恢复原名、关闭设置并还原侧栏状态；本次验收时段无新增浏览器错误。

### 2026-08-25 03:14 - 在数字伙伴页直接编辑当前项目 AGENTS.md

- 本次任务：把整个项目的 Agent Markdown 入口收进现有“数字伙伴”设置页，保持能力由原生插件持有，但不在“小庄的插件”或设置目录中再增加一个独立条目。
- 改了哪些文件：新增 `packages/client/ui-product-companion/src/project-rules-host.ts`、`src/client/project-rules.ts` 和 `tests/project-rules-host.spec.ts`；修改同包 Host 入口、数字伙伴设置组件、样式、中英文案、组件测试、双语 README 与配对记录，并更新本文件。
- 改了什么：设置页从全局 `useSessions` 事实读取当前对话的真实 `cwd`，自动加载该项目根目录的固定文件 `AGENTS.md`；文件不存在时第一次输入并保存会创建，已有文件可编辑、重新读取或用 `Cmd/Ctrl+S` 保存。Host API 只允许本机、绝对项目目录和固定文件名，限制文件大小，写入前校验内容修订值，并用同目录临时文件原子替换；外部编辑产生冲突时前端阻止覆盖并引导重新读取。没有项目目录时只显示说明，不猜测全局目标。
- 为什么这样改：项目级 Agent 规则是角色协助当前项目的一部分，用户需要在正在使用的数字伙伴页面完成，而不是去插件清单理解一个后端能力或再进入新设置栏目。复用 Session Runtime 的工作目录可以去掉文件选择步骤；固定文件名和修订冲突保护则让 IDE 与 DSH 并行编辑时可恢复。
- 影响了哪些模块：只影响 `ui-product-companion` 的设置页、同生命周期 Host 文件 API、文案和说明；不新增插件清单项，不改变 Agent Preset、全局 `~/.dsh/AGENTS.md`、会话消息、模型调用、工作区注册或其他插件。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：项目规则 Host、语音 Host 与数字伙伴组件 3 个定向 Vitest 文件 26／26 通过；包级 TypeScript、插件 bundle、双语配对和 `git diff --check` 通过。真实 `http://127.0.0.1:3080/` 已确认数字伙伴页根据当前会话显示“认知测评”项目、直接加载 `AGENTS.md` 编辑器，真实 Host 能读取仓库根文件；842 × 783 和 620 × 800 下编辑器均无横向溢出。写入／创建／外部冲突由真实临时目录回归完成，没有改动当前“认知测评”项目文件。

### 2026-08-25 02:35 - 会话另开窗口原生插件

- 本次任务：在会话 `…` 菜单增加可热插拔的“另开窗口”，支持最多四个完整 DSH 窗口同时工作，并确保附属窗口不会复制数字伙伴。
- 改了哪些文件：新增 `packages/client/ui-multi-window/` 的 Host／Client 入口、租约协调器、菜单 action、双语 README 和定向测试；修改 `ui-workspace` 的会话菜单 child slot、`ui-primitives` 的可插拔菜单行与新窗口图标、`client-runtime` 的窗口身份和选择持久化、`ui-product-companion` 的主窗口 overlay 归属、Web bundle、TypeScript 工程映射、插件治理清单、根目录／client 双语 README、锁文件及本机“小庄的插件”映射与 profile 开关。
- 改了什么：非空会话行的原生菜单通过 `sidebar.workspaces.sessionMenuAction` slot 接入第四项“另开窗口”；点击后创建完整附属 DSH 窗口并定位所选会话。主窗口沿用 `dsh.sessions.current`，每个附属窗口按稳定 id 使用独立持久化 key，并在会话变化时更新自己的 URL 与标题。窗口用本地 2 秒租约心跳计数，主窗口在内最多四个，弹窗失败立即回收名额，异常关闭最迟七秒过期。附属窗口保留数字伙伴设置但不注册第二个角色 overlay。
- 为什么这样改：用户需要的是多个可独立输入、发送和切换的完整工作面，而不是在一个窄页面里硬塞四列。独立导航身份解决多窗口互相抢当前会话的共同根因；slot 注入和 Loader 行保证能力关闭时入口与协调器一起卸载；保留已打开窗口避免热关闭插件时破坏未发送草稿或正在查看的任务。
- 影响了哪些模块：影响会话侧栏菜单扩展点、浏览器窗口生命周期、当前会话本地持久化、数字伙伴 overlay 装配、Web bundle 和“小庄的插件”列表；不改变 Session／Agent Host 事实、消息协议、模型调用、工作区数据、语音输入或其他插件行为。
- 验证：`runtime`、`ui-primitives`、`ui-workspace`、`ui-multi-window` 与 `ui-product-companion` 定向 TypeScript 通过；新增真实 Slot 装配测试后，7 个定向 Vitest 文件 81／81 通过；新插件、共享 Runtime／Primitives、工作区、数字伙伴与 Web 前端产物均已生成。已在 `http://127.0.0.1:3080/` 按真实路径验收：会话菜单显示第四项“另开窗口”，连续另开到总数四个后入口禁用并提示上限；附属窗口切换会话不会改变主窗口所选会话，附属窗口无数字伙伴而主窗口保留；通过“小庄的插件”同一热插拔接口关闭后菜单项即时消失，重新开启后即时恢复。

### 2026-08-25 02:04 - 数字伙伴内置可用的 AI 语音输入

- 本次任务：把原来禁用的语音入口做成可直接使用的原生能力，并把模型、文字处理提示、应用内快捷键和使用统计统一放进数字伙伴设置，不新增顶级设置目录。
- 改了哪些文件：新增 `packages/client/ui-product-companion/src/client/voice-input.ts`、`src/voice-host.ts` 和 `tests/voice-host.spec.ts`；修改同包 Host／Client 入口、store、角色组件、设置页、样式、文案、组件测试、依赖与 TypeScript 引用；更新根目录和包级双语 README、两组翻译配对记录、`scripts/verify-package-readme-model-experience.ts`、`pnpm-lock.yaml` 与本文件。
- 改了什么：输入框旁的语音按钮、默认 `⌥ Space` 和可配置的角色单击／双击／右键动作都可开始或结束听写；浏览器原生语音识别结果按当前选区或光标插入真实输入框。用户可以直接回填原文，也可以让 Host 端调用 DSH 已接入模型按自定义提示整理、转述或翻译；自动模式会记住首个真实可用路由并跳过未接通模型，显式模型或全部路由失败时保留原始识别结果。设置只保存开关、模型、提示、快捷键和次数／字数／预计节省时间，不保存录音与听写正文；关闭 Loader 行会同时卸载角色、麦克风入口、快捷键和本机 API。
- 为什么这样改：语音输入的用户任务是“说完即可在当前光标得到可发送文字”，模型配置只是可选的二次加工。把录音、识别、模型整理和回填拆成短链路，并沿用数字伙伴已有入口，避免多一套设置概念；Host 代理模型调用可以复用现有账号又不把密钥交给浏览器。
- 影响了哪些模块：只影响 `ui-product-companion` 的语音输入、设置、Host 本机 API、持久化汇总与对应治理文档；不改普通消息发送、会话历史、Agent 循环、其他插件或系统级输入法。当前快捷键只在 DSH 前台有效，系统全局输入仍需后续原生 macOS helper。
- 验证：两个定向 Vitest 文件 22／22、包级 TypeScript、插件 bundle、双语 README 定向配对与 `git diff --check` 通过。真实 3080 Host 返回 DeepSeek／Kimi／GLM／Qwen 模型目录；自动路由跳过未接通的 DeepSeek 后，实际用 Kimi K3 把重复口语整理为自然文本。真实页面在 1440 × 1000 和 760 × 800 下确认数字伙伴内的语音设置、模型菜单、提示词、快捷键、统计和输入框麦克风均可见且未溢出，稳定页面新增 error／warning 为 0。为避免擅自触发系统隐私授权，未代用户录制真实麦克风音频；识别／选区插入由浏览器组件回归覆盖。仓库全量双语和 Model Experience 门禁仍有 `docs/*`、`ui-agent-preset`、`ui-provider-quota` 的既有无关失败，本次改动涉及的两组文档已单独通过。

### 2026-08-25 01:31 - 数字伙伴右键菜单贴近并精简为单一关闭动作

- 本次任务：修复右键数字伙伴后菜单在视觉上离角色过远、选项层级和强调不一致的问题，并让关闭文案跟随用户自定义名字。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/ProductCompanion.tsx`、`ProductCompanion.module.css`、`locales.ts`、定向组件测试、仓库与包级双语 README、两组配对记录，并更新本文件。
- 改了什么：菜单从角色上方改为紧贴角色根节点下方，宽度从 148 px 收紧到 116 px；删除“新建对话”“聚焦输入框”、图标、分隔线和危险态，只保留一行普通菜单项“关闭＋当前名字”。单击、双击和右键直接动作的既有可配置能力保持不变。
- 为什么这样改：角色素材在根节点上半部有透明留白，菜单放在根节点上方即使几何间距只有 4 px，视觉上仍会像悬浮在远处；放到身体下方并只保留一个关闭入口，路径更短，也符合用户对右键关闭的直接预期。
- 影响了哪些模块：只影响 `ui-product-companion` 的默认右键菜单位置、内容与说明；不改变自定义名字存储、其他快捷动作绑定、人物动画、输入框、会话、模型调用或插件热插拔。
- 验证：组件定向 Vitest 16／16、插件 bundle 和双语配对写入通过。真实 3080 页面右键后只有“关闭鲸少女”，菜单为 116 × 32 px，角色框底部 `y=377.5`、菜单顶部 `y=381.5`，实际间距 4 px；页面新增 error／warning 为 0。

### 2026-08-25 01:02 - 数字伙伴默认名“鲸少女”并支持全局改名

- 本次任务：把数字伙伴的默认中文名确定为“鲸少女”，并让用户可以在设置页直接修改，保存后全局生效。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/` 的持久化 store、角色组件、设置页、样式、中英文案和定向测试；更新仓库与插件双语 README、配对记录和本文件。
- 改了什么：旧持久化记录在没有名字字段时自动使用“鲸少女”；设置导航始终使用稳定名称“数字伙伴”，页内标题可原地编辑。自定义名称会同步到角色辅助名称、右键关闭动作和显示开关；空白名称回退默认值。
- 为什么这样改：人物名是用户的个性偏好，不应该和插件身份绑死。保持技术 id、持久化 key 和导航名不变，可以在不丢失皮肤、快捷动作和热插拔状态的前提下允许个性化。
- 影响了哪些模块：只影响 `ui-product-companion` 的显示名、设置交互和说明；不改角色素材、动画、Agent 状态、会话、输入框、模型请求或 Loader 热插拔机制。
- 验证：数字伙伴两个定向 Vitest 文件 23／23 通过，插件 bundle 通过；README 只把 AI 语音输入标为后续迭代，当前禁用图标不伪装已可用。

### 2026-08-25 00:12 - 恢复侧栏官方 DeepSeek Harness 字标

- 本次任务：修复侧栏左上品牌头被普通文字重新拼装的问题，恢复此前确定的官方 DeepSeek 小写字标与独立 `HARNESS` 标牌。
- 改了哪些文件：修改 `packages/client/ui-sidebar/src/client/SidebarRoot.tsx`、`SidebarRoot.module.css`、三组侧栏测试及快照、侧栏双语 README 与配对记录，并更新本文件。
- 改了什么：保留可替换的 `sidebar.brand.mark`／`sidebar.brand.name` slot，但把没有 occupant 时的 fallback 从鱼形标记加普通文本 `DeepSeek Harness` 和 commit hash 胶囊，恢复为鱼形标记加原始 `BrandWordmark includeMark={false}` SVG；删除只服务错误 fallback 的文字字号样式与 hash 胶囊样式。测试现在直接校验原始字标 `viewBox`，并拒绝普通品牌文字和 build hash 出现在品牌头。
- 为什么这样改：普通文本无法复现官方 DeepSeek 字形和 `HARNESS` 标牌比例，把 commit hash 放进品牌区域也会改变既有 logo。品牌 fallback 必须与官方 occupant 保持同一视觉资产，构建模式差异不能被用户看成品牌被改名或重画。
- 影响了哪些模块：只影响侧栏展开状态的默认品牌呈现与对应测试／说明；自定义部署仍可通过原有 slot 替换 mark 或 name，侧栏折叠、会话、设置、数字伙伴、插件和 Agent 运行不变。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：侧栏 3 个定向测试文件 13／13 通过并更新 2 份快照，双语配对、包级 TypeScript、sidebar bundle 与 `git diff --check` 通过。真实 3080 页面折叠再展开后，品牌按钮内只有 24 px 鱼形标记和 `viewBox="26 0 156 24"` 的原始字标 SVG，无普通 `DeepSeek Harness` 文本或 hash；当前窄窗口下完整品牌组为 216 × 24 px、未裁切，稳定窗口新增 error/warn 为 0。

### 2026-08-25 00:01 - 澜汐改用固定尺度传送门跟随输入框

- 本次任务：解决澜汐随输入框爬行时人物体感尺寸忽大忽小的问题，取消爬行，改为旧位置开门、完全隐入后传送、在新位置出现并恢复趴姿。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/animation.ts`、`ProductCompanion.tsx`、`ProductCompanion.module.css`、`locales.ts`、Host 资产白名单、素材构建脚本与两个定向测试；更新 `assets/v8/` 运行素材、插件／素材双语 README、双语 Agent Note、`design-qa.md` 和本文件。
- 改了什么：移除运行时 `crawl` 轨道和根节点位移过渡，增加各 625 ms 的 `portal/departing` 与 `portal/arriving` 两阶段序列。澜汐先在旧锚点站起开门，只有第六张“人物完全消失、只剩门”的画面才能把根节点切到最新输入框锚点，再反向播放同一组原画并恢复趴姿；一次传送期间发生的多次布局变化会自动合并。复用此前已验收的六张传送门原画，并在构建时逐帧标定到与趴姿相同的 295 px 人物最长轴和 343 px 底部基线；每套皮肤现在为 62 张、共 124 张 384 × 384 运行素材。
- 为什么这样改：原爬行动作来自另一组宽幅趴姿构图，不同帧中的人物轮廓占比不一致，即使外层 DOM 没有缩放，移动中仍会明显像人物尺寸发生变化。传送门把坐标变化放在人物完全不可见的瞬间，并让站姿、门内消失和趴姿共享同一光学尺度契约，可以从根因上消除跨屏滑动和忽大忽小。
- 影响了哪些模块：只影响澜汐原生插件对输入框几何变化的过渡动画、V8 静态素材及相应说明；不改变 Agent 状态映射、输入框、消息发送、并发任务气泡、快捷动作、模型调用、热插拔配置或其他插件。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：素材构建生成 124 张运行图；两个定向 Vitest 文件 23／23、包级 TypeScript、插件 bundle 和 `git diff --check` 通过。真实 3080 页面折叠目录使输入框锚点从 `x=819` 移到 `x=747.28125`：离开阶段仍停在旧坐标，到达阶段才出现在新坐标，随后恢复趴姿；离开、到达与稳定三个阶段的根节点均严格保持 `164 × 147 px`。

### 2026-08-24 23:39 - 并发任务气泡保持与自然展开收起

- 本次任务：完善澜汐的并发任务入口，让任务数为 3、4 等多任务状态时可以展开独立消息泡，并在任务之间连续跳转后仍保留整个任务泡层，直到用户主动收起。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/ProductCompanion.tsx`、`packages/client/ui-product-companion/src/client/ProductCompanion.module.css`、`packages/client/ui-product-companion/tests/product-companion.client.spec.tsx`、包级双语 README、澜汐双语 Agent Note 与配对记录，并更新本文件。
- 改了什么：把任务泡的“已挂载”和“已展开”拆成两个状态；点击数字时挂载并展开全部任务泡，点击任一任务只复用现有 `sessions.open()` 切换当前对话，不再关闭泡层，当前任务会即时更新高亮。再次点击数字、按 Escape 或点击空白处时先进入 `closing` 状态，完成 260 ms 退场后再卸载。多个任务不再塞进一张大卡片，而是各自成为独立气泡，并按离数字由近到远的顺序错峰出现、按相反方向回落；系统开启减少动态效果时取消动画。
- 为什么这样改：任务跳转和任务列表显隐是两件不同的用户意图。选择一个任务只表示“去看这件事”，不能推断用户已经看完其余并发任务；把泡层保持到用户主动收起，才能支持连续查看 3–4 个并发任务，也避免每次跳转后重新展开。
- 影响了哪些模块：只影响澜汐原生插件的并发任务气泡、当前任务高亮和展开／收起动效；不新增第二套任务状态，不改变会话运行、消息发送、模型调用、任务排序、语音预告、人物动画或其他插件。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：两个产品伙伴定向测试文件 22／22、包级 TypeScript、插件 bundle、双语配对检查和 `git diff --check` 通过。三任务回归覆盖“展开 → 跳转后台任务 → 泡层保持 → 当前高亮更新 → 再点数字进入退场 → 260 ms 后卸载”；真实 3080 页面完成启动、澜汐、输入框和任务计数入口烟测。当前真实页面没有运行中的任务，因此没有为验收额外制造模型调用，多任务交互由确定性的三任务组件回归证明。

### 2026-08-24 23:27 - 产品伙伴统一更名为澜汐

- 本次任务：为现有成年日漫鲸系数字角色建立不幼稚、可长期使用的正式名称，并把旧品牌文案在产品内外统一替换。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/locales.ts`、组件测试、仓库与插件双语 README、`design-qa.md`、本机“小庄的插件”入口与测试，并把本文件中的旧名称统一更新为“澜汐”。
- 改了什么：中文正式名称确定为“澜汐”，英文界面使用 `Lanxi`；设置目录、设置标题、显示开关、右键关闭、角色辅助名称、插件中心和公开说明全部使用同一名称。公开说明补充“深海波澜与潮汐节律”的命名来源。`product-companion`、`ui-product-companion`、本机持久化 key 与资源路径等技术标识保持不变。
- 为什么这样改：旧名称更像通用桌宠昵称，无法承接当前成年角色的视觉气质，也不利于在设置、插件市场和后续功能中形成稳定身份；“澜汐”同时保留深海、DeepSeek 蓝、鲸系符号和持续陪伴的节律感。保持内部 ID 不变可避免仅因品牌重命名导致热插拔开关、用户偏好和本机配置失效。
- 影响了哪些模块：只影响产品伙伴的用户可见命名、无障碍文案、插件中心展示、测试期望和双语文档；不改变角色素材、动画、Agent 状态映射、会话执行、模型调用、热插拔协议或用户数据。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：两个产品伙伴定向测试文件 22／22、本机插件中心契约 8／8、包级 TypeScript、插件 bundle 和两组双语配对检查通过。真实 3080 页面确认设置目录、独立设置标题、“显示澜汐”开关、角色图片辅助名称和“小庄的插件”热插拔行全部使用新名称；插件开关仍为已开启，页面与仓库均不再出现旧名称。服务重启产生的连接重试日志之后没有新增控制台错误或警告。

### 2026-08-24 23:01 - 修复模型用量误隐藏澜汐并补齐真实热插拔恢复

- 本次任务：修复打开“模型用量”后澜汐被隐藏的问题，并真实验证澜汐作为原生插件可以从“小庄的插件”即时关闭、重新开启和恢复显示。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/ProductCompanion.tsx`、`packages/client/ui-product-companion/tests/product-companion.client.spec.tsx`、插件双语 README 与配对记录，重新生成 `packages/client/ui-product-companion/lib/client.js` 及 source map，并更新本文件。
- 改了什么：澜汐不再把所有 `role="dialog"` 产品面板都当作独占界面的模态窗口，只在同时声明 `aria-modal="true"` 的真实模态窗口出现时暂时让出画布；布局观察签名加入模态状态，使插件从设置窗口内重新启用后，关闭设置即可立即收到状态变化并恢复挂载。回归覆盖非模态“模型用量”共存，以及插件在模态窗口内完成首次布局后仍能随窗口关闭恢复。
- 为什么这样改：ARIA 的 dialog 语义只说明面板类型，不等于它拥有整个产品画布，更不能成为另一个独立插件卸载的依据；同时，Loader 热启用成功但界面要等无关渲染才出现，也不符合用户对热插拔“立即生效”的直觉。
- 影响了哪些模块：只影响澜汐原生插件对非模态面板、真实模态窗口和热启用恢复的可见性判断；不改变模型用量的数据请求、额度展示、会话执行、输入框、角色动画、其他插件或用户数据。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：两个定向 Vitest 文件 22／22、完整 client TypeScript、插件 bundle 和生产构建通过。真实 3080 页面确认模型用量面板打开时澜汐仍可见；从“小庄的插件”关闭后 Loader 为 `disabled`、角色 DOM 为 0 且模型用量保持 `active`，重新开启后 Loader 为 `active`，关闭设置 400ms 内角色立即恢复。最终配置已恢复 `ui-product-companion disabled: false`，模型用量面板已关闭，澜汐保持开启。全量 `test:gui` 为 4052 通过、3 个既有样式／素材超时失败；Web 回放因当前工作区大量既有 ARIA golden 与 30 秒级用例失败并残留测试进程，运行 11 分钟后受控停止，不能标记为通过。

### 2026-08-24 22:32 - 澜汐改为全趴姿并随输入框自然爬行

- 本次任务：取消所有站立动作，让澜汐常驻趴在输入框右侧；输入框因发送消息、分栏或布局回流改变位置时，角色使用自然爬行动作慢慢跟过去，输入框不动时角色不位移。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v8/` 的角色参考与五张全趴姿动作源图、`assets/v8/` 的 144 张蓝黑运行帧；修改素材构建脚本、动画契约、角色组件与样式、Host 静态白名单、设置动作、文案、包清单和两组定向测试；同步更新仓库／插件／素材双语 README、双语 Agent Note、配对记录、`design-qa.md` 与本文件。
- 改了什么：运行轨道收敛为 20 张休息、16 张爬行、12 张专注、12 张等待和 12 张完成，全部锁定同一趴姿镜头、人物尺度和输入框接触线；删除站姿、光门、自动换边、用户拖动和“换到另一侧”可见动作。角色固定使用输入框右侧锚点；MutationObserver、ResizeObserver、滚动监听和 1.2 秒逐帧观察捕获真实布局变化，按 145 px/s、0.9–3.6 秒动态时长在合成层爬向目标。窗口突然缩窄时先稳定到新视口内的锚点，避免从屏外缓慢爬入。
- 为什么这样改：用户需要的是一个与 Agent 和输入区共同生活的数字员工，而不是需要手动管理位置的桌宠。固定右侧趴姿建立稳定心智模型；只有输入框真实移动才触发爬行，既能表现生命感，也不会因鼠标移动或状态切换产生频繁跳动。
- 影响了哪些模块：只影响澜汐原生插件的角色素材、位置跟随、状态动作、设置选项、静态资源路径和对应文档；不改变输入框、发送消息、会话状态、任务气泡、语音预告、模型调用或其他插件。旧 `switchSide` 持久化值仅兼容映射到聚焦输入框，不再显示给用户。
- 验证：素材构建输出 144 张 384 × 384 透明 PNG；两个定向 Vitest 文件 21／21、包级 TypeScript 和插件 bundle 通过。真实 3080 页面确认 V8 图片 `naturalWidth=384`，桌面与 760 px 窄窗口无横向溢出；打开 Computer Use 让输入框右边界从 1166 变为 616 时，角色依次从 `x=966 → 761 → 438` 播放 `crawl`，到达后恢复 `lounge`，与输入框保持 14 px 右侧内收。验收结束后已关闭 Computer Use 并恢复默认视口。

### 2026-08-24 21:35 - 澜汐 V7 性感鲸系形象与完整动作重绘

- 本次任务：继续调整澜汐人物，在明确成年和非露骨边界内增加露肤与时装张力，同时让角色更可爱、更能直接表达 DeepSeek 品牌，并保持全部现有交互可用。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v7/` 的角色母版与五张动作源图、`assets/v7/` 的 124 张蓝黑运行帧和 V7 全帧验收图；修改素材构建脚本、Host 白名单、运行时资源 URL、资产回归、包清单、仓库／插件／素材双语 README、双语 Agent Note、`design-qa.md` 与本文件。
- 改了什么：角色保留用户认可的成年脸型、高挑纤细和自然中等比例，服装改为更深心形线条、露肩钴蓝短外套、腰侧镂空和过膝袜科技时装；新增发光鲸尾发饰、鲸鳍耳饰、鳍形半透明衣摆、声呐光纹和腰间小鲸挂件。重新生成 12 张待机、12 张专注、12 张回应、20 张趴伏和 6 张光门原画；专注循环加入一次小鲸数据脉冲。运行路径升级到 `/assets/v7/`，两套皮肤继续共用完全一致的透明轮廓。
- 为什么这样改：只降低领口会让人物更暴露，却不会更像产品角色。把性感轮廓、成年比例、DeepSeek 鲸系符号和 Agent 工作动作一次统一，才能避免不同状态像不同人物，也能在小尺寸下同时传达魅力、可爱和品牌识别。
- 影响了哪些模块：只影响澜汐原生插件的视觉素材、静态资源白名单、资源路径、素材回归与说明；会话投影、任务气泡、语音预告、左右拖动、快捷动作、消息发送、模型调用和其他插件逻辑不变。
- 验证：素材构建生成 124 张 384 × 384 透明 PNG；两个定向 Vitest 文件共 21 项和包级 TypeScript 通过。全帧接触表确认蓝黑皮肤轮廓一致、没有边缘残片；一张错误的横向专注候选被淘汰，最终采用完整 3 × 4 竖向动作板。真实 3080 页面、窄窗口、专注／趴伏状态与交互验证记录在最新 `design-qa.md`。

### 2026-08-24 21:10 - 澜汐增加并发任务气泡与语音入口预告

- 本次任务：参考用户提供的竞品，在澜汐旁显示当前工作的会话与全产品并发任务数，支持快速展开并跳转，同时预留一个暂不可用的 AI 语音输入入口。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/` 的任务投影、角色组件、样式、文案、注入入口与 store 类型，更新组件测试、包清单、插件与素材双语 README，并新增 `assets/voice-wave.svg`；同步更新本文件。
- 改了什么：从现有 Session Runtime 投影正在运行和等待用户处理的会话，按“等待处理 → 当前对话 → 最近更新”排序。角色上方显示当前任务标题、阶段和已用时间；角色下方右侧显示真实任务数，点击后展开全部任务气泡，点击任意一项直接调用现有 `sessions.open()` 跳转。左侧增加明确禁用的语音波形入口，只显示“敬请期待”，不申请麦克风权限。列表支持点击外部与 Escape 收起，并为窄窗口限制宽度和高度。
- 为什么这样改：并发任务最重要的用户问题不是再造一个聊天系统，而是“现在有几件事在跑、哪件需要我、怎样一跳就到”。直接复用会话真相和现有导航能用最少概念完成这条链路；语音能力尚未实现时必须显式禁用，不能制造可以使用的错觉。
- 影响了哪些模块：只影响澜汐原生插件的任务状态展示、会话快捷跳转和预留语音图形；不读取会话正文、不新增模型调用、不创建第二套路由，也不请求麦克风权限或改变消息发送、会话执行和其他插件。
- 验证：两个定向 Vitest 文件共 21 项、包级 TypeScript 与插件 bundle 通过。真实 3080 页面在 1280 × 720 与 760 × 720 下确认角色和两个 30 px 控件均贴近输入框且不截断；当前无任务时语音和数字均正确禁用。三任务展开、排序、点击跳转和关闭由组件回归覆盖；修复一次旧 bundle 图标导出不一致后，真实页面未再出现新的相关控制台错误。

### 2026-08-24 20:31 - 澜汐可配置快捷动作、放大尺寸与刷新同步动画

- 本次任务：让澜汐的单击、双击、右键可以由用户配置，支持放大但继续贴住输入框，并减少逐帧播放的轻微卡顿。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/` 的角色组件、设置页、store、文案、样式和注册入口，更新组件测试；同步更新仓库与插件双语 README、澜汐双语 Agent Note、视觉验收记录和本文件。
- 改了什么：新增标准／放大尺寸，桌面放大档为 164 × 147 px、窄窗口为 144 × 129 px，每档独立校准透明底部，使可见身体仍贴住输入框上沿。新增单击、双击、右键三组独立绑定；默认分别聚焦输入框、调用产品原生 `workspaces.startSession()` 在当前工作区新建对话、打开包含新建／聚焦／换边／关闭的产品菜单。单击用 240ms 判定窗与双击互斥，拖动和纵向取消后抑制误触。连续轨道从 `setInterval` 改为显示器 `requestAnimationFrame` 采样 24fps 曝光表，只在原画帧真正变化时更新 React 状态。
- 为什么这样改：角色快捷动作应该复用用户已经理解的产品操作，而不是硬编码一个关闭入口；把三个手势分别配置，既保留最短默认路径，也允许用户按习惯改成无操作或直接动作。放大只改变光学尺寸，不能破坏输入框贴边这一稳定产品语义；刷新同步调度比固定计时器更贴近动画播放机制，能减少主线程抖动造成的卡点。
- 影响了哪些模块：只影响澜汐原生插件的尺寸、快捷交互、动画调度、设置与文档；新建对话复用现有工作区服务，不新增会话协议、模型调用或第二聊天系统，也不修改人物原画、输入框、消息发送和其他插件。
- 验证：两个定向 Vitest 文件 20／20 和插件 bundle 通过。真实 3080 页面确认放大角色根节点为 164 × 147 px、可见身体仍贴住 `composerTop=593`；单击后焦点真实进入 textarea，右键菜单完整出现四项，点击“换到另一侧”后角色从右端平滑移动到左端；设置页可以在标准／放大间切换并恢复放大，三种快捷动作均显示正确。最终页面 console error 为 0。

### 2026-08-24 20:05 - 澜汐贴住输入框并支持横向单轴拖动

- 本次任务：把趴伏澜汐准确放到输入框正上方，让身体刚好贴住上沿，并允许用户左右拖动但彻底忽略上下位移。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/ProductCompanion.tsx`、`ProductCompanion.module.css`、`locales.ts` 和组件测试；同步更新仓库与插件双语 README、澜汐双语 Agent Note、双语配对记录、视觉验收记录和本文件。
- 改了什么：根据 V6 趴姿透明轮廓的实际底部位置，为桌面与窄窗口分别计算固定底部内缩，使可见身体贴住输入框上沿、透明画布不影响文字；新增只读取 `clientX` 的单轴拖动会话，横坐标限制在输入框左右锚点之间，任何 `clientY` 变化都不进入位置状态。按下时阻止默认选择并清空现有选区，拖动期间锁定页面文字选择，抬起、取消、丢失捕获与卸载都会释放。手动横坐标不持久化，到下一次 Agent 状态变化或完整 18 秒空闲节奏后交还自动移动。
- 为什么这样改：输入框上沿是角色唯一稳定且与工作直接相关的落脚面；自由二维拖动既会破坏“趴在输入框上”的产品语义，也会重新产生遮挡和文字误选。保留横向控制可以满足用户调整左右位置的直觉，同时用单一固定纵坐标确保角色始终贴边且不盖住输入内容。
- 影响了哪些模块：只影响澜汐原生插件在输入框上的几何定位、横向手势、辅助文案和对应文档；不重绘人物、不改变 Agent 状态映射、消息发送、输入框逻辑、模型调用或其他插件。上一条“完全不允许拖动”的交互已由本条单轴规则取代，旧 store 位置字段仍只作兼容，不记录本次临时横坐标。
- 验证：两个定向 Vitest 文件 19／19、包级 TypeScript、插件 bundle、双语配对记录和 `git diff --check` 通过；测试明确覆盖可见底边定位、纯纵向手势零位移、带大幅纵向漂移的横向拖动、输入框范围钳制、文字选区清除和拖动锁释放。124 帧蓝黑轮廓冷读取在本机达到约 21 秒，单项超时从 20 秒调整到 45 秒，断言与素材范围不变。真实 3080 页面确认可见身体贴住输入框上沿且不盖文字；带纵向漂移的横拖只改变 x，纯纵向手势前后坐标完全相同，结束后 `dragging=false`、选择锁关闭且正文选区为空。最终浏览器 error/warn 为 0，视觉比较结论为 passed。

### 2026-08-24 19:46 - 澜汐改为输入框常驻角色

- 本次任务：把较难触发的趴伏状态改成澜汐的稳定常态，并去掉用户拖动，让角色只按 Agent 状态和输入区位置自主行动。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/` 的角色组件、设置组件、store、文案与样式，更新两组定向测试、包依赖和锁文件；同步更新仓库与插件双语 README、澜汐双语 Agent Note、双语配对记录和本文件。
- 改了什么：角色只在真实输入框存在时显示，默认播放二十帧趴伏循环；空闲时每 18 秒在输入框左右两端换边，输入／等待选择右侧，任务运行选择左侧，完成后回到右侧。删除全部拖拽事件和页面选择锁，普通单击不触发行为；右键复用现有产品 `Menu`，只提供“关闭澜汐”，显示状态持久化并可从独立设置页恢复。设置页删除自动跟随和位置重置，新增明确的显示开关；监测模态弹窗开关，设置打开时角色退场、关闭后恢复。左右移动统一为 920ms 合成层过渡，左侧使用同一组趴伏原画的镜像朝向，人物身份与尺寸不重新生成。
- 为什么这样改：用户真正需要的是持续陪伴和清晰的 Agent 状态映射，而不是寻找趴伏触发条件或手动管理角色位置。输入框是用户与 Agent 持续交换工作的唯一稳定表面；固定在这里能减少概念、避免误拖和文字选中，同时保留左右运动与任务阶段差异。
- 影响了哪些模块：只影响澜汐原生插件的显示位置、交互、设置和对应文档；不改输入框、消息发送、会话状态、模型调用、其他插件或现有 V6 人物素材。旧 store 的位置／停靠字段仅为持久化兼容保留，不再影响可见交互。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：两个定向 Vitest 文件 19／19 和插件 bundle 通过。真实 3080 页面确认 18 秒后 `data-side` 从右切左，角色始终为 `data-habitat=composer`；从角色拖过页面后位置与 transform 完全不变且 `selection=''`；右键仅出现“关闭澜汐”，关闭后角色卸载，设置内“显示澜汐”可恢复。设置弹窗打开时角色为 0 个、关闭后恢复；浏览器控制台无错误。最终验收后角色已重新开启并停留在输入框。

### 2026-08-24 19:24 - 修复拖动澜汐时整页文字被选中

- 本次任务：修复用户拖动澜汐经过会话正文或目录时，浏览器把沿途文字大面积高亮选中的交互问题。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/ProductCompanion.tsx`、`ProductCompanion.module.css`、对应组件测试与本文件。
- 改了什么：拖拽按下时阻止浏览器默认选择行为、清空已有选择并给页面添加仅在拖拽期间生效的文字选择锁；移动继续阻止默认行为，抬起、取消、丢失指针捕获、五秒安全超时和组件卸载都会释放锁。回归测试覆盖正常拖放、选区清空、取消和丢失捕获四条核心出口。
- 为什么这样改：组件自身的 `user-select: none` 只能保护人物节点，拖动指针越过会话正文后浏览器仍会从按下位置开始建立原生选区；把选择锁绑定到完整拖拽生命周期，才能既消除误选，又避免页面在异常结束后永久不可选。
- 影响了哪些模块：只影响澜汐原生插件的拖拽手势和拖拽期间的页面文字选择；不改变人物动作、Agent 状态、停靠点、普通正文选择、输入框、消息发送、模型调用或其他插件。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：两个定向 Vitest 文件 19／19、插件 bundle、完整 `build:official` 与 `git diff --check` 通过。真实 3080 页面从人物主体拖过正文后成功落到自由位置，画面没有文字高亮；回读为 `selection=''`、`dragLocked=false`、`data-motion=rest`，证明拖动未留下选区或全局锁。验收结束后已把人物拖回输入区，最终为 `data-habitat=composer`。

### 2026-08-24 19:14 - 修复澜汐趴伏循环持续闪烁

- 本次任务：复现并修复澜汐停在输入框趴伏时持续变淡、重影和闪烁的问题。
- 改了哪些文件：修改 `packages/client/ui-product-companion/src/client/ProductCompanion.tsx`、`ProductCompanion.module.css` 和组件测试；同步更新仓库与插件双语 README、澜汐双语 Agent Note、`design-qa.md`、双语配对记录与本文件。
- 改了什么：删除逐帧交叉淡入／淡出的第二人物图层和 42 毫秒透明度动画；连续动作现在始终复用一个不透明 `<img>`，只替换已经预加载、预解码的帧地址。24fps 时间基准、二拍／三拍曝光、20 张趴伏原画、位置缓动和次级动作保持不变。回归断言从“最多两张图片”收紧为任何持续轨道都只能有一张图片。
- 为什么这样改：真实页面连续采样中，修复前 50 个样本有 27 个同时出现两张人物图，一张淡出、一张淡入；人体轮廓在相邻原画间本来就在移动，半透明叠加会周期性形成双轮廓和亮度变化。逐帧交叉淡化不是连续动作的必要条件，单一已解码图层才是这个透明人物素材的稳定播放方式。
- 影响了哪些模块：只影响澜汐原生插件的逐帧呈现与对应文档；不重绘人物、不改变动作顺序、Agent 状态、停靠点、输入框、消息发送、模型调用或其他插件。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：两个定向 Vitest 文件 18／18 和插件 bundle 通过。真实 3080 页面重新输入草稿后进入 `drafting / composer / lounge`；连续抽查帧号 13、15、16、17、18、0、1、2 时始终只有一张图片，图片类只剩稳定的 `characterImage`，页面控制台错误／警告为 0。验收草稿随后清空，未发送模型请求。

### 2026-08-24 19:05 - 澜汐 V6 中等身材与动画级连续动作

- 本次任务：保留用户认可的成年日漫脸型，把身材从过度丰满收回到高挑纤细、自然中等胸部和克制可见的领口，同时把输入区趴伏等动作从卡顿换帧升级为固定角色尺度的动画级连续动作。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v6/` 的角色母版和五类动作源图，以及 `assets/v6/` 的 124 张蓝黑运行帧；更新素材构建脚本、动画时间轴、角色组件、样式、Host 素材白名单、包清单和两组定向测试；同步更新仓库、插件和素材双语 README、澜汐双语 Agent Note、`design-qa.md`、四张 V6 视觉验收图、配对记录与本文件。
- 改了什么：角色明确为 29 岁成年女性，保留现有脸型和深蓝长发，身体比例改为长腿、窄腰、自然中等 B／小 C，使用窄心形／V 领保留少量克制乳沟；五类动作共 62 张原画每套皮肤，蓝黑合计 124 张。运行时使用 24fps 时间基准，并按二拍／三拍保留手绘帧节奏；相邻帧混合为 42 毫秒，调度改为基于 `performance.now()` 的漂移校正时钟，显示仍由浏览器合成层输出。素材按完整矩形格 `contain` 进入统一透明画布，趴伏轨道使用唯一光学比例，不再逐帧撑满或由 CSS 缩放泵动。
- 为什么这样改：人物忽大忽小来自每帧轮廓归一化、错误裁切和运行态缩放叠加；动作发卡来自中间姿势不足和不稳定的帧调度。锁定镜头、脚底基线、角色身份和光学尺度，再补足连续动作原画并使用稳定时间轴，才能同时解决身材漂移、裁脚、趴伏放大和播放卡顿。
- 影响了哪些模块：只影响澜汐原生插件的视觉资源、动画播放、静态资源服务和对应文档；不改变消息发送、模型调用、会话正文、目录、输入框或其他插件。任务跟随仍由 Agent 状态和所在产品区域驱动，悬停与单击不驱动人物动作。
- 验证：素材构建输出 124 张 384 × 384 透明 PNG；两个定向 Vitest 文件 18／18、插件发布包 dry-run、插件 bundle、双语配对、`git diff --check` 和完整 `build:official` 均通过。真实 3080 页面逐字输入后进入 `drafting / composer / lounge`，连续采样覆盖 20 张趴伏帧且顺序稳定；620 × 800 窄窗口无横向溢出，角色完整可见；新开页面控制台错误／警告为 0。验收输入已清空，没有发送模型请求。

### 2026-08-24 17:35 - 重绘澜汐比例并把趴伏升级为十二帧连续动作

- 本次任务：修复澜汐胸部过度丰满、趴伏与站姿体感尺寸不一致，以及输入框趴伏动作帧数少、切换发卡的问题。
- 改了哪些文件：更新 `packages/client/ui-product-companion/assets/source-v5/` 的角色母版与五张动作源图，新增 `assets/v5/` 的 72 张蓝黑运行素材；修改素材构建脚本、动画轨道、角色组件、样式、Host 素材白名单、包清单与两组定向测试；同步更新包／素材双语 README、仓库双语 README、澜汐双语 Agent Note、`design-qa.md` 和本文件。
- 改了什么：角色重绘为明确成年的高挑纤细比例，胸部改为自然克制；素材管线按锁定格子保留原画镜头尺度，不再把每张轮廓独立撑满画布，趴伏序列使用唯一 `0.82` 光学标定与运行态 `scale(1)`，消除趴姿忽大、站姿忽小。输入框动作由六个离散姿势改为十二张连续中间帧，以 140–180 毫秒原画节奏循环；专注状态改为持续六帧任务面板动作；相邻帧短混合收紧到 48 毫秒。每套皮肤预解码 36 张素材，Host 只白名单提供 V5 的 72 张运行 PNG。
- 为什么这样改：体感尺寸来自固定镜头和统一光学标定，不能靠每帧轮廓归一化；流畅感来自同一动作中的真实中间帧，单纯加快六张差异较大的姿势只会放大跳变。把人物比例、素材提取和播放时序一起修正，才能同时解决丰满、缩放漂移和卡顿三个共同根因。
- 影响了哪些模块：仅影响原生澜汐插件的角色素材、构建、运行状态与文档；不改变会话正文、输入内容、模型调用、目录或其他插件。输入检测仍只保存是否非空的布尔值，悬停和单击仍不驱动角色。
- 验证：素材构建输出 72 张 384 × 384 透明 PNG；两个定向 Vitest 文件共 17 项、插件 bundle、完整 `build:official` 与发布包 dry-run 均通过，发布包只包含 V5 运行素材，不包含 `source-v5/`。真实 3080 页面逐字输入后稳定进入 `drafting / composer / lounge`，约 85 毫秒采样覆盖 0–11 全部趴伏帧；620 × 800 下角色完整可见、页面无横向溢出，桌面与窄窗口控制台错误／警告均为 0。清空验收草稿后回到空闲，没有发送模型请求。

### 2026-08-24 16:10 - 把澜汐改为 Agent 状态驱动的自主动作

- 本次任务：去掉澜汐对鼠标悬停和单击的动作依赖，让角色只根据用户是否正在输入、Agent 是否启动／执行／等待／完成，以及当前停靠位置持续行动。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v4/blue-lounge-sheet.png` 与 `blue-portal-sheet.png`，扩展 V4 素材构建脚本与 24 张对应蓝黑运行素材；更新角色状态机、样式、Host 白名单、设置说明、测试、包与素材双语 README；同步更新仓库双语 README、澜汐双语 Agent Note、`design-qa.md`、两张验收图和本文件。
- 改了什么：真实输入框出现内容时只记录一个布尔状态，角色自主移动到输入框并循环六帧趴伏动作；真实任务从空闲进入运行时，在移动结束后完整播放一次六帧开门动作，再进入专注工作。回答完成后仍停在输入框并恢复趴伏。悬停和单击不再改变任何动作或位置；按下鼠标也不立即变化，只有实际移动超过四像素才进入拖动姿态并允许改变停靠点。运行素材增加到 60 张，语义轨道增加到十一条。
- 为什么这样改：鼠标位置变化频繁且与 Agent 工作没有业务关系，把动作绑在 hover／click 上会持续抢状态、制造抖动，也无法表达“正在输入、任务启动、执行中”这些真正有意义的阶段。输入存在性、权威会话状态和语义停靠点组成的单一状态机更符合产品直觉。
- 影响了哪些模块：只影响澜汐原生插件的浏览器状态机、生成素材、静态资源路由、设置说明与文档；不保存输入正文、不新增模型请求、不改变消息发送、会话真相、目录、输入框或其他插件。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：素材构建输出 60 张透明帧；两个定向 Vitest 文件 16/16、插件 bundle 与完整 `build:official` 通过。真实 3080 页面逐字输入后观察到 `idle → drafting`、自动移动到 `composer` 和连续 `lounge` 帧；悬停与单击均保持状态不变，清空输入后继续停在输入框。620 × 800 窄窗口无横向溢出且角色完整可见，浏览器错误／警告为 0。开门一次性过渡由状态转换回归验证，未为视觉验收额外发送模型请求。

### 2026-08-24 15:35 - 增加更明显的妩媚动作并平滑动作切换

- 本次任务：在不恢复错位切图的前提下，让澜汐的悬停、点击和拖动反馈更明显、更有成年角色魅力，并重点消除动作开始、反转和回到待机时的突跳。
- 改了哪些文件：新增 `packages/client/ui-product-companion/assets/source-v4/blue-allure-sheet.png` 和蓝黑两套 12 张对应运行素材；更新素材构建脚本、动画契约、角色组件与样式、Host 白名单、测试、包级双语 README、素材双语 README、澜汐双语 Agent Note、`design-qa.md`、配对记录与本文件。
- 改了什么：从多轮 ImageGen 候选里拒绝假透明、大幅转身、裁脚和比例漂移的版本，只保留同一正面身份、脚底基线与服装连续的撩发／重心转移动作。运行时新增 `allure` 轨道，按 `0 → 1 → 2 → 3 → 4 → 3 → 2 → 1 → 0` 正反向播放；相邻帧只做 72 毫秒交叉衔接，外层姿态用 380 毫秒插值，内层增加更明显的抬升、摆胯感、轻转与缩放。拖动会按指针速度产生方向倾斜和抬升，帧调度改为 `requestAnimationFrame` 且只在帧索引真正变化时更新 React 状态。
- 为什么这样改：单纯把静态图切得更快会重新制造双人残影和错位帧；只做轻微 CSS 呼吸又缺乏用户要求的明显反馈。固定镜头的少量中间帧、正反向收回和分层合成可以同时保留动作幅度、角色一致性与切换自然度。
- 影响了哪些模块：只影响澜汐原生插件的资产构建、悬停／点击／拖动表现和预加载；不改变会话真相、输入框、目录、模型调用、任务计时或用户数据。项目用途、结构和关键入口未变。
- 验证：资产构建生成 36 张透明帧；包级 TypeScript、两个定向 Vitest 文件共 15 项、插件 bundle 和完整 `build:official` 通过。真实 3080 页面悬停与点击均观察到正反向帧序列，离开后沿当前动作收回到单张待机图；真实拖动移动 72 × 24 px，620 × 800 下角色未越界且页面无横向溢出，控制台错误／警告为 0。

### 2026-08-24 14:10 - 把澜汐从换图动画改为连续合成层动作

- 本次任务：针对角色动作仍然一卡一卡的问题，调研成熟桌面宠物的状态与播放方式，集中修复运行时动画机制，不扩展新功能。
- 改了哪些文件：更新 `packages/client/ui-product-companion/src/client/animation.ts`、`ProductCompanion.tsx`、`ProductCompanion.module.css`、对应组件测试、插件与素材双语 README；同步更新澜汐双语 Agent Note、`design-qa.md`、双语配对记录与本文件。
- 改了什么：不再把 ImageGen 生成的独立姿势按定时器当作连续帧切换；空闲、专注、等待、完成、休息、移动和拖拽各自保留一张稳定原画，呼吸、观察、回应、专注、起跳和移动节奏改为连续 CSS 合成层变换。点击从起跳到落地保持同一图片，取消每次换图重新触发的淡入；跨停靠点位置从 `left/top` 过渡改为 `translate3d`，拖拽期间仍即时跟手。点击动作时长与状态复位统一为 1.05 秒，跨区移动状态与 680 毫秒位移过渡统一收束。
- 为什么这样改：成熟方案把“当前在做什么”和“动作怎样播放”分开。OpenAI Codex 使用命名动画、明确时长、循环点和回退；VS Code Pets 只在状态改变时更换动画源，再由独立状态机推进位置。现有 V4 图片不是动画级中间帧，继续增加切图频率只会放大轮廓跳变，无法带来真正流畅。
- 影响了哪些模块：只影响澜汐原生插件的姿势选择、点击微动、自动活动和停靠点移动；不改变角色素材、设置、会话状态、输入框、目录、模型调用或用户数据。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：包级 TypeScript、两个定向 Vitest 文件共 14 项、插件 bundle、完整 `build:official` 和 `git diff --check` 通过。真实 3080 页面点击后连续采样 62 次：DOM 始终只有一张图片，素材地址和语义轨道全程不变，人物位置出现 33 个连续中间值后稳定复位；计算样式确认根节点只过渡 `transform`。620 × 800 窄窗口中角色完整位于视口内，页面控制台错误和警告均为 0。

### 2026-08-24 13:05 - 重绘成熟御姐形象并重构澜汐逐帧生命周期

- 本次任务：针对角色不够性感、两套皮肤区分不明显、动作像静态幻灯片且过渡不自然的问题，重绘可发布角色并从素材、动画契约和真实页面交互三个层面重构澜汐。
- 改了哪些文件：更新 `packages/client/ui-product-companion/` 的两张 ImageGen 源图、角色母版、24 张 V4 运行帧、素材构建脚本、动画轨道、角色组件、样式、Host 白名单、设置预览、测试和双语 README；更新仓库双语 README、双语 Agent Note、`design-qa.md`、V4 全帧验收图、配对记录与本文件；移除已经被 V4 取代的 V2 运行帧和源图。
- 改了什么：角色重绘为明确 29 岁、长腿收腰、深蓝长发、偏肩短外套、完整遮盖束身连体服和长袜的成熟日漫御姐，性感来自曲线、剪裁、姿态和表情而非露骨暴露；深海蓝使用高亮钴蓝／青色，夜航黑将蓝色主导区域确定性变成曜石黑／银灰。素材管线从固定网格切割改为识别整张源图中的六个完整透明轮廓，避免跨格头发和衣摆被裁断。运行时把 12 张原画作为姿势库，组成空闲、专注、等待、注意、完成、休息、移动和拖拽八条不等长轨道：只有相近正面动作可以在常驻轨道内连续切换，行走、庆祝和拖拽帧只用于对应状态；页面始终只渲染一个人物并用 90 毫秒淡入，不再双层交叠制造错位鬼影。点击回应后回到当前持续轨道，不改变停靠点。
- 为什么这样改：单纯增加静态姿势或调整 CSS 不能解决形象保守、固定延迟机械、一次性动画冻帧、长发被固定网格切断以及蓝黑只像轻微调色的问题；完整角色重绘、轮廓提取和明确动画生命周期才能同时满足视觉、工程可用性与交互自然度。
- 影响了哪些模块：只影响澜汐原生插件的角色素材、播放逻辑、停靠视觉和对应说明；不读取消息正文、不新增模型请求，也不改变会话、输入框、目录、其他插件或用户数据。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：V4 全帧接触表确认 24 张运行帧没有截断、相邻人物残片或蓝黑轮廓漂移；两个定向测试文件共 14 项、包级 TypeScript、bundle、完整 `build:official` 和双语配对检查通过。`npm pack --dry-run` 确认发布包只包含 24 张 V4 运行帧，不包含源图、测试或 V2 资产。真实 3080 页面先逐帧复现旧点击轨道的双人鬼影与 3 → 4 → 5 错位跳转；修复后五张连续截图确认 DOM 始终只有一个人物，点击只按相近的正面 1 → 2 → 1 动作回应，再进入循环等待。设置中深海蓝和夜航黑可即时切换并恢复原选择，620 × 800 窄窗口无横向溢出、角色在视口内且页面无错误覆盖层。

### 2026-08-24 11:26 - 回答完成后让澜汐继续停在输入区

- 本次任务：按用户纠正后的交互要求，让开启任务跟随的澜汐在回答结束和完成动画结束后继续停留在输入框旁，不再自动返回目录或此前停靠点。
- 改了哪些文件：更新 `packages/client/ui-product-companion/src/client/ProductCompanion.tsx`、对应组件测试和双语 README；同步更新澜汐双语 Agent Note、`design-qa.md`、配对记录与本文件。
- 改了什么：任务进入工作或等待状态并成功定位真实输入区时，把 `composer` 记为新的语义停靠点；回答完成后的空闲态继续从该停靠点计算位置。用户主动拖动或恢复默认位置时，仍按现有设置离开输入区。
- 为什么这样改：任务跟随不是一次结束即撤销的临时动画；回答已经在输入区附近完成时，突然返回目录会产生无意义的二次移动，也不符合用户期望的“继续陪在输入框旁”。
- 影响了哪些模块：只影响澜汐自动跟随后完成阶段的停靠语义和对应说明；不改变回答状态、完成时长、拖动、重置、设置开关、会话或模型调用。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：新增“任务完成并结束完成动画后仍为 `data-habitat=composer`”回归；两个定向测试文件共 14 项、包级 TypeScript 与 bundle 通过。真实 3080 页面先从设置恢复到 `sidebar/idle`，再发送最小消息「交互验收：只回复 OK。」；回答 `OK` 完成并等待超过完成动画时长后，角色最终仍为 `composer/idle` 且使用 composer 动作序列，页面错误与警告均为 0。

### 2026-08-24 11:17 - 清理澜汐素材残片和运行态阴影

- 本次任务：全面审查用户截图中澜汐四周的残影、阴影和边缘碎片，并修复真实页面中拖动后出现的透明画布黑框。
- 改了哪些文件：更新 `packages/client/ui-product-companion/` 的五张生成母版、蓝黑两套共 60 张运行帧、静态资源版本、角色样式、资产测试、包依赖和双语说明；更新澜汐双语 Agent Note、仓库双语 README、`design-qa.md`、三张 v3 验收图、锁文件与本文件。
- 改了什么：重新生成每个姿势都完整落在独立网格内的五组母版，按主连通轮廓去除棋盘背景、相邻姿势残片、托底线和落影，并统一成带八像素透明安全边缘的 384 × 384 PNG；运行路径升级到 `v3/` 绕开旧资源的一年 immutable 缓存。角色正常、悬停和拖动状态不再添加投影，原覆盖整张透明画布的焦点框改为脚下 22 × 2 的短标记。
- 为什么这样改：旧 v2 母版中的人物跨越切帧边界，导致即使切割坐标正确也会把别帧的靴子、头发和阴影烘焙进当前帧；前端投影和透明画布焦点框又进一步放大了脏边。素材和运行样式必须同时清理，单独调 CSS 无法解决根因。
- 影响了哪些模块：只影响澜汐原生插件的图片资源、静态路由、焦点呈现和对应文档；不改变停靠、拖动、任务状态、皮肤偏好、会话、输入框或模型调用。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：资产回归逐张读取 60 张 PNG，确认外圈八像素全透明、非特效帧只有一个连通主体且蓝黑轮廓一致；两个定向测试文件共 13 项、包级 TypeScript、bundle 和完整 `build:official` 通过；`npm pack --dry-run` 确认发布包包含 60 张 v3 帧、零张 v2 帧且不包含母版或测试。真实 3080 页面完成正常、悬停、点击、拖动、742 × 783 和 600 × 800 验收，实际资源均来自 `/assets/v3/`，角色计算样式 `filter`／`box-shadow` 为 `none`，最终画面没有残片、托底线、落影或整画布黑框；浏览器无运行错误，警告仅来自验收时主动重启服务的连接重试。

### 2026-08-24 - 修复输入框文件与文件夹选择器卡顿和难关闭

- 本次任务：修复输入框加号菜单点击「文件与文件夹」后打开迟滞、浮层难以关闭以及可能与添加菜单重叠的问题。
- 改了哪些文件：更新 `packages/client/ui-input-trigger/` 的候选请求契约、控制器、MenuView、slot 注入、测试与双语 README；更新 `packages/client/ui-reference/` 的候选数据范围、测试与双语 README；刷新两组 README 配对记录，并更新本文件。
- 改了什么：输入触发管线现在区分手打 trigger 与显式 launcher；显式「文件与文件夹」入口只请求当前工作区文件，不再枚举历史对话。显式选择器按普通浮层处理，点击输入框、加号或页面其他位置都会立即关闭并中止当前候选请求，Escape 仍保留输入框焦点；用户手打 `@` 时继续提供文件与历史对话引用，且在输入框内调整光标不会误关。
- 为什么这样改：「文件与文件夹」入口不应付出历史对话元数据读取成本，也不应沿用键入式自动补全在 composer 内保持展开的规则；区分打开来源后可以修复真实交互，同时不削弱原有 `@` 引用能力或复制第二套选择协议。
- 影响了哪些模块：只影响输入候选浮层的显式打开语义与 Web 引用候选范围；不修改文件扫描、历史对话内容、引用序列化、消息发送、添加菜单插件、模型请求或本机数据。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：三个定向测试文件共 82 项、添加菜单本机契约测试 3 项、两个相关包 TypeScript 与 bundle 通过；真实 3080 页面确认显式选择器 302ms 内可见、250ms 后无加载态、仅有 20 个工作区候选且无 Session 对话，点击输入框后关闭、点击加号直接切换到添加菜单、Escape 58ms 关闭并保留输入焦点；手打 `@` 仍能看到会话引用并允许在输入框内继续点击。

### 2026-08-24 - 把澜汐重做为五类产品场景的成年动画伙伴

- 本次任务：重做澜汐的角色形象和跨页交互，解决点击后莫名回到目录、目录缺少专属动作、静态帧过少和角色缺乏成年设计感的问题。
- 改了哪些文件：更新 `packages/client/ui-product-companion/` 的角色组件、场景定位、样式、设置预览、资源服务白名单、文案、测试和双语说明；新增 `assets/source-v2/` 与 `assets/v2/` 动画资源；更新仓库双语 README、澜汐 Agent Note、`design-qa.md` 与本文件。
- 改了什么：通过内置 ImageGen 统一定义一位 27 岁成年日漫女性角色，为目录、页头、输入区、任务生命周期和休息五类场景各生成六帧，切割、透明化和统一尺寸后形成蓝／黑两套共 60 帧。单击现在只在原地回应，只有拖动才改变位置；真实运行或等待任务仍可按现有设置跟随至输入区。
- 为什么这样改：跨页伙伴需要对当前产品区域和真实工作阶段做直接、稳定的反馈，而不是通过点击代替导航或配置。五套场景动画让目录停靠、页头陪伴、输入、工作与休息都有明确可见区别，同时避免用虚假进度或额外模型调用来制造互动。
- 影响了哪些模块：只影响澜汐原生插件的资源、显示、交互与说明；不修改会话消息、模型请求、目录、输入框和其他插件的状态。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：澜汐定向 Vitest 9/9、包级 TypeScript、bundle 与完整 `build:official` 通过；`npm pack --dry-run` 确认发布包只包含 60 张 v2 运行帧，不包含母版、切帧源图或旧资源。真实 3080 页面验证单击前后 `habitat=sidebar` 不变、动画帧会继续前进，742 × 783 与 600 × 800 两种窗口下均可用。综合对比记录在 `design-qa-product-companion-v2-comparison.png`，`design-qa.md` 结论为 passed。

### 2026-08-24 07:32 - 让澜汐跟随真实任务并进入独立设置

- 本次任务：基于 Codex pets、Claude Pet、OpenPet 与 CoPet 的成熟做法，补齐澜汐在用户发送消息后的任务反馈、实际耗时、设置入口和皮肤／行为管理。
- 改了哪些文件：更新 `packages/client/ui-product-companion/` 的角色组件、设置组件、样式、持久化 store、文案、测试与双语 README；更新 `packages/client/ui-settings-general/src/client/SettingsRoot.tsx`、依赖锁文件、仓库双语 README、澜汐双语 Agent Note、`design-qa.md` 与本文件。
- 改了什么：角色从现有会话投影读取真实运行、等待确认和完成阶段，任务开始后显示实际已用时间并在完成时短暂保留；任务运行时自动靠近输入区，完成时可移动到页头；设置目录新增独立“澜汐”页面，可切换深海蓝／夜航黑、开关任务状态和自动跟随、恢复默认位置。设置与角色复用同一个持久化 store，刷新后继续生效。
- 为什么这样改：固定时长动画或假百分比会在任务仍运行时错误回到空闲，点击角色再弹设置卡又把互动与配置混在一起；真实会话状态、实际计时和独立设置页能同时解决进度可见、直接互动和长期可控三个核心任务。
- 影响了哪些模块：只影响澜汐原生插件及设置导航图标；不读取消息正文、不新增模型请求、不改变会话事件、模型调用、其他插件和用户数据。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：澜汐定向测试 8/8、两个相关包 TypeScript 与 bundle 通过；真实 3080 页面完成设置入口、蓝黑换肤即时生效、刷新持久化、两个行为开关与默认恢复验收，742 px 可视宽度下没有截断或横向溢出。

### 2026-08-24 06:30 - 把澜汐从状态卡片改为直接互动伙伴

- 本次任务：针对澜汐点击后只出现“回到目录／换皮肤”卡片、角色不移动、停到目录旁也不换姿态的问题，重做角色的互动与页面位置模型。
- 改了哪些文件：更新 `packages/client/ui-product-companion/src/client/` 下的角色组件、样式、持久化 store、文案和测试，新增语义停靠点计算；同步更新插件中英文 README、仓库中英文 README、Agent Note、`design-qa.md`、真实页面验收截图和本文件。
- 改了什么：删除角色点击后的状态与皮肤卡片；点击改为带跳跃动作地切换目录、页头、输入框三类真实区域；拖到区域附近自动吸附，其他位置允许自由停留；不同区域使用不同姿态，鼠标靠近会跟随，空闲时主动变换动作并偶尔换位置，等待确认靠近输入框，任务完成短暂庆祝。任务语义状态与表演姿态分离，避免只是鼠标悬停就错误播报“有任务等待”。
- 为什么这样改：伙伴的核心价值是与产品空间和工作状态产生即时可见的关系，而不是成为另一张设置卡；直接操控、语义吸附和状态表演比“点开查看／换皮肤”更符合用户对桌面宠物的直觉，也减少了额外文案和设置层级。
- 影响了哪些模块：只影响 `ui-product-companion` 的浏览器交互与文档；不改变会话、目录、输入框、任务状态或模型请求。现有蓝黑透明帧、Loader 热插拔和 Host 静态资源保持不变。
- 验证：定向组件测试 6/6、包与全 Client TypeScript、bundle、完整 Web 构建和 diff check 通过；真实拖动事件已覆盖输入框语义吸附。742×783 的真实 3080 页面确认旧卡片文案与 region 均为 0，点击后角色从目录旁 `32/235` 移到输入框旁 `596/580`，姿态从 idle 改为 working，7.9 秒空闲后会主动改为 attentive 姿态。修复了角色图片 CSS 类误命中旧 E2E `[class*=frame]` 选择器、提示气泡重复占用 `role=status` 的回归，相关两个 Web 用例定向通过。全量 GUI 仍有 2 个、本地 Web replay 仍有 66 个本任务前已有的组件契约与过期 golden／fixture 失败。

### 2026-08-24 01:32 - 新增跨页面澜汐原生插件

- 本次任务：把一只可爱但有实际任务反馈能力的 DeepSeek 风格产品伙伴做成可热插拔原生插件，并提供蓝色、黑色两套多帧皮肤。
- 改了哪些文件：新增 `packages/client/ui-product-companion/`；更新 Web bundle 的 `cordis.patch.yml`、`package.json`、Client TypeScript 引用、生成式 slot catalog 与 Model Experience 审计清单；更新中英文 README、设计验收图片、Agent Note、锁文件和本文件。本机 Web profile 的“小庄的插件”同步增加 `ui-product-companion` Loader 开关。
- 改了什么：插件在 `shell.overlay` 全局只挂载一次；从现有会话投影推导空闲、工作、等待、完成和睡眠状态；预加载十张透明 PNG；支持点击状态面板、蓝黑换肤、拖动与位置持久化、窄窗口自适应、点击外部关闭。Host 只提供十个白名单静态资源，不增加模型调用或后台轮询。
- 为什么这样改：纯装饰宠物容易干扰工作，也不符合 Harness 插件心智；把会话状态、快速进度查看和可移除能力合在一个轻量入口，才能同时满足陪伴感、实用性和可控性。
- 影响了哪些模块：新增一个独立 Client/Host 双面包和一个 Web bundle Loader 行；不改变会话数据、目录、输入区、模型请求或其他插件。关闭 Loader 行即可完整移除。
- 验证：产品伙伴测试 3/3、本机热插拔中心 8/8、Client TypeScript、包 bundle、Web build 和 official profile 完整构建通过；在 3080 真实页面完成跨页面常驻、蓝黑换肤、拖动后刷新持久化、600px 窄屏、十张资源加载以及开关卸载/重新挂载验收。设计验收结论记录在 `design-qa.md`，最终为 passed。

### 2026-08-24 00:47 - 明确本地仓库以 xiaozhuang-dsh 为主仓库

- 本次任务：纠正此前把 `niushuanan/xiaozhuang-dsh` 当作附加发布远端的错误理解，让本地 Git 关系准确表达日常开发归属。
- 改了哪些文件：`.git/config` 的远端和分支跟踪关系、社区发行版中英文 Agent Note 与配对记录，以及本文件。
- 改了什么：`origin` 现在指向 `https://github.com/niushuanan/xiaozhuang-dsh.git`，本地 `master` 跟踪 `origin/master`；DeepSeek 官方仓库改名为只用于上游同步的 `upstream`。同步修正发行文档和既有项目记录中的远端称呼。
- 为什么这样改：这个文件夹和当前分支就是 Xiaozhuang DSH 的日常工作仓库，不是官方仓库上的临时改造；使用标准的 `origin`／`upstream` 关系可以避免后续默认 push、拉取和发布目标混淆。
- 影响了哪些模块：只影响本地 Git 远端身份、默认跟踪与项目说明，不改代码、运行时、Release、tag 或官方上游历史。
- 验证：`git remote -v` 回读 `origin` 为 `niushuanan/xiaozhuang-dsh`、`upstream` 为 `deepseek-ai/deepseek-harness`；`git branch -vv` 和 `git status --branch` 均确认 `master` 跟踪 `origin/master`。

### 2026-08-24 00:44 - 发布 Xiaozhuang DSH v0.1.0

- 本次任务：把可分享的公开仓库与首个可直接下载的插件增强发行版真实发布到 GitHub。
- 改了哪些文件：仅更新 `PROJECT_CONTEXT.md`；远端新增 tag `xiaozhuang-v0.1.0` 与 GitHub Release，发行附件保存在仓库外的本机发布目录。
- 改了什么：从提交 `ec2e42fc41` 执行 official profile 构建，打包带 Host、Client、Web 产物的 `xiaozhuang-dsh-v0.1.0-prebuilt-source.tar.gz`，附带 `SHA256SUMS.txt`；将提交和 tag 推送到 Xiaozhuang DSH 主仓库，并发布中英文发行说明、仓库描述和主题标签。
- 为什么这样改：外部使用者既需要一眼理解这是基于 DeepSeek Harness 的插件增强版，也需要不必自己执行完整构建的版本化下载入口；tag、校验文件和独立 Release 能让分享、回溯与后续迭代保持清楚。
- 影响了哪些模块：GitHub 仓库首页、Release 下载与后续社区发行流程；不修改运行时代码、上游 `origin`、npm 包版本或本机 DSH 数据。发行包明确排除 `.git`、`node_modules`、真实 `.env`、账号凭据、会话和本机 Profile 状态。
- 验证：GitHub 回读仓库为 `PUBLIC`、默认分支为 `master`；远端 `master` 与 release tag 均指向 `ec2e42fc41`。35 MB 发行包 SHA-256 为 `530912e74e0aca80b3a7ff03026f99ddae8b96004bef8da2ea1c07382d8f7dd4`；在全新解压目录完成 `pnpm install --frozen-lockfile`，并使用隔离 `DSH_HOME` 在 3098 端口启动，首页返回 200 且 Computer Use、模型用量等插件入口进入真实 boot 清单。official build、pre-push typecheck、双语配对、Agent Note 格式、Markdown 链接和 diff check 通过；全仓 lint／doc-sync 仍报告本次任务前已存在的 Computer Use lint 与包文档/JSDoc 规则债务。

### 2026-08-24 00:31 - 建立 Xiaozhuang DSH 公开发行说明

- 本次任务：把公开仓库从上游默认介绍改成可直接分享的 Xiaozhuang DSH 插件增强发行版，并为首个 GitHub Release 建立安全的预构建源码包约定。
- 改了哪些文件：`README.md`、`README.zh.md`、`README.i18n.yaml`、`.agents/notes/implemented/process/2026-08-24-xiaozhuang-community-distribution.*`，以及本文件。
- 改了什么：中英文 README 明确社区增强版定位、上游关系、六类已交付增强、真实截图、发行包／Git 两条安装路径、隐私边界和持续迭代方向；新增过程决策，约定 `xiaozhuang-v*` tag、带 official build 产物的压缩包、SHA-256 校验及必须排除的本机数据。
- 为什么这样改：原 README 几乎原样介绍官方上游，外部读者无法判断这个公开仓库增加了什么，也没有跳过完整构建的直接下载入口；社区发布又不能混入上游 npm 版本序列或本机账号状态。
- 影响了哪些模块：公开仓库首页、双语文档配对、社区发布说明和后续发行流程；不改变任何运行时代码、npm 包版本、凭据、会话或本机 Profile。第 1 节已更新为社区增强发行版定位，第 2–3 节仍与实际代码结构和入口一致。

### 2026-08-24 00:17 - 放大 Computer Use 图标的实际轮廓

- 本次任务：按用户截图修复设置目录中小电脑图标明显小于相邻导航图标的问题。
- 改了哪些文件：`packages/client/ui-primitives/src/ComputerUseIcon.tsx`、共享图标测试与双语 README／配对记录；`packages/client/ui-settings-general/tests/settings-root.client.spec.tsx`、双语 README／配对记录；以及本文件。
- 改了什么：保留导航行原有的 16px 图标槽，不改变文字起点；共享 PNG mask 改为在槽内按 160% 渲染，补偿原图四周透明留白。设置目录继续使用 16px，Computer Use 页头继续使用自身 14px 槽，两处共同获得更饱满的电脑轮廓。
- 为什么这样改：原图虽然元素盒子是 16×16，但有效电脑轮廓只占中间约六成，所以视觉上远小于模型、插件和 Teamwork 图标；直接把元素盒子改大又会把「Computer Use」文字推向右侧，破坏整列对齐。
- 影响了哪些模块：仅影响共享 Computer Use 小电脑图标的光学尺寸，以及设置目录和会话页头复用该图标的显示；不改变导航点击区域、设置顺序、浏览器工作区、权限或任何运行逻辑。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确，无需改动。
- 验证：两个定向测试文件共 98 项、三个相关包 TypeScript、ui-primitives／settings-general／computer-use bundle、Web 正式前端构建和两组双语配对均通过；重启 3080 源码服务后在真实设置页确认元素槽仍为 16px、mask 为 160%，图标轮廓与相邻导航图标达到一致视觉量级且文字保持对齐。

### 2026-08-24 00:08 - 发布公开的 xiaozhuang-dsh 仓库

- 本次任务：确认此前产品改造均已按功能提交，并把当前 DeepSeek Harness 改造版发布为新的公开 GitHub 仓库。
- 改了哪些文件：仅更新 `PROJECT_CONTEXT.md`；当前远端配置以 `origin` 指向 `https://github.com/niushuanan/xiaozhuang-dsh.git`，官方仓库作为 `upstream` 保留用于同步。
- 改了什么：核对工作区无未提交文件与既有分功能提交；公开前检查新增提交未跟踪 `.env`、私钥或常见密钥格式；补齐原浅克隆缺失的上游历史后，把 `master` 原样推送到公开仓库，保留 Computer Use、Teamwork／worktree、模型用量、插件装配与后续 UI 修复的独立提交边界。
- 为什么这样改：新仓库既要能让外部用户完整克隆，也要保留每项产品能力可独立审查和回滚的提交历史；保留官方 `origin` 则便于后续继续同步 DeepSeek 上游。
- 影响了哪些模块：不改变任何运行时代码、插件配置或本机数据；建立公开主仓库与官方上游的清晰远端关系。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确，无需改动。
- 验证：GitHub 仓库可见性回读为 `PUBLIC`，默认分支为 `master`；远端 `master` SHA 与本地最终 SHA 一致，工作区干净。

### 2026-08-23 23:57 - 把 Computer Use 设置收敛为紧凑能力菜单

- 本次任务：按用户截图重做工作区标题栏齿轮弹层，去掉像独立设置页一样重复、笨重的结构。
- 改了哪些文件：`packages/client/ui-computer-use/src/client/BrowserWorkspace.tsx`、`BrowserWorkspace.module.css`、对应组件测试、中英文 README 与配对记录，以及本文件。
- 改了什么：删除弹层内重复的「Computer Use 设置」与「授权完成 · 已连接」，连接状态只保留在标题栏；弹层改为与产品原生菜单一致的 218px 轻量表面，只保留两行 38px 的桌面／浏览器控制，并把胶囊开关缩至 30×18px；齿轮打开态不再铺灰底，键盘焦点改用克制的中性描边。
- 为什么这样改：两项布尔控制不需要第二套标题、状态摘要和三段分隔，把它们做成一张小设置页会重复信息并遮挡浏览器工作区；紧凑菜单能让用户直接完成开关任务，同时继续从标题栏读取唯一连接状态。
- 影响了哪些模块：仅影响 Computer Use 工作区齿轮菜单的结构、样式、语义与说明；桌面／浏览器开关的真实设置写入、浏览器来源切换、工作区宽度和运行时连接逻辑不变。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确，无需改动。
- 验证：Computer Use 定向测试 2 项、包级 TypeScript、客户端 bundle 与双语配对通过；真实 3080 页面确认弹层只剩两个可访问的 `switch`，重复状态文案消失，浏览器控制可关闭并恢复，前后同视口视觉对比确认菜单明显减高、减宽且不再压住主要工作区。

### 2026-08-23 23:51 - 统一工作区标题栏提示方向

- 本次任务：按用户截图把「展开工作区」提示移到按钮下方，并同步处理同组的「关闭工作区」提示。
- 改了哪些文件：`packages/client/ui-computer-use/src/client/BrowserWorkspace.tsx`、对应组件测试与双语 README，以及本文件。
- 改了什么：为工作区标题栏的展开与关闭操作都指定 `Tooltip side="bottom"`，并在现有工作区回归中锁定两个提示的最终方向。
- 为什么这样改：两个图标都位于工作区右上角，默认向右展开会在视口边缘被推回并覆盖按钮；统一向下更符合顶栏控件的空间关系，也与会话页头「浏览器」入口保持一致。
- 影响了哪些模块：仅影响 Computer Use 工作区标题栏两个提示的位置，不改变展开、关闭、工作区宽度、标签页或浏览器运行逻辑。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确，无需改动。
- 验证：Computer Use 工作区定向测试 2 项、包级 TypeScript、客户端 bundle 与双语配对通过；真实 3080 页面测得展开和关闭提示均位于按钮下方 8px，提示与两个按钮均无重叠，控制台错误为 0。

### 2026-08-23 23:46 - 把浏览器入口提示移到按钮下方

- 本次任务：按用户截图修复 Computer Use 悬浮提示覆盖相邻 Session log 控件的问题。
- 改了哪些文件：`packages/client/ui-computer-use/src/client/BrowserWorkspace.tsx`、对应组件测试与双语 README，以及本文件。
- 改了什么：仅为会话页头的「浏览器」入口指定 `Tooltip side="bottom"`，提示从默认向右展开改为固定优先显示在按钮下方；增加回归断言锁定方向。
- 为什么这样改：入口位于顶栏右端，默认向右提示会被视口边界推回左侧，从而遮住相邻操作；向下展开符合该位置的剩余空间和用户阅读路径，无需改变全局 Tooltip 行为。
- 影响了哪些模块：只影响 Computer Use 页头入口的悬浮／聚焦提示位置，不改变按钮尺寸、小电脑图标、工作区开关、浏览器任务或其他 Tooltip。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确，无需改动。
- 验证：Computer Use 工作区定向测试 2 项、包级 TypeScript、客户端 bundle 与双语配对通过；真实 3080 页面悬停测得提示位于入口下方 8px，与入口及 Session log 均无重叠，展开工作区后方向保持不变，控制台错误为 0。

### 2026-08-23 23:45 - 统一 Computer Use 小电脑图标

- 本次任务：按用户截图把设置目录里的通用齿轮和会话页头里的浏览器页面图标统一替换为一个简洁的小电脑图标。
- 改了哪些文件：`packages/client/ui-primitives/assets/computer-use.png`、`packages/client/ui-primitives/src/ComputerUseIcon.tsx`、该包导出、测试与双语 README；`packages/client/ui-settings-general/src/client/SettingsRoot.tsx`、测试与双语 README；`packages/client/ui-computer-use/src/client/BrowserWorkspace.tsx`、测试与双语 README；以及本文件。
- 改了什么：通过 ImageGen 生成透明小电脑 PNG，并在共享 `ComputerUseIcon` 中作为跟随 `currentColor` 的 alpha mask 使用；Computer Use 设置目录以 16px、会话页头「浏览器」入口以 14px 复用同一个轮廓，保留原有点击范围、文字和交互。
- 为什么这样改：旧齿轮表达的是设置、旧页面图标表达的是单个网页，都不能直接传达 Computer Use；共享一个小电脑图形可以减少概念和视觉差异，同时无需为浅色、深色与悬停状态维护多套图片。
- 影响了哪些模块：仅 ui-primitives 的共享图标资产、Computer Use 设置目录和浏览器工作区入口；不改变浏览器启动、标签页、桌面控制、权限、会话或模型调用。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确，无需改动。
- 验证：三个定向测试文件共 100 项通过，三包 TypeScript 检查、三个客户端 bundle、完整 `build:official` 与三组双语配对通过；真实 3080 页面测得设置图标 16×16、浏览器入口 14×14，两处均来自共享 glyph，设置弹窗可正常开关，页面控制台错误为 0。

### 2026-08-23 23:30 - 分板块固化原生插件与并行开发能力

- 本次任务：把本轮 DeepSeek Harness 改造按产品板块拆分提交，并确保 Computer Use、模型用量、子代理外部执行与自动 worktree 能力都保留为可组合的原生插件。
- 改了哪些文件：`packages/computer-use/`、`packages/client/ui-computer-use/`、`packages/client/ui-provider-quota/`、`packages/subagent/`、`packages/client/ui-subagent/`、`packages/bundle/web-app/`、相关 TypeScript／工作区配置、生成式目录文档、设计验收图片与 Agent Note；本机 Profile 的 Teamwork 和插件管理界面另在 `~/.dsh/profiles/web` 维护。
- 改了什么：新增原生桌面与双模式浏览器工作区、四家模型账号用量面板、Codex 模型与思考强度配置，以及由子代理创建隔离 worktree、审查并安全回收的执行路径；Web 组合和文档目录已接入对应包。
- 为什么这样改：核心任务需要同时满足真实可用、可热插拔和高级开发者的并行工作流；按独立产品能力拆分提交，既能单独回滚，也避免把 UI、运行时和设计资料混成一个不可评审的大提交。
- 影响了哪些模块：Computer Use、provider quota、subagent/Teamwork、Web 默认组合、设置入口和生成文档；不改变已有会话数据、模型凭据存储或未启用插件的旧路径。
- 验证：Computer Use 与模型用量共 14 项定向测试通过，Computer Use Host TypeScript 检查、两个客户端 bundle、Cordis 配置／目录生成与双语配对通过；所有提交均通过仓库 pre-commit 门禁。

### 2026-08-23 14:30 - 进一步缩小并减轻用量图标

- 本次任务：按用户反馈让页头「用量」图标更小、内部线条更细。
- 改了哪些文件：`packages/client/ui-provider-quota/src/client/QuotaAction.tsx`、`QuotaAction.module.css`、组件测试、中英文 README 与配对记录；更新 `design-qa.md` 与本文件。
- 改了什么：把原生 `IconDataOutline16` 从 16×16 等比渲染为 14×14；由于保留同一个 16 单位 viewBox，图标内部轮廓与整体同时缩放，视觉笔画同步减轻，而按钮的 28px 点击高度、文字和展开箭头不变。
- 为什么这样改：16px 数据图标虽然清晰，但相对 12px 的「用量」文字仍稍重；缩到 14px 可以降低视觉抢占，又不需要引入另一套图标或改变现有交互。
- 影响了哪些模块：只影响 provider-quota 页头图标的视觉尺寸和对应文档，不改变按钮可点击范围、弹窗、额度数据、刷新或其他页头入口。项目用途、代码结构和关键入口已复核，无需改动第 1–3 节。
- 验证：组件测试 1 项、相关 TypeScript、provider-quota bundle 与双语配对通过；真实 3080 页面测得 SVG 为 14×14、颜色仍与文字一致，点击后「模型用量概览」正常打开，控制台错误／警告为 0。

### 2026-08-23 14:25 - 用原生矢量图标替换模糊的用量入口图片

- 本次任务：修复页头「用量」入口图标缩小后像蓝色柱状图叠在紫色键盘上的怪异、模糊问题。
- 改了哪些文件：`packages/client/ui-provider-quota/src/client/QuotaAction.tsx`、`QuotaAction.module.css`、组件测试、中英文 README 与配对记录；删除不再使用的 `src/client/usageIcon.ts`；更新 `design-qa.md` 与本文件。
- 改了什么：移除 64px 生成式 PNG 的 base64 内嵌和 16px 栅格缩放，改用项目 `ui-primitives` 已有的 `IconDataOutline16`；图标以 `currentColor` 跟随页头文字颜色，尺寸固定为 16×16，并继续与「用量」文字和展开箭头组成同一个按钮。
- 为什么这样改：旧图片包含柱、曲线、轨道等过多细节，在页头真实尺寸下会混成像素块，而且蓝紫颜色与旁边单色线性图标不在同一体系；原生矢量图标在 16px 下轮廓清楚，也能自动继承正常、悬停和聚焦颜色。
- 影响了哪些模块：只影响 provider-quota 的页头入口图标与对应文档，不改变面板尺寸、四家额度、刷新缓存、重置时间、会员标签或会话数据。项目用途、代码结构和关键入口已复核，无需改动第 1–3 节。
- 验证：定向组件测试 1 项、provider-quota／conversation TypeScript、provider-quota bundle、双语配对和完整 `build:official` 通过；真实 3080 顶部栏确认图标为 16×16 SVG、颜色与同级文字一致，点击仍能打开「模型用量概览」，关闭后焦点与展开状态正常，页面错误／警告为 0。

### 2026-08-23 11:25 - 子代理目录改为点击展开并统一页头文字

- 本次任务：取消「4 个子代理」入口的悬停自动展开，并让子代理数量、标准模式、用量三处可见文字的字号、颜色和字重完全一致。
- 改了哪些文件：`packages/client/ui-subagent/src/client/SubagentHeaderLineage.tsx`、对应 CSS、组件测试及中英文 README／配对记录；`packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css`；`packages/client/ui-agent-preset/src/client/AgentPresetLabel.module.css`；`packages/client/ui-provider-quota/src/client/QuotaAction.module.css`；`apps/web/tests/subagent-conversation.e2e.ts`；以及本文件。
- 改了什么：普通会话的后代数量目录只在点击后打开，悬停不再触发；打开后移出鼠标也保持，直到选择条目、再次点击、按 Escape 或点击外部才关闭。会话页头新增共享的文字颜色、悬停色、字号、字重和行高变量，子代理数量、智能体模式和模型用量入口共同继承 `12px / 400 / secondary / 18px`，不再由三个插件分别决定。
- 为什么这样改：悬停 150ms 自动展开会打断用户在页头移动鼠标，且三个并列入口虽然语义同级，却曾出现「用量」颜色更浅的问题；把打开动作收敛为显式点击、把文字样式收敛为同一宿主变量，才能同时解决误触和持续漂移。
- 影响了哪些模块：只影响普通会话页头的子代理数量目录触发方式与三个入口的文字呈现；子代理目录内容、同级／下级导航、键盘 ArrowDown／Escape、Agent preset 切换、额度数据及 Teamwork 编排均不变。项目用途、代码结构和关键入口已复核，无需改动第 1–3 节。
- 验证：4 个定向测试文件共 61 项通过，相关四包 TypeScript、bundle、双语配对检查与完整 `build:official` 通过。全新 3080 浏览器标签页实测：悬停 500ms 仍为关闭，点击后打开，移出 500ms 仍保持；三个入口的浏览器计算样式均为 `12px`、`400`、`rgb(97, 102, 107)`、`18px`，页面错误／警告为 0。

### 2026-08-23 11:04 - 把 Teamwork 规划状态移出输入框

- 本次任务：解释 Teamwork 的产品含义，去掉选择 Teamwork 后输入框里重复出现的「Plan／规划中」与第二个 Teamwork 小框，并为规划状态和团队面板找到稳定的顶层位置。
- 改了哪些文件：`packages/client/ui-plan/` 的顶层状态组件、样式、文案、测试与双语 README；`packages/client/ui-conversation/` 的 Hero／Header slot 契约、输入框渲染、测试与双语 README；`apps/web/tests/plan-control-row.e2e.ts` 及对应窄窗口 golden；输入状态机双语 Agent Note；本机 `~/.dsh/profiles/web/packages/team-work/lib/client.js`；以及本文件。
- 改了什么：输入框删除 `conversation.input.plan` seat，只保留唯一的 Teamwork 权限预设入口；Plan 激活态改为无底色、无边框的「规划模式 ×」，空白会话放在 Workspace／模式旁的 `conversation.hero.actions`，活跃会话转入 `conversation.session.header.actions`；Teamwork 团队面板入口也从输入框迁到这两个顶层区域，收敛为图标按钮，仅成员运行时显示人数；团队阶段、并发占用和成员轨迹仍在原面板内。
- 为什么这样改：Teamwork 本质是“先规划、再由主智能体协调最多 5 个子智能体”的协作预设，权限选择、Plan 开启和团队面板原先在输入框被拆成三个小框，重复表达同一会话上下文。规划方式与团队进度不属于消息输入控制，把它们放在会话顶部既保留可见性和退出路径，也减少输入框概念。
- 影响了哪些模块：仅 Plan 的浏览器展示位置、会话 Hero／Header 扩展位和本机 Teamwork 面板入口；`/plan` 命令、Teamwork Host 编排、权限切换、子智能体运行、会话记录和模型请求不变。项目用途、代码结构和关键入口已复核，无需改动第 1–3 节。
- 验证：5 个定向测试文件共 109 项通过，ui-plan／ui-conversation TypeScript 与 bundle、正式前端构建及新的 800×720 真实装配 e2e 2 项通过；真实 3080 页面确认输入框仅有一个 Teamwork，顶部规划状态可见，团队图标可打开并关闭含 4 名成员的真实面板。完整 GUI 共 4016 项通过、1 项既有模型设置样式测试失败；完整 Web replay 仍有当前工作树既有的多项快照／旧功能失败，本次相关 plan e2e 已按新契约修正并单独通过。

### 2026-08-23 02:57 - 用内收灰线替换四张额度卡片

- 本次任务：按用户标注去掉模型用量面板中的四个独立圆角卡片，只用不触碰外边缘的灰线划分四家厂商，同时保留 KIMI 与 GLM 内部的额度周期分隔。
- 改了哪些文件：`packages/client/ui-provider-quota/src/client/QuotaAction.tsx`、`QuotaAction.module.css`、中英文 README、`design-qa.md` 与本文件。
- 改了什么：四家厂商改为共享同一个白色面板平面；桌面 2×2 布局使用上下内收的中央竖线和左右内收的中央横线，窄窗口改用三条内收横线；加载或错误空态不渲染装饰分隔线。
- 为什么这样改：四个外框在外层弹窗内再次制造四张嵌套卡片，视觉重量过高；内收十字线足以表达四区关系，又不会把面板重新画成顶边的表格。
- 影响了哪些模块：仅 provider-quota 的厂商分区样式与对应文档；额度数据、品牌图、进度条、重置时间、缓存和刷新逻辑不变。项目用途、代码结构和关键入口已复核，无需改动第 1–3 节。
- 验证：定向组件测试 1 项、包级 TypeScript 与客户端 bundle 通过；真实 3080 页面完成桌面 1280×720、窄窗口 600×800、手动刷新和开关回归，控制台错误／警告为 0；同尺寸前后截图与局部对比均确认分隔线端点未触碰外边缘，设计 QA `final result: passed`。

### 2026-08-23 02:25 - 用量入口品牌化并开放会话内模式切换

- 本次任务：按“万物皆插件”继续迭代用量与 Agent preset 两个插件，用专属调用强度图标替换黄色状态点，并让标准、PTC、极简、创造及本地自定义模式可以在既有会话中切换且不打断当前任务。
- 改了哪些文件：`packages/client/ui-provider-quota/` 的标题栏入口、生成式 PNG 资产、测试、双语 README 与 Agent Note；`packages/client/ui-agent-preset/` 的标题栏菜单、按会话切换 store、文案、样式、测试与双语 README；`packages/host/apiproxy/` 与 `packages/preset/agent-presets/` 的空闲期重组协议、测试和双语 README；`apps/web/tests/agent-preset-selection.e2e.ts` 及标题栏快照；新建会话模式切换 Agent Note，更新 `design-qa.md`、对比截图与本文件。
- 改了什么：用量入口使用 ImageGen 生成的三段容量柱加轨道活动曲线，64px 透明源嵌入动态客户端并按 16px 展示，异常只在面板内部说明；原只读模式标签改为现有 Menu 组件，空闲会话立即切换，运行中选择按 session 排队并显示“下轮生效”；Host 通过 `Agent.runMaintenance()` 在空闲边界原子重链 preset，新唤醒输入等待重链，提交后才落账 `agent-preset/selected` 并刷新命令／技能目录。
- 为什么这样改：黄色点表达警告而非模型消耗；把模式永久锁在首轮会迫使用户放弃对话上下文，而直接在运行中换工具又会破坏正在执行的请求。空闲 maintenance 边界同时满足“能切换”和“不打断当前工作”。
- 影响了哪些模块：用量插件只改变标题栏入口资产，不改厂商额度、凭据、缓存与面板结构；preset 插件改变既有会话后续轮次的 Agent 组装，创建头部、历史消息和当前活跃轮次保持不变。项目用途、代码结构和关键入口已复核，无需改动第 1–3 节。
- 验证：4 个定向测试文件共 77 项通过，三个相关包 TypeScript 检查、两个客户端 bundle、完整 `build:official` 与无模型调用的真实 Web e2e 均通过；真实 3080 已从标准模式切到 PTC 再切回标准，标题栏标签与 Host 状态两次收敛，会话内容未卸载；生成图标按 16×16 从 64×64 嵌入源渲染，页面零控制台错误／警告；同尺寸前后截图已合成比较，设计 QA `final result: passed`。

### 2026-08-23 01:36 - 恢复额度语义线并补齐绝对重置时间

- 本次任务：修复紧凑额度面板中蓝线含义不清、0% 状态不可辨认、本周截止与重置时间缺失的问题，同时保留必要分隔而不退回大表格。
- 改了哪些文件：`packages/client/ui-provider-quota/src/client/QuotaAction.tsx`、`QuotaAction.module.css`、`locales.ts`、组件测试与双语 README；多厂商用量 Agent Note、`design-qa.md`、本轮改版前/后截图和本文件。
- 改了什么：每个五小时／本周指标增加明确“已用”标题、百分比、灰色总量底轨和蓝色已用段；0% 不再生成蓝色子条；卡片边框区分厂商，细竖线区分同卡片的五小时与本周；每项显示北京时间的绝对重置日期和时刻，0% 且厂商不返回时间时显示“未使用，暂无重置”；页脚标明时区。
- 为什么这样改：上一版只留下悬空蓝线，用户无法把颜色、额度周期和截止时间建立稳定对应；本次让每条线都承担明确业务语义，并把厂商真实重置事实直接放回判断路径。
- 影响了哪些模块：仅 provider-quota 的额度展示、无障碍进度语义和相关文档；不改变额度数据源、凭据、轮询策略、会员判定、会话或模型请求。
- 验证：4 项定向测试、包级 TypeScript、bundle 与完整 `build:official` 通过；真实 3080 手动刷新后显示 KIMI 5 小时 `0%` 于 `8/23 05:31` 重置、本周 `49%` 于 `8/28 08:31` 重置，GLM 5 小时 `0%` 且暂无重置、本周 `81%` 于 `8/25 09:59` 重置，GPT 本周 `55%` 于 `8/27 11:47` 重置。应用内浏览器确认两个 0% 条均为全灰、所有时间无截断、弹窗 520×330（比最初版面积减少 50.8%）、缓存打开 289ms、手动刷新加载态、入口收起和全新标签页零控制台错误均通过；设计 QA `final result: passed`。

### 2026-08-23 01:29 - 把模型用量面板减半并校正 GPT 与会员语义

- 本次任务：按用户第三轮反馈把额度弹窗面积至少减半，移除返回键和多余分隔线，统一四家 Logo 圆角，把 CODEX 改成 GPT，并补齐真实会员等级与 GPT 仅本周额度。
- 改了哪些文件：`packages/client/ui-provider-quota/` 的额度映射、React 组件、样式、中文词典、品牌资源、定向测试与双语 README；多厂商用量 Agent Note、`design-qa.md`、改版前/后验收截图和本文件。
- 改了什么：把 760×459 的四行表格重构为 520×294 的 2×2 卡片，删除内部返回键和行列分隔线；所有图片使用 34px 容器、8px 容器圆角和 6px 图片圆角；可见名称从 CODEX 改为 GPT 并采用 OpenAI 标记；GPT 只读取主账号的本周窗口，不再合并 `codex_*` 五小时桶；KIMI 优先展示官方 `Allegro` 名称，GLM 展示 `PRO`，GPT 展示 `PRO · 20X`。
- 为什么这样改：旧布局面积大、控制重复、视觉噪声多，而且把模型专属限额当作账号限额；会员信息还直接停留在内部枚举。新结构只保留用户判断“还能不能继续用”所需的核心事实。
- 影响了哪些模块：仅 provider-quota 插件的数据投影与会话标题栏弹窗；不改变厂商凭据、登录状态、会话数据、模型请求或 DeepSeek Harness 产品品牌。
- 验证：4 项定向测试、包级 TypeScript、bundle 与完整 `build:official` 通过；真实 3080 API 返回 DeepSeek ¥112.97、KIMI Allegro 0%/49%、GLM Pro 0%/81%、GPT Pro 本周 54% 且无五小时项。应用内浏览器实测面积减少 56.17%，四个 Logo 容器圆角均为 8px，手动刷新、标题栏入口收起、319ms 缓存打开和全新标签页零控制台错误均通过；设计 QA `final result: passed`。

### 2026-08-21 18:32 - 切换模型时默认选择最高思考强度

- 本次任务：修复从其他模型切换到 V4 Pro 等模型时仍采用适配器默认 `high` 的问题，统一改为选择目标模型实际支持的最高思考强度。
- 改了哪些文件：`packages/client/ui-model-selection/src/client/reasoning.ts`、`index.ts`、`ModelSelect.tsx`，该插件的两个定向测试文件、中英文 README 与 `README.i18n.yaml`，以及本文件。
- 改了什么：模型选择弹窗和 composer 模型菜单都从目标模型公布的强度列表取最高一档；同一模型内的既有手动强度继续保留，不会被刷新或重复选择强制重置。
- 为什么这样改：适配器的请求默认值表达“省略参数时用什么”，并不等于产品期望的“切换模型后尽可能使用最高能力”；V4 Pro 的默认值为 `high`，但其最高可选档实际是 `max`。
- 影响了哪些模块：仅会话模型选择 UI、`/model` 命令选择结果及其文档测试；不改变模型适配器、设置页分类、图片路由、凭据和会话内容。
- 验证：模型选择组件与浏览器插件 18 项定向测试通过，模型选择包构建和官方完整生产构建通过；真实 3080 页面中新会话从 GLM-5.3 切换至 DeepSeek-V4-Pro 后显示 `Max`，展开强度菜单确认 `Max` 的实际选中状态为 `true`。

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
