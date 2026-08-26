# Xiaozhuang DSH

[English](README.md) | 中文

Xiaozhuang DSH 是一个基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区插件增强发行版。它保留上游“一切皆插件”的基础，并持续加入更适合本地 AI 工作的可观察、可控制和可扩展能力。

> 这是独立的社区项目，不是 DeepSeek 官方发行版。上游架构、许可证和署名均完整保留。

[下载最新版本](https://github.com/niushuanan/xiaozhuang-dsh/releases/latest) · [查看上游项目](https://github.com/deepseek-ai/deepseek-harness)

## 为什么做这个发行版

DeepSeek Harness 本身已经提供了丰富的智能体运行时、插件组合、会话、工具、模型适配器和 Web 工作区。这个仓库不替换这些基础，而是把新增能力做成原生插件或很窄的扩展点改造，让每项功能都可以独立理解、启用、移除和持续迭代。

产品优先级很直接：核心流程必须可用，常见问题能够恢复，界面足够紧凑，可以真正用于日常工作。

## 当前包含的增强

| 方向 | 解决什么问题 |
| --- | --- |
| **Computer Use** | 提供原生 macOS 桌面控制、隔离式 Playwright 浏览器、已连接 Chrome 控制，以及可调整宽度的产品内浏览器工作区。 |
| **Teamwork 与并行开发** | 支持配置 Codex 协作者，把独立任务放入隔离 Git worktree，分别实现和审查，再受控集成回主工作区。 |
| **原生纯聊天** | 无需选择文件夹或授予 Agent 执行能力即可开始持久对话；熟悉的对话页保留模型选择和历史，同时移除工作区、模式、工具与权限控件。 |
| **模型用量** | 预加载 DeepSeek、KIMI、GLM 和当前 GPT 登录账号的用量，支持手动刷新、自动刷新、额度窗口与重置时间。 |
| **会话内实时控制** | 在已有对话中切换 Agent 预设，按模型选择合理思考强度，并把规划和团队状态放到更合适的位置。 |
| **命令、插件与技能** | 输入框加号在同一个原生目录中展示图片、工作区引用、实时官方命令、插件和 Skill；选中只插入斜杠命令，不立即执行。 |
| **Skill 管理** | 在清晰的能力库中查看个人、项目、运行时、自定义与内置 Skill，同页阅读文件，并从一个菜单导入文件、文件夹、ZIP 或 GitHub 仓库。 |
| **模型输入路由** | 明确区分纯文本与原生视觉能力，让图片模型和视觉工具回退可以同时存在。 |
| **数字伙伴与麦克风听写** | 默认角色“鲸少女”常驻输入框上方，跟随 Agent 状态；支持蓝黑皮肤、自定义名字、浏览器麦克风听写和快捷键。 |
| **多对话分屏** | 最多四个对话并排工作；分叉默认在来源旁打开，也可把目录里的对话直接拖进当前分屏。 |
| **划词引用与记忆** | 在 DSH 消息中选中文字，可就地引用、打开同项目侧边聊天，或让 AI 整理后写入用户主动记忆。 |
| **全局活记忆** | 分开编辑用户主动记忆与 AI 主动记忆；AI 每日维护自己的文档，后续只按相关性召回少量内容。 |
| **对话导出与分享** | 当前对话既可导出完整文本记录，也可生成忽略思考与工具过程的单张 PNG 长图。 |
| **全局 Agent 规则** | 在鲸少女设置页查看和编辑 `~/.dsh/AGENTS.md`。DSH 每个模型步骤都会重新读取，并作为受保护的最后 system 段注入，高于预设、项目规则、Skill、插件、运行时上下文和用户直接提示；供应商侧策略不属于 DSH 控制范围。 |
| **可编辑 System Prompt** | 通用设置直接显示当前基础 System Prompt，而不是提供一个空白追加项。保存后写入 `~/.dsh/SYSTEM.md`，DSH 会从下一次模型步骤起重新读取；它高于产品内其他提示词，仅低于 `AGENTS.md`。 |
| **可搜索插件目录** | “小庄的插件”按工作能力、对话体验、数据与用量自动归类，可按名称、说明、标签或分类直接搜索，与每项能力当前的产品名称和图标保持一致，并把本 MIT 仓库明确显示为蓝色可点击的 Star 链接。 |
| **选择性导出插件** | 可选择一个、多个或全部目录能力，下载一个紧凑 ZIP；其中包含可安装代码、源码、带哈希的 manifest 与可处理冲突的 AI 安装说明，但不包含凭据、对话、设置、依赖、缓存和淘汰素材。 |
| **可排序设置目录** | 直接拖动任意设置项即可调整位置，也可以按住一秒后再移动；松开即自动保存个性化顺序。所有条目始终占满相同的导航宽度，不随文案长短变化。 |
| **持续适配** | 支持主动更新，也可每六小时监控官方 DSH；每个候选版本都经过一次窄范围兼容 Agent，切换继续等待对话空闲、保留数据并支持自动回滚。 |

这些能力继续使用 DSH 的普通包与 Profile patch layer 组装，没有另起一套平行应用。主要新增代码位于 [`packages/computer-use/`](packages/computer-use/)、[`packages/memory/`](packages/memory/)、[`packages/client/ui-chat/`](packages/client/ui-chat/)、[`packages/client/ui-adaptive-update/`](packages/client/ui-adaptive-update/)、[`packages/client/ui-composer-add-menu/`](packages/client/ui-composer-add-menu/)、[`packages/client/ui-skill-manager/`](packages/client/ui-skill-manager/)、[`packages/client/ui-plugin-catalog/`](packages/client/ui-plugin-catalog/)、[`packages/client/ui-selection-actions/`](packages/client/ui-selection-actions/)、[`packages/client/ui-computer-use/`](packages/client/ui-computer-use/)、[`packages/client/ui-provider-quota/`](packages/client/ui-provider-quota/)、[`packages/client/ui-product-companion/`](packages/client/ui-product-companion/)、[`packages/client/ui-multi-window/`](packages/client/ui-multi-window/)、[`packages/session-query/session-log-export/`](packages/session-query/session-log-export/)，以及 [`packages/`](packages/) 下的子代理、会话、预设和插件加载扩展。

侧边栏会在对话开始前区分意图：**开始工作**沿用当前工作区链路，**开始聊天**则在独立的**聊天**分组中打开或复用空白对话；如果任一入口仍在创建时用户改变主意，永远以最后一次点击为准，较早完成的异步结果不会把页面抢回去。聊天使用内部无工具预设，不绑定文件夹，也不显示工作区、模式、能力添加和权限控件；模型选择、持久历史、标题、搜索与删除仍沿用普通会话行为。无论聊天还是工作，启动新一轮的消息都会先即时显示在对话中，再出现轮次活动提示；Host 持久消息到达时会原位接管，不生成重复气泡。

原生 **Skill 管理**设置页把已有注册表变成一个可读的能力库。首屏使用产品既有 Skill 图标和来源标签组成自适应目录；点开后目录会切换成专注阅读区，把可展开的人性化介绍放在文件树和正常宽度的选中文件上方。`SKILL.md` 的 frontmatter 仍保留在源文件中，但不再挤占可视化 Markdown 预览。当前选中纯聊天时，管理页改读最近工作会话的目录，不会把用户已经安装的 Skill 隐藏掉；纯聊天本身仍然得不到 Skill 或工具能力。个人 Skill 可写，项目、运行时、自定义和内置来源只读。一个黑色的**导入 Skill**菜单并列提供文件、文件夹和 GitHub 来源：文件与文件夹会立即打开选择器，GitHub 才在下方展开仓库地址输入框。来源先作为不可信数据暂存，再由 `deepseek-official/deepseek-v4-flash-vision-exp` 规范化、校验并只原子安装到个人 Skill 目录，适配失败不会破坏旧 Skill。

原生**持续适配**设置页保留主动更新按键，并新增**自动更新 · 每 6 小时**胶囊。开启后立即生效并跨重启保留。发现官方新提交时启动同一套外部事务。每个候选版本都调用兼容 Agent：无冲突时最多用五分钟只检查上游与本地插件直接重叠的契约，通常不改代码；存在冲突时不设人工超时，但严格限制在实际冲突文件和它们的直接编译依赖。快速链路随后只准备依赖、执行一次生产构建，最多进行一次窄范围修复，不再做语义深审、更新器回归、独立全仓类型检查、Web 回放或切换前影子启动。其私有 Headless Agent 固定使用 `deepseek-official/deepseek-v4-flash-vision-exp`。

短暂切换仍会等待实时对话空闲，通过写时复制快照保留现有 DSH Home；重启后的 Host 或 Client 未就绪时同时恢复源码和数据。对话记录和附件始终留在原 Home，临时工作树与私有 Agent Home 会被删除，只保留一份回滚快照。首次 rc.2 自适配实验完整保留了 122 个会话文件和 87 个附件；当前快速链路保留这些安全边界，但不再重复当时的 283 项 Web 回放。

插件中心本身也是一个原生插件。每项精选能力只登记一次分类、包根目录和 Cordis 行，页面会据此生成分组、数量、搜索结果、运行开关与导出选择。点击**导出插件**直接在当前列表进入选择；即使搜索隐藏了部分条目或插件当前处于关闭状态，**全选 16 个**仍代表完整目录。Host 在内存中生成 ZIP，只带源码、构建代码和 package 声明的运行素材，并附上 `AGENTS.md`、`INSTALL.md` 与 SHA-256 manifest，让另一套 AI 可以直接安装，或针对目标 DSH 版本窄范围处理冲突。对话、设置、凭据、`node_modules`、缓存、测试目录和淘汰的伙伴素材都不会导出。

### Computer Use 工作区

<img src="design-qa-computer-use-wide-final.png" alt="Xiaozhuang DSH 产品内的 Computer Use 浏览器工作区" width="920">

### 模型用量面板

<img src="design-qa-provider-quota-v4.png" alt="DeepSeek、KIMI、GLM 和 GPT 模型用量面板" width="720">

### 多对话分屏

在任一非空会话的 `…` 菜单选择“并排打开”，该对话会直接成为当前页面里的第二块工作区，不再弹出系统窗口。无论从目录会话行还是已完成的对话回合发起分叉，产品都会保留来源为主块，并把新分支自动放到旁边。用户也可以把目录里的对话直接拖到对话区域；页面会显示明确的接收态，松开后作为副块打开，不会误触目录排序。每块都保留完整历史、自己的输入框和独立草稿；两块默认均分空间，继续添加后最多形成四块。拖动块间分隔线只会放大一侧并缩小相邻一侧，其他块自动适配；双击分隔线恢复均分，调整比例会随当前对话组合保存。分屏变窄时自动隐藏用量、导出、浏览器入口和运行数据等次要信息，并动态限制最小宽度，只保留标题、视图、正文、必要控制与输入。副块不复制侧栏、详情栏或数字伙伴，关闭任意一块也不会切换或中断其他对话。

### 划词引用与活记忆

在一条已经完成的 DSH 消息内选中文字，页面会紧贴选区上方显示横向的**引用 / 记忆 / 侧边聊天**工具条。引用只在输入框上方增加一条带编号的注释，不再在编辑区重复显示“@已选文本”；悬停可查看完整原文，预览始终收在当前对话分块内，长链接或代码也会自动换行，不会压到相邻分块。移除或发送前来源旁保留对应编号，刷新页面后结构化来源也会随草稿恢复。侧边聊天把同一份引用放进同项目的新对话，并在来源旁并排打开。记忆会让当前模型把选中文字与受限上下文整理成可复用经验，只有文档确实变化时才写入并提供立即撤销。引用和记忆使用各自的简洁线性图标，记忆相关入口统一使用同一枚脑形图标。

设置页把用户主动记忆和 AI 主动记忆显示为两份独立的全局 Markdown 文档。用户主动记忆只由明确划词或手动编辑改变。持续运行的 DSH 会在每天本地零点只复盘刚结束的自然日，逐条加载对话，并在自己的文档中新增、合并、更新和删除知识。产品启动时不会扫描历史，错过零点也不会稍后补跑。后续任务只在本轮请求之前召回少量相关块，并包在明确的不可信数据边界内。

### 数字伙伴“鲸少女”

“鲸少女”是默认名字，“鲸”来自 DeepSeek 的鲸系视觉符号。这个名字不会锁死用户：在设置中进入以当前角色名显示的栏目即可修改；保存后左侧目录、页内标题、角色辅助名称、右键菜单和显示开关立即统一，刷新后仍然保留。底层插件 id 始终稳定，改名不会影响热插拔或已有偏好。

她常驻在真实输入框右侧正上方，身体可见轮廓刚好贴住上沿，不遮挡输入文字。动作只跟随 Agent 状态和输入框的真实位置，不被鼠标悬停驱动。工作态刻意保持安静：只有当前对话开始运行或任务事实确有更新时，才短暂播放一次专注趴姿，随后回到稳定姿态；后台对话只更新任务数字和列表，不再带动人物晃动。切换对话本身不会触发换位：插件等待输入框布局稳定，只有最终锚点确实改变至少 6 px 才开始；瞬时落到底部又回到原位会被忽略。空闲、专注、等待和完成都使用全趴姿动作。V14 角色原画统一收窄腰部以下轮廓，并在臀腿、抬起的双腿和靴子周围增加透明留白；前臂护甲改为珍珠白和极浅冰蓝，黑色手套、蓝色上臂甲与深色主体不变，使手臂不再与躯干糊成一团，四种状态和蓝黑皮肤使用同一套清晰比例与材质分层。

精灵仍视觉上浮在产品之上，但不会霸占整块矩形的左键：点击落在她覆盖的原生输入框、按钮、链接、选择器或编辑区时，优先交给底层控件；只有下方没有可操作内容时，才执行精灵已配置的单击或双击。右键仍保留精灵自己的关闭／菜单动作。

输入框真正换位时，插件冻结当前同一张人物原画和尺寸，再用 48 个由角色真实轮廓计算出的 V13 身体材质遮罩，让靴子、发梢和服装边缘先化成保留原色的细小片段，脸部留到最后阶段才消散。人物完全消失后才切换坐标，到达阶段严格反放同一组遮罩完成重组；底下两个圆键也被视为角色附属件：离场早期就暂停响应并淡出，在隐藏坐标切换期间保持不可见，只在新锚点的人物重新聚合时再出现，绝不会滞留在旧输入框。1040 ms 的单程节奏与 28 ms 相邻帧衔接减少阶梯感。每个可见片段都来自当前角色图，不再有独立泡沫云、传送门、第二套人物或尺寸跳变。蓝色／黑色皮肤、尺寸、任务气泡和三种快捷动作仍可在独立设置页管理。

数字伙伴左侧的波形按钮可以直接调用浏览器麦克风听写，识别原文按当前光标位置回填真实输入框。按钮始终保持黑底白色波形，录音中只让波形自然跳动，不切换颜色、不改变人物动作，鼠标悬停也不显示提示层。默认 `⌥ Space` 是 DSH 窗口内快捷键，单击、双击或右键也可以绑定麦克风听写。产品不设置录音倒计时：浏览器结束一段底层识别后会自动续接，直到用户再次点击、按快捷键、关闭插件或系统中断。该链路不读取模型列表、不调用大模型、不做 AI 润色，也不保存录音或听写正文。

<a id="run"></a>

## 下载与运行

### 推荐：下载发行包

打开 [Releases](https://github.com/niushuanan/xiaozhuang-dsh/releases/latest)，下载 `xiaozhuang-dsh-v0.4.2-prebuilt-source.tar.gz`。发行包同时包含源码和对应提交已经构建好的 Host、Client 与 Web 产物，首次运行前不需要再在本机执行构建。

当前打包版本：[Xiaozhuang DSH v0.4.2](https://github.com/niushuanan/xiaozhuang-dsh/releases/tag/xiaozhuang-v0.4.2) · [直接下载发行包](https://github.com/niushuanan/xiaozhuang-dsh/releases/download/xiaozhuang-v0.4.2/xiaozhuang-dsh-v0.4.2-prebuilt-source.tar.gz) · [SHA-256 校验文件](https://github.com/niushuanan/xiaozhuang-dsh/releases/download/xiaozhuang-v0.4.2/SHA256SUMS.txt)。

运行要求：

- Node.js `^22.19.0` 或 `>=24.0.0`
- 通过 Corepack 使用 pnpm `11.7.0`
- 开发和 Teamwork worktree 功能需要 Git
- 只有启用桌面 Computer Use 时，才需要授予 macOS 辅助功能与屏幕录制权限

```sh
tar -xzf xiaozhuang-dsh-v0.4.2-prebuilt-source.tar.gz
cd xiaozhuang-dsh-v0.4.2
corepack enable
pnpm install --frozen-lockfile
pnpm dsh web
```

Web UI 默认启动在 `http://127.0.0.1:3080`。

<a id="run-from-source"></a>

### 从 Git 源码运行

```sh
git clone https://github.com/niushuanan/xiaozhuang-dsh.git
cd xiaozhuang-dsh
corepack enable
pnpm install --frozen-lockfile
pnpm run build:official
pnpm dsh web
```

## 配置与隐私

仓库和发行包不包含 API Key、登录会话、账号 Token、对话数据或本机 DSH Profile 状态。模型提供方和系统权限都需要在使用者自己的电脑上配置。模型用量插件只在运行时读取支持的本机账号配置，不会把凭据暴露给浏览器。麦克风听写首次使用时会由浏览器请求权限；音频交给浏览器的语音识别能力处理，插件本身不保存录音或听写正文，也不会把识别结果发送给模型。

Computer Use 和外部协作者都是可选能力。各包 README 记录了权限、提供方要求、失败方式和已知限制。

产品自有的后台 AI 功能，包括 Skill 导入、活记忆维护和兼容适配，默认使用低成本的 `deepseek-official/deepseek-v4-flash-vision-exp` 路由。普通工作和聊天对话仍使用用户选择的模型。

## 持续迭代

这个仓库会持续公开已经在日常本地工作中证明有用的插件改进。后续会重点完善整机 Token 总览、更清楚的运行详情、更高效的输入区菜单、更流畅的输出体验，以及更简单的精选插件安装方式。麦克风听写保持为直接、可预期的输入能力，后续只考虑更多本地识别选项与系统级快捷键能力。

新增能力仍然遵循插件优先：必须解决一个用户能感知的任务，保留上游运行主干，并且可以在不破坏其他流程的情况下移除。

## 开发与贡献

修改包之前请先阅读[开发指南](docs/development.zh.md)、[架构文档](docs/architecture.zh.md)和[贡献指南](CONTRIBUTING.zh.md)。适用于所有使用者的通用修复，仍建议提交给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上游。

本仓库保持源码和 Issues 公开，但不接收外部 Pull Request。Bug 和产品建议请通过 [Issues](https://github.com/niushuanan/xiaozhuang-dsh/issues) 反馈；仓库写权限仅由所有者持有。

## 许可证

[MIT](LICENSE)。第三方依赖与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
