# Project Context

## 1. 这个项目是干什么的

Xiaozhuang DSH 是基于 DeepSeek Harness（`dsh`）持续迭代的社区插件增强发行版，保留上游开源 Agent Harness 与 Cordis“一切皆插件”的运行主干，并增加 Computer Use、模型用量、会话控制、外部智能体和并行 worktree 等本地生产能力。用户通过 CLI 启动 Web 或 Headless profile；Cordis 按 bundle、profile patch 和插件配置组装模型适配器、工具、会话持久化、权限与 UI。当前仓库仍跟随上游 developer preview，主要本地产品入口是 `dsh web`，默认在 `http://127.0.0.1:3080` 提供浏览器界面。

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
- `packages/client/ui-model-selection/src/client/`：会话模型与推理强度选择入口；切换模型时根据该模型公布的强度列表选择最高档，同一模型内仍允许手动调档。
- `packages/client/ui-settings-models/src/client/`：模型提供方、动态模型目录和模型能力分类的设置入口；`inputModalities` / `input` 同时驱动页面显示与运行时图片路由。
- `packages/core/agent-loop/src/`：执行 turn/step、模型请求和工具循环。
- `packages/client/ui-conversation/src/` 与 `packages/client/ui-attachment/src/`：Web 会话输入和原生图片附件交互。

## 4. 最近改了什么

### 2026-08-24 - 修复输入框文件与文件夹选择器卡顿和难关闭

- 本次任务：修复输入框加号菜单点击「文件与文件夹」后打开迟滞、浮层难以关闭以及可能与添加菜单重叠的问题。
- 改了哪些文件：更新 `packages/client/ui-input-trigger/` 的候选请求契约、控制器、MenuView、slot 注入、测试与双语 README；更新 `packages/client/ui-reference/` 的候选数据范围、测试与双语 README；刷新两组 README 配对记录，并更新本文件。
- 改了什么：输入触发管线现在区分手打 trigger 与显式 launcher；显式「文件与文件夹」入口只请求当前工作区文件，不再枚举历史对话。显式选择器按普通浮层处理，点击输入框、加号或页面其他位置都会立即关闭并中止当前候选请求，Escape 仍保留输入框焦点；用户手打 `@` 时继续提供文件与历史对话引用，且在输入框内调整光标不会误关。
- 为什么这样改：「文件与文件夹」入口不应付出历史对话元数据读取成本，也不应沿用键入式自动补全在 composer 内保持展开的规则；区分打开来源后可以修复真实交互，同时不削弱原有 `@` 引用能力或复制第二套选择协议。
- 影响了哪些模块：只影响输入候选浮层的显式打开语义与 Web 引用候选范围；不修改文件扫描、历史对话内容、引用序列化、消息发送、添加菜单插件、模型请求或本机数据。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：三个定向测试文件共 82 项、添加菜单本机契约测试 3 项、两个相关包 TypeScript 与 bundle 通过；真实 3080 页面确认显式选择器 302ms 内可见、250ms 后无加载态、仅有 20 个工作区候选且无 Session 对话，点击输入框后关闭、点击加号直接切换到添加菜单、Escape 58ms 关闭并保留输入焦点；手打 `@` 仍能看到会话引用并允许在输入框内继续点击。

### 2026-08-24 - 把小鲸灵重做为五类产品场景的成年动画伙伴

- 本次任务：重做小鲸灵的角色形象和跨页交互，解决点击后莫名回到目录、目录缺少专属动作、静态帧过少和角色缺乏成年设计感的问题。
- 改了哪些文件：更新 `packages/client/ui-product-companion/` 的角色组件、场景定位、样式、设置预览、资源服务白名单、文案、测试和双语说明；新增 `assets/source-v2/` 与 `assets/v2/` 动画资源；更新仓库双语 README、小鲸灵 Agent Note、`design-qa.md` 与本文件。
- 改了什么：通过内置 ImageGen 统一定义一位 27 岁成年日漫女性角色，为目录、页头、输入区、任务生命周期和休息五类场景各生成六帧，切割、透明化和统一尺寸后形成蓝／黑两套共 60 帧。单击现在只在原地回应，只有拖动才改变位置；真实运行或等待任务仍可按现有设置跟随至输入区。
- 为什么这样改：跨页伙伴需要对当前产品区域和真实工作阶段做直接、稳定的反馈，而不是通过点击代替导航或配置。五套场景动画让目录停靠、页头陪伴、输入、工作与休息都有明确可见区别，同时避免用虚假进度或额外模型调用来制造互动。
- 影响了哪些模块：只影响小鲸灵原生插件的资源、显示、交互与说明；不修改会话消息、模型请求、目录、输入框和其他插件的状态。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：小鲸灵定向 Vitest 9/9、包级 TypeScript、bundle 与完整 `build:official` 通过；`npm pack --dry-run` 确认发布包只包含 60 张 v2 运行帧，不包含母版、切帧源图或旧资源。真实 3080 页面验证单击前后 `habitat=sidebar` 不变、动画帧会继续前进，742 × 783 与 600 × 800 两种窗口下均可用。综合对比记录在 `design-qa-product-companion-v2-comparison.png`，`design-qa.md` 结论为 passed。

### 2026-08-24 07:32 - 让小鲸灵跟随真实任务并进入独立设置

- 本次任务：基于 Codex pets、Claude Pet、OpenPet 与 CoPet 的成熟做法，补齐小鲸灵在用户发送消息后的任务反馈、实际耗时、设置入口和皮肤／行为管理。
- 改了哪些文件：更新 `packages/client/ui-product-companion/` 的角色组件、设置组件、样式、持久化 store、文案、测试与双语 README；更新 `packages/client/ui-settings-general/src/client/SettingsRoot.tsx`、依赖锁文件、仓库双语 README、小鲸灵双语 Agent Note、`design-qa.md` 与本文件。
- 改了什么：角色从现有会话投影读取真实运行、等待确认和完成阶段，任务开始后显示实际已用时间并在完成时短暂保留；任务运行时自动靠近输入区，完成时可移动到页头；设置目录新增独立“小鲸灵”页面，可切换深海蓝／夜航黑、开关任务状态和自动跟随、恢复默认位置。设置与角色复用同一个持久化 store，刷新后继续生效。
- 为什么这样改：固定时长动画或假百分比会在任务仍运行时错误回到空闲，点击角色再弹设置卡又把互动与配置混在一起；真实会话状态、实际计时和独立设置页能同时解决进度可见、直接互动和长期可控三个核心任务。
- 影响了哪些模块：只影响小鲸灵原生插件及设置导航图标；不读取消息正文、不新增模型请求、不改变会话事件、模型调用、其他插件和用户数据。项目用途、代码结构和关键入口已复核，第 1–3 节仍然准确。
- 验证：小鲸灵定向测试 8/8、两个相关包 TypeScript 与 bundle 通过；真实 3080 页面完成设置入口、蓝黑换肤即时生效、刷新持久化、两个行为开关与默认恢复验收，742 px 可视宽度下没有截断或横向溢出。

### 2026-08-24 06:30 - 把小鲸灵从状态卡片改为直接互动伙伴

- 本次任务：针对小鲸灵点击后只出现“回到目录／换皮肤”卡片、角色不移动、停到目录旁也不换姿态的问题，重做角色的互动与页面位置模型。
- 改了哪些文件：更新 `packages/client/ui-product-companion/src/client/` 下的角色组件、样式、持久化 store、文案和测试，新增语义停靠点计算；同步更新插件中英文 README、仓库中英文 README、Agent Note、`design-qa.md`、真实页面验收截图和本文件。
- 改了什么：删除角色点击后的状态与皮肤卡片；点击改为带跳跃动作地切换目录、页头、输入框三类真实区域；拖到区域附近自动吸附，其他位置允许自由停留；不同区域使用不同姿态，鼠标靠近会跟随，空闲时主动变换动作并偶尔换位置，等待确认靠近输入框，任务完成短暂庆祝。任务语义状态与表演姿态分离，避免只是鼠标悬停就错误播报“有任务等待”。
- 为什么这样改：伙伴的核心价值是与产品空间和工作状态产生即时可见的关系，而不是成为另一张设置卡；直接操控、语义吸附和状态表演比“点开查看／换皮肤”更符合用户对桌面宠物的直觉，也减少了额外文案和设置层级。
- 影响了哪些模块：只影响 `ui-product-companion` 的浏览器交互与文档；不改变会话、目录、输入框、任务状态或模型请求。现有蓝黑透明帧、Loader 热插拔和 Host 静态资源保持不变。
- 验证：定向组件测试 6/6、包与全 Client TypeScript、bundle、完整 Web 构建和 diff check 通过；真实拖动事件已覆盖输入框语义吸附。742×783 的真实 3080 页面确认旧卡片文案与 region 均为 0，点击后角色从目录旁 `32/235` 移到输入框旁 `596/580`，姿态从 idle 改为 working，7.9 秒空闲后会主动改为 attentive 姿态。修复了角色图片 CSS 类误命中旧 E2E `[class*=frame]` 选择器、提示气泡重复占用 `role=status` 的回归，相关两个 Web 用例定向通过。全量 GUI 仍有 2 个、本地 Web replay 仍有 66 个本任务前已有的组件契约与过期 golden／fixture 失败。

### 2026-08-24 01:32 - 新增跨页面小鲸灵原生插件

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
