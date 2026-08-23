# Design QA: 设置目录第二位与 Teamwork Codex 单层图标

## Evidence and normalization

- Source visual truth: 用户截图 `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-4259fd0f-e247-4ae7-978a-e733d4800cbd.png` 指定「小庄的插件」应仅次于通用设置；截图 `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-3207af4a-dfb9-477c-b289-3e20a43428f1.png` 展示 Codex 图自带白色板上又出现外层底板和描边。
- Before evidence: `design-audit-settings-before.png` 与 `design-audit-teamwork-icon-before.png`（均为 1280×720 px、浅色主题、真实设置弹窗）。
- Final evidence: `design-audit-settings-after.png` 与 `design-audit-teamwork-icon-final.png`（均为 1280×720 px、相同真实页面与状态）。
- Full comparison: 两张用户截图与两张最终截图已在同一次视觉比较输入中打开；只比较设置导航相对顺序，以及 Codex 品牌图的底板、描边、光学大小和对齐。

## Comparison history

- P1: 「小庄的插件」原 order 25，排在模型、插件、Computer Use、Agent 预设、Teamwork 和 Token 总览之后，违背自研插件中心作为核心入口的产品优先级。Fix: order 改为 1，通用设置继续为 0。
- P2: Codex PNG 已包含白色圆角应用板与阴影，36px slot 又添加 `background:#fff` 和 inset 描边，形成双层／三层轮廓；旧的非居中负位移进一步暴露底板。Fix: slot 改为透明、无阴影并允许图片自身阴影完整显示；资产按透明留白做居中光学校正。
- Post-fix: 稳定页面导航前两项为「通用设置」「小庄的插件」；Codex 行只有原生图片自身的一层应用板／阴影，没有第二个白色方框或 inset 描边。

## Runtime and interaction checks

- 真实 settings dialog 的前八个导航项依次为：通用设置、小庄的插件、模型、插件、Computer Use、Agent 预设、Teamwork、Token 总览。
- Teamwork 两个外部专家开关、模型和思考强度仍可见；Z Code 行没有受到 Codex 光学修复影响。
- 两个 Profile 插件 12/12 定向测试通过；服务稳定后新开 3080 页面 console error/warn 为 0。

## Findings

No actionable P0, P1 or P2 issue remains in the requested settings ordering or Codex duplicate-plate treatment.

final result: passed

---

# Design QA: 跨页面小鲸灵原生插件

## Evidence

- ImageGen source frame and real-browser render comparison: `design-qa-product-companion-comparison.png`.
- Desktop implementation at 1440 × 1000: `design-qa-product-companion-wide.png`.
- Narrow implementation at 600 × 800: `design-qa-product-companion-narrow.png`.
- Hot-plug entry in the real Xiaozhuang plugin center: `design-qa-product-companion-plugin-center.png`.
- Runtime: `http://127.0.0.1:3080/`, a real historical conversation and the existing local Web profile.

## Product review

1. **Cross-page presence — passed.** The companion is mounted once in `shell.overlay`, remains visible when Settings opens, and does not create a second copy. It sits beside the directory by default, while drag persistence lets the user choose another position.
2. **Useful state instead of decoration — passed.** Live session projections choose waiting before working, then idle. A finished task briefly selects the success frame; prolonged inactivity selects sleep. Clicking opens one compact status surface with the current task title, running/waiting counts, skin choice and position reset.
3. **Visual fidelity — passed.** Ten transparent 512 × 512 PNGs cover blue/black skins and idle/working/waiting/success/sleep states. The comparison capture confirms the generated whale-hood character keeps its silhouette and transparent edge after browser scaling; no checkerboard, white matte or unintended crop remains.
4. **Responsive behavior — corrected and passed.** The first 600px capture stretched the panel across the full viewport and hid the pet. The final panel stays 272px wide, chooses the free side of the character, remains inside the viewport, and leaves the pet visible. Document width remains exactly 600px with no horizontal overflow.
5. **Hot plug — passed.** The Xiaozhuang plugin center shows one `小鲸灵` row backed by the Loader id `ui-product-companion`. Turning it off removes the overlay; turning it on mounts the same root again without a DSH restart. The switch and visible overlay agreed after both transitions.

## Runtime validation

- All ten asset routes returned PNG with one-year immutable cache headers; the active image reported `complete=true` and natural width 512.
- Skin selection persisted across reload. Drag changed the position from `14px / 620px` to `280px / 456px`, and the same values returned after reload; reset restored the directory-side default.
- Clicking outside closed the status panel. Desktop and narrow captures showed no clipping or duplicate overlay.
- Product-companion tests passed 3/3; the local hot-plug center passed 8/8; package TypeScript, package bundle, client build and full official build passed.
- No product-companion resource, render or interaction error appeared in the browser console. Existing event-stream reconnect and an unrelated Computer Use 404 were present before this feature and were not changed.

No actionable P0, P1 or P2 issue remains in the requested companion path.

final result: passed

---

# Design QA: 加号菜单文件与插件技能一层直达

## Evidence and normalization

- Source visual truth: 用户提供的第三张参考图 `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-181ae9a9-239c-4e64-92aa-4cb5839fa031.png`（1574×746 px），并明确要求文件／文件夹与插件或技能放在同一菜单、仅用分组区分。
- Implementation screenshot: `/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-composer-add-menu-one-layer.png`（1280×720 px、1280×720 CSS 视口、浅色主题），状态为真实会话输入框加号菜单打开态。
- Full-view comparison: source 与 implementation 已在同一次内置浏览器比较输入中打开；两者都展示入口菜单及其所在输入区，用于比较交互层级、分组和列表密度。
- Normalization: source 来自另一产品的宽列表参考，实现必须复用 DeepSeek Harness 现有紧凑弹层、黑白灰 token 和 360px 内容宽；只比较“一层直达、分组清楚、项目可扫描”，不逐像素复制参考图的整页尺寸和插件名称。

## Comparison history

- Earlier P1 finding: 旧实现首击加号只提供「添加文件／运行命令」，插件技能仍需再进入第二层命令目录。Fix: 删除可见「运行命令」中转项，核心 add slot 直接向插件提供热加载 slash 目录与直接插入动作。
- Earlier P1 finding: 文件和命令使用两张强调卡片，既放大阴影和背景，也没有表达用户关心的「添加／插件与技能」语义。Fix: 改为同一轻量菜单内的两个文字分组，行项目使用统一高度、图标、主副文案和内部分隔。
- Post-fix evidence: 真实菜单中「图片文件」「文件与文件夹」与 30 个当前可用技能处于同一层；DOM 中 `运行命令` 数量为 0。

## Required fidelity surfaces

- Information architecture: 第一组「添加」承载图片与工作区文件／文件夹，第二组「插件与技能」承载当前热加载能力；不增加第三层或设置页。
- Typography and density: 分组标签弱化，行标题清楚，说明使用次级灰；菜单固定紧凑宽度并在内容过多时内部滚动，窄窗口不溢出。
- Colors and visual tokens: 沿用 Harness 黑白灰、1px 分隔和轻阴影，没有新增彩色卡片、填充大按钮或装饰背景。
- Icon fidelity: 文件、文件夹、插件和技能均复用项目标准线性图标；不使用文字字符模拟图标。
- Interaction fidelity: 图片仍走原生 file chooser，文件／文件夹仍走原生 workspace reference listbox，技能由当前 lexicon 动态给出并直接写入输入框；插件卸载后原生 fallback 不变。

## Runtime and interaction checks

- 真实 3080 页面打开菜单后：`menu=1`、图片入口 `=1`、文件／文件夹入口 `=1`、`运行命令=0`。
- 点击 `dws` 一次后输入框从空值变为 `/dws `，菜单同步关闭；验收结束后使用真实键盘事件清空输入框。
- 点击「文件与文件夹」一次后原生引用 `listbox=1`，证明没有第二个过渡菜单；Escape 可正常退出。
- ui-conversation TypeScript、99/99 定向 Vitest 与 bundle 通过；Profile 插件契约测试 6/6，当前页面 console error/warn 为 0。

## Findings

No actionable P0, P1 or P2 mismatch remains. Files, folders, plugins, and skills now share one differentiated menu and every visible item reaches its native action in a single click.

final result: passed

---

# Design QA: Computer Use 能力行删除重复图标

## Evidence and normalization

- Source visual truth: 用户问题截图 `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-87ee443c-b647-4c90-bac1-06f164acd242.png`（612×364 px），以及用户明确要求「这里不要这两个 icon」。
- Implementation screenshot: `/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-computer-use-capabilities-no-icons.png`（1280×720 px，1280×720 CSS 视口、device scale 1、浅色主题），状态为真实「设置 → Computer Use」打开态。
- Full-view comparison: source 与 implementation 已在同一次内置浏览器比较输入中打开；实现保留完整设置弹窗，以确认删除图标没有破坏导航、开关或后续浏览器来源分组。
- Focused region comparison: 重点检查「能力」分组两行；source 中标题左侧分别有齿轮和浏览器图标，implementation 中两行从统一文本基线开始，没有残留图标或空槽。
- Normalization: source 是 612×364 的局部裁切，implementation 是 1280×720 完整弹窗；只比较同一浅色状态下能力行的图标、文本起点、分隔线和开关对齐，不把裁切范围差异视为设计问题。

## Comparison history

- Earlier P1 finding: 「桌面控制」与「浏览器控制」名称已经清楚，行首再放设置／浏览器图标重复语义，并造成与其他设置行不同的额外视觉槽。Fix: 删除两处图标渲染和无用 `.rowIcon` 样式，让标题、说明统一回到左侧内容基线。
- Post-fix evidence: 最终截图中「能力」标题下两行均以纯文字开始，分隔线仍以内收方式存在，两个黑白胶囊开关保持同一右侧对齐；真实 DOM 快照在两行标题前没有图形节点。

## Required fidelity surfaces

- Fonts and typography: 两个标题、说明文字的字号、字重、行高和颜色均未改；去掉图标后文字层级更直接。
- Spacing and layout rhythm: 行高、上下 padding、内收分隔线和右侧开关位置保持不变；删除图标及其 14px gap 后，两个文本块使用同一内容起点，没有空槽。
- Colors and visual tokens: 沿用原有黑白灰、边框与胶囊开关 token，没有新增颜色、背景或阴影。
- Image and icon fidelity: 用户指定的两个行内图标已完全移除；设置导航和 Computer Use 其他有独立操作语义的标准图标未被误删。
- Copy and content: 「桌面控制」「浏览器控制」及两条说明原样保留，功能状态和授权文案未改变。

## Runtime and interaction checks

- Computer Use 设置定向 Vitest 1/1 通过，并断言两条能力行内部不存在 SVG；TypeScript `--noEmit` 与客户端 bundle 成功。
- 真实路径完成「设置 → Computer Use」，桌面／浏览器开关仍为选中态，浏览器来源分段控件和连接信息继续显示。
- 新开本地页面的 console error/warn 为 0。

## Findings

No actionable P0, P1 or P2 mismatch remains. Both capability rows are now text-first, visually aligned, and free of the two redundant icons requested by the user.

final result: passed

---

# Design QA: Token 标题去图标与三柱增长入口

## Evidence and normalization

- Source visual truth: 用户问题截图 `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-98f44ba9-be7c-4b93-aa4c-f916e013d6a9.png`，以及用户明确补充的两条规则：页面标题不放图标；入口图标为三根从低到高的竖线。
- Implementation: `http://127.0.0.1:3080/` 的「设置 → Token 总览」真实打开态，1280×720 CSS 视口、浅色主题；实现截图与用户截图已在同一次内置浏览器比较输入中打开。内置浏览器截图作为本轮工具证据保留，未暴露独立文件路径。
- Normalization: 用户截图是标题区域的局部裁切，实现证据同时覆盖标题与设置导航；只比较标题图标是否存在、入口图标方向和信息层级，不把弹窗外背景与完整数据内容视为差异。

## Comparison history

- Earlier P1 finding: 页面标题把设置入口的识别符号重复放到内容标题左侧，与其他设置页的纯文字标题规则冲突。Fix: Token Overview 自身不再导入或渲染任何标题图标，标题恢复为纯文字。
- Earlier P1 finding: 旧实现裁切列表图标，只剩三条横线，既不像增长趋势，也无法表达用量。Fix: 设置导航改用三根从左到右逐级增高的竖向柱线；不再裁剪或缩放列表图标。
- Post-fix evidence: 标题 `h2` 内 SVG 数量为 0；Token 导航按钮内恰有 3 条路径，路径分别为 `M5 21v-6`、`M12 21V9`、`M19 21V3`，从左到右高度递增。

## Required fidelity surfaces

- Fonts and copy: `Token 总览`、客户端列表和刷新时间保持原字号、字重、行高和文案；删除图标后标题从同一内容起始线对齐。
- Spacing and layout rhythm: 标题区域去掉 25px 图标与 11px 间距，未改变标题下方文案、范围切换器或数据卡片布局；导航继续使用 16×16 原生图标槽。
- Colors and visual tokens: 新入口图标继承 `currentColor`，保持设置导航已有的黑白灰与选中态，不增加背景、品牌色或阴影。
- Image and icon fidelity: 三柱图标来自标准图标库轮廓并接入现有 primitives，未使用横线裁切、文字字形、位图近似或 CSS 图形。
- Copy and content: 页面仍只显示一个 `Token 总览` 标题；后台自动更新文案和统计数据未改。

## Runtime and interaction checks

- 定向 Token Overview 契约测试 3/3、UI Primitives 与 Settings General Vitest 97/97 通过；两包 TypeScript 和 bundle、Web 前端 build 均成功。
- 真实路径完成「设置 → Token 总览」，标题无图标、导航为三柱增长图标，范围切换和数据内容正常显示。
- 新开内置浏览器标签重新执行同一路径，控制台 error/warn 为 0。

## Findings

No actionable P0, P1 or P2 mismatch remains. The page title now follows the other Settings sections, while the navigation glyph communicates usage growth with three ascending vertical columns.

final result: passed

---

# Design QA: Z Code 原生应用图标统一

## Evidence and normalization

- Source visual truth: `/Applications/ZCode.app/Contents/Resources/icon.png`（1024×1024、Display P3、透明 PNG）以及用户提供的 Dock 截图 `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-b5825c3d-9b27-454d-af8b-06815760d660.png`。
- Implementation: `http://127.0.0.1:3080/` 的「设置 → Teamwork」和标题栏「模型用量」两种真实状态；同一内置浏览器 1280×720 CSS 视口的运行截图已与 source visual truth 在同一次比较输入中打开。浏览器截图由内置浏览器工具保留为本轮证据，未暴露独立文件路径。
- Asset identity: 应用包源图、Teamwork 本地副本、模型用量本地副本三者 SHA-256 均为 `edd87a182097389b0f59c07f8de283dbe433c9d37cd6e9a2a372611516ab81eb`。
- Normalization: Teamwork 使用原有 36×36px／8px 圆角槽，模型用量使用原有 34×34px／8px 圆角槽；仅比较图标主体、裁切、圆角和清晰度，不把 Dock 背景或系统放大效果算作产品差异。

## Required fidelity surfaces

- Fonts and copy: 未改变 Teamwork、Z Code、GLM 或模型用量文字；字号、字重与行高保持现有设计系统。
- Spacing and layout rhythm: 两个入口继续占用原槽位，没有改行高、网格、间距、弹窗尺寸或分隔线。
- Colors and tokens: 保留应用图标自带黑底、白色 Z 与细微高光；槽位只用黑色托底处理透明边，不额外重绘或染色。
- Image quality and asset fidelity: 网页 Z.ai 通用 logo 已彻底移除；两个入口直接使用已安装 Z Code 应用的 1024px 原生 PNG，未生成近似 SVG、文字图形或 CSS 图形。
- Responsive behavior: 图标仍由固定方形槽和 `object-fit: contain` 约束，在设置窄页与模型用量 2×2 卡片内均不溢出。

## Runtime and interaction checks

- Teamwork 真实设置页显示原生 Z Code 图标，开关、模型和思考强度控件均保持可用。
- 模型用量真实弹窗的 GLM 行显示同一 Z Code 图标；四品牌圆角槽仍一致，用量与重置时间正常返回。
- 两个本地图片 GET 均返回与桌面应用源图完全相同的字节；当前浏览器控制台 error/warn 为 0。
- Teamwork／插件中心 Node 契约测试 14/14，模型用量 Vitest 5/5，通过；模型用量 Host 与 Client bundle 成功。

## Findings

No actionable P0, P1 or P2 mismatch remains. The implementation uses the exact installed Z Code application artwork in both requested surfaces, with only the intentional slot-size difference between Teamwork and the compact usage panel.

final result: passed

---

# Design QA: Computer Use 三栏兼容与 Token 标题简化

## Evidence and normalization

- 用户问题截图：`/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-83480dfe-f692-4795-9d8a-5881574fbe04.png`（1940×1724 px），用于确认左侧标题重叠、对话列过窄、Computer Use 无法共享宽度，以及 Token 标题冗余状态文案的问题。
- 同一 1280×720 CSS 视口下的修复前后证据：`/Users/zhuanghongkai/Desktop/迭代DSH/design-qa-three-pane-before.png`、`/Users/zhuanghongkai/Desktop/迭代DSH/design-qa-three-pane-final-balanced.png`、`/Users/zhuanghongkai/Desktop/迭代DSH/design-qa-three-pane-final-resized.png`；三张图来自同一内置浏览器会话，并已在同一次 `view_image` 比较输入中打开。
- Token 最终证据：`/Users/zhuanghongkai/Desktop/迭代DSH/design-qa-token-overview-final.png`；验收态为设置 → Token 总览，标题旁无后台状态文本。

## Comparison history

- Earlier P1 finding: Computer Use 使用固定宽度并在窄容器下切成覆盖层，导致对话列被压到约 193px，顶部标题和模式／用量入口重叠。Fix: 会话列和工作区改成同一 flex 空间内的两个可收缩区域，分别保留可读最小宽度；窄列标题使用 container query 自动换行，不再覆盖。
- Earlier P1 finding: 工作区宽度只反映存储值，用户无法像目录分栏一样连续调整。Fix: 分隔条直接依据实际渲染宽度拖动，并支持键盘左右方向键；一侧增大时另一侧同步缩小。
- Earlier P2 finding: Token 总览使用复杂图片符号，并在标题旁显示「后台更新中／数据已同步」。Fix: 复用项目原生线性图标，仅保留前三条横线；状态刷新继续在后台执行，但不再占用标题视觉层级。

## Required fidelity surfaces

- Layout: 左侧导航、对话区、Computer Use 在同一主区域中共同分配宽度；浏览器工作区不再覆盖对话，拖动分隔条后两侧即时互补缩放。
- Typography and spacing: 窄对话列下标题、模式和用量入口自动分行，字号、间距和原产品体系保持一致，没有新增卡片或说明层。
- Color and icon quality: 继续使用 Harness 黑白灰与现有矢量 stroke；Token 图标只呈现三条清晰细线，不使用位图、彩色点或装饰背景。
- Copy: 删除「后台更新中」和「数据已同步」，保留静默的 `aria-busy` 供辅助技术读取刷新状态。

## Runtime and interaction checks

- 在内置浏览器真实打开 Computer Use；页面存在 1 个可访问分隔条，按 ArrowRight 后浏览器列缩小、对话列扩大，截图可见输入区和标题保持可用。
- 设置 → Token 总览真实打开后，DOM 中不存在「后台更新中」与「数据已同步」；导航和页面标题均为三线矢量图标。
- 最终浏览器控制台无 error/warn。
- Token 插件契约测试 3/3；相关 Vitest 定向回归 115/115；`ui-primitives`、`ui-conversation`、`ui-computer-use`、`ui-settings-general` 均成功完成 bundle。

## Findings

No actionable P0, P1 or P2 issue remains in the requested three-pane resizing, Token icon, or title status behavior.

final result: passed

---

# Design QA: 运行概览背景仅包裹内容

## Evidence and normalization

- 用户问题截图：`/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-36eeb4ee-dab6-4fca-b7a8-7beaf1991caa.png`，明确指出底部统计条的灰色反馈不应横跨整个输入区。
- 修复后运行态截图：`/tmp/runtime-pulse-content-width-final-verified.jpg`；与用户截图在同一次 `view_image` 比较输入中打开。真实页面仍为 `http://127.0.0.1:3080/`、1034×820 CSS 视口和相同的 `5 轮 · 6 步 / 58 tok/s / 缓存 87% / 101K → 6.8K` 数据。

## Comparison and fix

- P1 finding: `.rp-trigger` 使用 `width:100%`，因此 hover／展开时的 5% 灰色背景覆盖 714px 整行，看起来像一根与文字无关的横长条。
- Fix: 外层 `.rp-root` 只负责 flex 居中；按钮改为 `inline-flex; width:auto; max-width:100%`，背景和圆角随文字、分隔线及箭头的真实内容宽度收紧。详情面板、数据、点击范围内边距和窄容器上限均保留。

## Runtime and interaction checks

- 真实展开态测量：按钮宽 306.32px，容器宽 714px，占比 43%，不再是 100%；展开背景仍为 5% 中性灰。
- 点击统计摘要后 `aria-expanded=true`，`本会话运行详情` 面板真实出现；关闭 Computer Use 覆盖层后完成同一路径验证。
- Runtime Pulse 3/3 定向契约测试通过；稳定重载后页面标题、会话内容和底部摘要均正常，无框架错误遮罩。

## Findings

No actionable P0, P1 or P2 issue remains in the requested content-width background behavior.

final result: passed

---

# Design QA: 会话内 Computer Use 浏览器工作区

## Evidence and normalization

- 用户选定设计：`/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-9aa2d28e-7293-40bb-b21f-2f2de95b7c13.png`（1536×1024 px）；它明确要求左侧保留对话、右侧提供完整浏览器工作区。
- 最终宽屏结构检查：`/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-computer-use-wide-final.png`（1536×1024 px）；最终原生视口：`/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-computer-use-final-v2.png`（2068×1640 px，对应 1034×820 CSS px）；设置页：`/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-computer-use-settings.png`。
- 参考图、最终工作区与设置页已在同一次 `view_image` 比较输入中打开；宽屏结构图与参考图同为 1536×1024。原生验收严格使用用户已经打开的 Codex 内置浏览器，没有另启 Playwright CLI 或第二个 QA 浏览器。
- 状态并非静态假数据：隔离浏览器实际打开 `https://example.com`，最终画面来自 Host 最新 PNG；步骤列表来自同一 Session 的真实 `open`、`click_point` 与两次 Provider `snapshot`。

## Comparison history

- Earlier P1 finding: 第一版在 1034×820 CSS 视口把右侧工作区和对话硬排成两列，使对话正文被压成一条不可读的细列。Fix: 会话工作区父级增加 container query；宽内容区继续双栏，900px 以下的会话容器改为右侧覆盖层，底层对话保持原排版。
- Earlier P2 finding: 隔离／Chrome 分段按钮在鼠标点击后出现浏览器默认蓝色粗焦点圈，与黑白灰的 Harness 控件体系不一致。Fix: 取消非键盘默认 outline；键盘 `focus-visible` 保留 1px 中性内描边。
- Earlier P1 finding: 切换到未连接 Chrome 时会立刻发起 snapshot，并把旧隔离截图误留在新的来源状态下。Fix: 未配对时保持当前 Provider 并在面板内说明未连接；已连接时才原子切换来源并读取新页面，最终测试后恢复隔离模式。
- Earlier P2 finding: 工具行使用 `◎`、`⌘`、`↗` 文本符号模拟图标。Fix: 全部替换为项目已有 Browser、Settings 与 Inspect 矢量图标；步骤运行／失败也使用现成 Loading／Warning 图标。

## Required fidelity surfaces

- Major layout: 与选定图一致保持“会话＋浏览器”两块主工作区；宽屏默认浏览器宽度 760px，可拖动到 420–1000px，窄容器切换为右侧覆盖而非压坏正文。
- Header controls: 保留 `Computer Use` 标题、来源分段、真实连接状态、打开新页、展开和关闭；没有另造彩色 badge 或卡片墙。
- Browser chrome: 前进、后退、刷新和地址栏为独立可操作控件；实时页面截图填满主画布，并保留页面原始比例。
- Task control: 画布下方保留步骤数量、正在观察／运行／暂停状态，以及暂停／继续和接管／交还两条高优先级动作。
- Inspector: `步骤／页面元素／截图` 三个页签都可点击，步骤按最新优先展示真实时间、动作与状态；必要分隔线存在但不包围成多层卡片。
- Settings: 旧三张 Provider 卡片被收敛成「能力」与「浏览器来源」两组原生行；黑白小胶囊开关、隔离／Chrome 分段、连接管理与新标签偏好使用同一视觉体系。
- Copy differences: 参考图里的商家后台任务、商品名、6 步进度和 10:39 时间属于生成式示例；实现保留用户当前真实对话，使用 `example.com` 与真实 4 步证据。产品名、Computer Use 名称与既有 DeepSeek Harness 导航未改写。

## Runtime and interaction checks

- 地址栏真实打开 `https://example.com`；工作区回传 `Example Domain` 标题、PNG 路径与 DOM 摘要，步骤从 0 增为 1。
- 暂停后状态出现「已暂停」，继续后恢复；点击「接管」后对实时截图执行归一化坐标点击，步骤从 1 增为 2，随后可「交还智能体」。
- 已配对 Chrome 显示连接，真实切换到 Chrome 后完成 snapshot 并增加步骤；切回隔离后再次完成 snapshot，最终来源恢复隔离。
- 设置页真实显示桌面与浏览器能力已开启、Chrome 已连接；运行扩展为 Browser Bridge 1.1.0。工作区动作在 `browserEnabled=false` 时由 Host 返回 409，不是只改变前端文案。
- Computer Use Host／Client 定向测试 5/5；Host 与 Client TypeScript、Conversation／Computer Use bundle、双语配对记录通过。稳定重载后工作区仍从 Host 恢复 4 个真实步骤。

## Findings

No actionable P0, P1 or P2 issue remains in the selected Computer Use workspace, narrow-container fallback, or Settings surface.

final result: passed

---

# Design QA: 可热插拔的输入框添加菜单

## Evidence and normalization

- 用户问题图：`/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-27052c6f-13f4-4306-b76d-52d1ca7e892d.png` 与 `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-81774dc1-b4be-4599-aa76-54d27a3d4e85.png`，分别指出加号语义与首击后的长命令目录不匹配。
- 原生基线：`design-qa-add-menu-01-native.png`、`design-qa-add-menu-02-native-command.png`。
- 最终实现：`design-qa-add-menu-03-new-menu.png`、`design-qa-add-menu-04-command.png`、`design-qa-add-menu-05-file-attached.png`、`design-qa-add-menu-06-disabled-native.png`。
- 全部浏览器截图来自同一 `http://127.0.0.1:3080/` 会话、同一浅色主题与 settled 状态；真实文件选择使用最终菜单触发浏览器 file chooser，没有以脚本直接伪造附件状态。

## Comparison history

- Earlier P1 finding: 加号图形表达添加内容，但首击直接展开完整命令目录，用户无法从按钮预判结果。Fix: 启用插件时首击打开仅有两项的「添加内容」菜单，「添加文件」在上，「运行命令」在下。
- Earlier P1 finding: 新增文件入口若另造上传链路，会造成限制、预览、移除和提交状态分叉。Fix: 文件选择结果进入与粘贴、拖拽相同的 `intakeImages` 与原生草稿附件栏；当前只支持 Host 已支持的图片类型，并在菜单副文案中明确说明。
- Earlier P2 finding: 直接把命令替换成文件会损失高级能力。Fix: 「运行命令」继续打开原有完整命令目录，不复制目录、搜索或命令执行逻辑。
- Earlier P1 finding: 新交互必须可逆。Fix: `conversation.input.add` 提供原生命令 fallback；设置中关闭「添加菜单」后，当前页面立刻恢复原生加号命令按钮，再次开启即恢复双入口。

## Runtime and interaction checks

- 真实点击「添加」后只出现两个语义清楚的 menuitem；点击外部或 Escape 能关闭，菜单没有遮挡发送、权限或模型控件。
- 真实 file chooser 选择本地 PNG 后出现「待发送图片」栏，随后通过页面移除按钮清除，未留下验收附件。
- 「运行命令」打开原生完整命令目录；插件关闭后原生「命令」按钮仍能直接打开同一目录。
- Settings → 小庄的插件 → 添加菜单完成关闭／开启往返；最终 API 为 active，九项能力全部开启。
- ui-conversation 输入栏／骨架 98 项、添加菜单 3 项、插件中心 7 项定向测试通过；稳定页面重载后没有新增控制台错误。

## Findings

No actionable P0, P1 or P2 issue remains in the requested composer-plus flow.

final result: passed

---

# Design QA: 可热插拔的运行概览底栏

## Evidence and normalization

- User issue source: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-e72e9c8f-2d19-4fe3-aa30-2fb3d76d9e78.png`. It identifies the native bottom statistics strip as useful but visually and interactively improvable.
- Current native capture: `/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-runtime-pulse-current.png`.
- Rendered implementation: `/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-runtime-pulse-compact.png` and `/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-runtime-pulse-expanded.png`.
- All three browser captures use the same `http://127.0.0.1:3080/` task, 1034×820 CSS viewport, light theme and settled session data; they were inspected together as one comparison input.

## Comparison history

- Earlier P1 finding: the native strip flattens every metric into one long sentence, then truncates it at the exact point where the user needs the later Token values. Its delayed hover tooltip repeats the same sentence instead of explaining the data.
- Fix: the default line now keeps four high-frequency groups only: turns/steps, generation speed, cache hit and input-to-output Token flow. Values use compact alignment and short inset separators, so the full summary remains visible without increasing composer height.
- Earlier P2 finding: complete timing and Token facts had no deliberate second information layer; the only detail path was a hover tooltip inaccessible to keyboard and touch users.
- Fix: the entire summary is one semantic button. Click opens a restrained panel above the composer with four named groups and exact values; click again, click outside or Escape closes it. The panel uses existing Harness tokens, one header rule and only necessary group separators.
- Earlier P1 finding: a replacement must be reversible rather than overwriting the native component. Fix: the plugin shadows the existing `stats` cell at a lower priority and releases it on Cordis unload, so the untouched native line returns immediately.

## Runtime and interaction checks

- Settled session summary: `3 轮 · 7 步`, `87 tok/s`, `缓存 65%`, `134K → 1.2K`.
- Expanded details: model 26.6s, tools 1m06s, average first token 1.8s, output 87 tok/s, input 134K, output 1.2K, cache read 87.3K, cache write 0.
- Real Settings path: 小庄的插件 → 运行概览. Turning it off restores the exact native `LLM / 工具调用 / 首 token / 缓存命中 / 输入输出` row without refreshing; turning it on restores the new summary in the same task. Final state is enabled.
- The plugin reads only Harness' `sessionStats` and `tokenUsage` projections. There is no fetch, timer, local storage, host collector or duplicate ledger.
- Runtime Pulse and Xiaozhuang plugin-center contract tests pass 10/10; the client bundle passes syntax validation.

## Findings

No actionable P0, P1 or P2 issue remains in the requested bottom statistics flow.

final result: passed

---

# Design QA: Teamwork 与模型用量品牌圆角统一

## Evidence and normalization

- Teamwork issue source: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-174aabf6-c357-4519-a556-c5f648f8ff92.png` (290×382 px).
- Model-usage issue source: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-2eab8f7e-9c91-4371-bbbb-abab9556fdb3.png` (1190×648 px).
- Rendered implementation: `/Users/zhuanghongkai/Desktop/迭代DSH/teamwork-logo-radius-after.png` and `/Users/zhuanghongkai/Desktop/迭代DSH/quota-logo-radius-after.png`, both captured from `http://127.0.0.1:3080/` at a 1034×820 CSS viewport in the same light theme.
- Same-input comparisons: `/Users/zhuanghongkai/Desktop/迭代DSH/teamwork-logo-radius-comparison.png` and `/Users/zhuanghongkai/Desktop/迭代DSH/quota-logo-radius-comparison.png`. Each source crop and corresponding final crop is placed side by side without stretching.

## Comparison history

- Earlier P2 finding: Teamwork gave Codex and Z Code nominally similar image boxes, but their source artwork still owned the visible corner shape. Codex retained a softer, larger-radius white tile while Z Code retained a tighter black tile.
- Fix: both collaborators now use one 36×36px clipping slot with an 8px radius, hidden overflow and identical inset outline. The slot owns the final silhouette; white/black backgrounds only preserve the brands, and Codex keeps its existing optical crop inside that shared slot.
- Earlier P2 finding: the model-usage panel applied the same CSS radius to the image elements, yet DeepSeek/GPT were transparent marks while KIMI/GLM carried opaque square artwork, so the visible results still looked like four unrelated geometries.
- Fix: all four providers now use one 34×34px clipping slot with an 8px radius and identical inset outline. KIMI/GLM fill the shared dark slot; DeepSeek/GPT stay centered at 28×28px in the shared light slot. No brand asset was replaced or distorted.

## Runtime and interaction checks

- Teamwork computed geometry: Codex and Z Code are both 36×36px, `border-radius: 8px`, `overflow: hidden`, identical inset outline; only the brand-preserving background differs.
- Model-usage computed geometry: DeepSeek, KIMI, GLM and GPT are all 34×34px, `border-radius: 8px`, `overflow: hidden`, identical inset outline. Transparent marks render at 28×28px; opaque app tiles fill the slot.
- Real path exercised: Settings → Teamwork → both collaborators visible; close Settings → open an existing task → 模型用量 → all four providers visible and all live provider states `ok`.
- Teamwork contract and lifecycle tests pass 15/15. Provider-quota client/data tests pass 5/5 and its client bundle completes successfully.
- Browser logs contain no application error. The four warnings are expected connection retries from the controlled DSH process restart before the final interactions.

## Findings

No actionable P0, P1 or P2 difference remains in the requested brand-logo geometry.

final result: passed

---

# Design QA: Token 总览 24 小时完整视图

## Evidence and normalization

- User source crops: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-8a8343a7-9b7d-4a9d-9040-f46287ecd676.png` and `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-72ef7072-262b-4f2b-86dd-b0b70024b3fb.png`. They identify the old terminal icon, low-emphasis transparent filters and incomplete short trend as problems rather than prescribing a replacement layout.
- Full before capture: `/Users/zhuanghongkai/Desktop/迭代DSH/token-overview-before.png` (1280×720 CSS px).
- Rendered implementation: `/Users/zhuanghongkai/Desktop/迭代DSH/token-overview-after.png` (1280×720 CSS px), captured from `http://127.0.0.1:3080/`, Settings → `Token 总览`, in the same light theme and viewport.
- Same-input comparison board: `/Users/zhuanghongkai/Desktop/迭代DSH/token-overview-comparison.png` (2592×720 px). The before and implementation screenshots are placed side by side without stretching.
- Generated icon source: `/Users/zhuanghongkai/.codex/generated_images/01a02a16-f998-7763-b426-b1b027e8309f/exec-6d533a48-82e1-4530-9dac-684032f211e8.png`; selected crop/downscale: `~/.dsh/profiles/web/packages/token-overview/assets/token-overview-icon.png` (128×128 alpha PNG).

## Comparison history

- Earlier P2 finding: the terminal-in-a-square mark described command execution rather than whole-machine Token aggregation and was visually generic. Fix: ImageGen produced a monochrome two-token-to-one-meter symbol specifically for the 18–28px product slot; the same real PNG is used in settings navigation and the page heading.
- Earlier P1 finding: `今日` showed one daily bar, so the user could not see when consumption happened. Fix: the Host now collects real local hourly records, fills all 24 Beijing-time hours and groups them into exactly eight three-hour buckets. Empty and future intervals retain a light-gray track; used intervals add a blue fill.
- Earlier P2 finding: four transparent text filters did not communicate a selected state. Fix: the four choices now share a subdued segmented track and the selected range is a high-contrast black capsule with `aria-pressed` state.
- Earlier P2 finding: KPIs, token composition, rankings and source details sat on unrelated rules, while client/model lists were truncated and `完整报告` was unexplained. Fix: the core summary is one borderless soft plane, all clients and models remain available by scrolling, data coverage and statistical semantics are explicit, and the final route is renamed `详细数据` with a one-sentence description.
- Post-capture correction: the final CSS raises all zero-value bar tracks from transparent to a stable 7% neutral gray and uses container queries at 520px/380px; this narrow-layout/empty-track contract is covered by the final client test.

## Required fidelity surfaces

- Typography and hierarchy: existing Settings font, label tokens and compact title scale are retained. The visual order is heading → range → core metrics → trend → complete rankings → coverage → detailed data.
- Spacing and surfaces: the page keeps the existing 760px content maximum and native settings scroll. The summary uses no border or shadow; section separation comes from spacing and a small number of semantic inset rules.
- Controls: `今日／近 7 天／本月／全部` are actual buttons with hover, active and keyboard semantics. The compact control stays four columns in narrow containers instead of wrapping into ambiguous loose text.
- Data density: today's trend is always eight columns; seven-day is seven daily columns; month remains scrollable; all-time aggregates to months. Ranked rows are no longer sliced to six items.
- Responsive behavior: component-width container queries collapse KPI, token composition, ranking statistics, coverage and the final action without relying on the outer app viewport.

## Runtime and interaction checks

- Live API state at 18:36: `ready`, no last error, eight today buckets, seven week buckets, 23 month buckets, three today clients and 47 all-time model/client rows.
- The hourly artifact is generated in the active atomic snapshot slot. Collector cadence remains every ten minutes; an in-progress or failed scan cannot replace the readable snapshot.
- The settings shell renders the generated icon in navigation; the plugin serves the identical PNG with `image/png` and its bytes match the packaged asset.
- Token Overview syntax and contract/Host tests pass 7/7. Settings shell tests pass 17/17 and its client bundle completes successfully.
- Final application logs contain only the expected connection-retry warnings from the controlled service reload; no Token Overview rendering or data error was reported.

## Findings

No actionable P0, P1 or P2 difference remains in the requested Token Overview surface.

final result: passed

---

# Design QA: plugin inventory and Teamwork settings separation

## Evidence and normalization

- Source visual truth: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-68965996-0d46-471d-a6ea-9b5689a4a5fa.png` (1212×382 px), `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-6857662d-ae6c-40a3-b8ad-096d0d5e078e.png` (1212×140 px), and `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-5bc6197b-4bd5-4ba7-a7ac-0d2406bb927c.png` (1212×140 px). These are user-supplied issue crops, not a prescriptive new layout.
- Rendered implementation: `/Users/zhuanghongkai/Desktop/迭代DSH/dsh-settings-final-plugins.png` (564×754 px) and `/Users/zhuanghongkai/Desktop/迭代DSH/dsh-settings-final-teamwork.png` (564×495 px), captured from `http://127.0.0.1:3080/` at a 1440×1000 CSS viewport in the same light theme.
- Full and focused comparison input: `/Users/zhuanghongkai/Desktop/迭代DSH/dsh-settings-comparison.png` (2880×2640 px). The three source crops and two final settings surfaces were fitted into stable comparison columns without stretching. AppKit encoded the board at 2× backing density; the source and implementation images themselves retain their original aspect ratios.
- State: all seven capability plugins and both Teamwork collaborators enabled; Codex `GPT-5.6-Sol · LOW`; Z Code `GLM-5.3 · MAX`; no picker menu left open.

## Comparison history

- Earlier P1 finding: Codex and Z Code were counted and configured beside installable plugins, so the page mixed “what capabilities exist” with “who Teamwork can call”. Fix: the plugin page now contains seven actual capability switches; a dedicated top-level `Teamwork` settings section owns the two collaborators, their availability, model and reasoning.
- Earlier P2 finding: the blue hero had a one-pixel gray rim. Fix: both settings heroes retain the current blue gradient and radius but compute to `border-width: 0px`.
- Earlier P2 finding: each subsection rendered a heading rule and a list top border, producing two adjacent horizontal lines. Fix: the plugin page no longer needs a redundant subsection heading; the Teamwork page uses one heading rule, no list outer borders, and only one inset divider between collaborator rows.
- Post-fix visual evidence: the combined board shows the gray hero outline removed, the duplicated rules removed, the seven capability rows kept on one clean plane, and the collaborator controls moved into the Teamwork-owned surface.

## Required fidelity surfaces

- Fonts and typography: existing Settings font family, title scale, row title weight, metadata scale, line height and truncation conventions are retained. The new `协作者` heading uses the same small hierarchy as other settings sections.
- Spacing and layout rhythm: both pages keep the existing 640px content maximum and 564px rendered inner width. Row dividers are inset from the 48px content column; the Teamwork list has no top or bottom border, and the hero has no visual rim.
- Colors and visual tokens: the accepted blue gradient, primary/secondary/tertiary text tokens and black-white capsule switches are reused. No new palette was introduced.
- Image quality and asset fidelity: Teamwork reuses the existing official Codex PNG endpoint and Z.ai SVG. Both use the established 36×36 slot, shared mask/radius and prior optical-size correction; no placeholder or CSS-drawn logo was added.
- Copy and content: `外部智能体` is removed from the visible settings information architecture. `小庄的插件` describes hot-pluggable capabilities; `Teamwork` describes callable `协作者`, concurrency, model and reasoning.

## Runtime and interaction checks

- Page identity: `利用API密钥查询账户余额 — DeepSeek Harness` at `http://127.0.0.1:3080/`; Settings rendered meaningful content with no framework overlay.
- DOM geometry: plugin hero border `0px`, list top/bottom borders `0px`, group headings `0`, rows `7`, Codex/Z Code occurrences `0`. Teamwork hero border `0px`, list top/bottom borders `0px`, section headings `1`, collaborator rows `2`.
- Real configuration proof: changed Codex reasoning from `LOW` to `MEDIUM`, verified the persisted status API returned `medium`, then restored `LOW` through the same UI.
- Real hot-plug proof: turned Z Code off, observed the switch become unchecked and controls disable, then turned it back on. Final API state reports all nine Loader entries enabled and `active`.
- Automated checks: Xiaozhuang contract/Host tests 7/7, Teamwork client/Host/projection tests 15/15, Settings shell tests 17/17; Settings bundle completed successfully.
- Console errors and warnings: zero after the final restored state.

## Findings

No actionable P0, P1 or P2 difference remains in the requested surfaces.

final result: passed

---

# Previous Design QA: Codex and Z Code optical-size parity

## Evidence and normalization

- Source visual truth: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-828c83fd-267f-41db-9f7c-beeca9ed6cb7.png` (290×382 px). It records the user-visible mismatch, not a target layout redesign.
- Final browser capture: `/var/tmp/dsh-agent-logo-size-after-close.png` (300×190 px), captured from `http://127.0.0.1:3080/` at a 1280×720 CSS viewport in the same light theme and Settings → `小庄的插件` → external-agent state.
- Full comparison input: `/var/tmp/dsh-agent-logo-comparison.png` (620×429 px).
- Focused comparison input: `/var/tmp/dsh-agent-logo-comparison-focus.png` (400×240 px). Each source/final icon crop was proportionally fitted into the same 88×88 inspection cell because the user screenshot and Browser capture use different crop scale and density.

## Comparison history

- Earlier P2 finding: the prior implementation used a 44×44 overflowing Codex image and a 28×28 inset Z Code image. Their shared 36×36 layout slot concealed a real 16px image-box difference, which is visible in the supplied screenshot.
- Fix: both brands now use the same 36×36 clipped slot, 2px inset, 32×32 visible brand canvas and 8px radius. The Codex PNG alone is enlarged to 39.4px and translated -3.7px inside that slot to remove its source transparency without changing the slot.
- Post-fix evidence: both slots measure 36×36 with the same padding, overflow mask and radius. Pixel analysis of the focused final capture finds 142 colored Codex subject pixels and 143 dark Z Code subject pixels, so optical area is effectively equal rather than merely sharing a CSS box.

## Required fidelity surfaces

- Fonts and typography: unchanged; brand names, descriptions, metadata and picker weights/line heights match the existing settings system.
- Spacing and layout rhythm: unchanged except for the intended logo normalization. Both logos start at the same two-pixel inset relative to their own row and retain the same 48px text-column offset.
- Colors and tokens: unchanged; the official Codex PNG and Z.ai SVG keep their original colors, and no new background token was introduced.
- Image quality and asset fidelity: both original brand assets remain in use. The raster Codex asset is clipped inside its shared slot rather than resampled into a new low-resolution file; Z Code remains vector.
- Copy and content: unchanged.

## Runtime and interaction checks

- Page identity: `中文长文Markdown演示生成 — DeepSeek Harness` at `http://127.0.0.1:3080/`.
- The settings surface rendered meaningful content with no Vite, Webpack or Next overlay.
- Console errors and warnings: zero in the final browser tab.
- Interaction proof: Settings → `小庄的插件` → scroll to external agents; the Codex model menu opened and Escape closed it normally after the icon change.
- Xiaozhuang contract tests passed 8/8; all nine plugins ended enabled and `active`.

## Findings

The earlier optical-size mismatch is fixed. No actionable P0, P1 or P2 difference remains in the requested surface.

final result: passed

---

# Previous Design QA: Native Fluent Output

## Evidence

- Plugin center with the ninth native plugin: `/var/tmp/dsh-fluent-output-settings.png`.
- Completed long Markdown response: `/var/tmp/dsh-fluent-output-final.png`.
- Real Bash tool row with its output expanded: `/var/tmp/dsh-fluent-output-tool-row.png`.
- Fresh post-build browser surface: `/var/tmp/dsh-fluent-output-final-fresh.png`.
- Live surface: `http://127.0.0.1:3080/`, Settings → `小庄的插件` → `流畅输出`.

## Result

The upstream smooth-stream algorithm is now a native DeepSeek Harness package named `流畅输出`, not a wrapper around a separately installed npm plugin. It keeps the useful adaptive reveal, bounded backlog, FPS guard, follow behavior and reduced-motion path, while removing the upstream settings card, updater and duplicate on/off state. `小庄的插件` is the single hot-plug lifecycle and the package records its reviewed upstream commit and MIT attribution.

The renderer covers assistant Markdown and agent-owned tool/workflow rows. Thinking remains manually controlled instead of being forced open. The default balanced preset reveals progressively without changing session logs, model requests, the underlying Markdown result or tool output.

## Interaction and runtime checks

- The real settings page listed nine native plugins and exposed `流畅输出` with a working Apple-style hot-plug switch.
- Turning it off changed the Loader unit to `disabled`; turning it on remounted the unit and restored the renderer without restarting the app.
- During a real long response, visible output length increased monotonically in 250 ms samples. The final response preserved one heading, one list, one JavaScript code block, one Markdown table and the requested `FLUENT_OUTPUT_OK` terminator.
- A real Bash tool call rendered as an agent row, expanded to show `FLUENT_TOOL_OK`, and completed with `TOOL_ROW_OK`.
- Native contract tests passed 4/4; Xiaozhuang contract tests passed 8/8; typecheck and the Host/Client build passed. All nine plugins ended enabled and `active`.
- A fresh browser tab had the plugin style mounted exactly once, no framework overlay, and zero console errors or warnings.

## Findings

No actionable P0, P1 or P2 issue remains in the requested path. Native wheel/touch interruption could not be truthfully automated through the current Browser control surface; its retained upstream implementation and contract were reviewed, but it is not claimed as a fresh real-gesture pass.

final result: passed

---

# Previous Design QA: Settings-only Token Overview

## Evidence

- Compact settings view after the second automatic snapshot: `/var/tmp/dsh-token-overview-final.png`.
- Seven-day range: `/var/tmp/dsh-token-overview-week.png`.
- Canonical full report: `/var/tmp/dsh-token-overview-full-report.png`.
- Live surface: `http://127.0.0.1:3080/`, Settings → `Token 总览` and Settings → `小庄的插件`.

## Result

The feature is named `Token 总览` and exists only in Settings. Its compact surface answers the recurring decision questions—today, last seven days, month, all time; processed and non-cache Token; model calls; API-equivalent cost; cache and reasoning; daily trend; leading clients and models—without adding another home or conversation-header entry. The detailed path serves the canonical Tokscale report generated by the supplied Skill instead of reconstructing a second dashboard.

The Host invokes the Skill every ten minutes on a fixed start cadence. It writes the inactive A/B directory, validates all required artifacts, then atomically swaps the active marker. A slow or failed scan leaves the prior snapshot readable; hot-unplug stops the collector and removes its API and settings module.

## Interaction and runtime checks

- Today and seven-day ranges changed all four KPIs and the ranked rows on the real settings page.
- `完整报告` initially exposed a desktop-WebView popup-policy issue; the final same-page link opened `/plugins/token-overview/report/` and rendered the canonical `Local Usage Audit` dashboard.
- The compact source line disclosed Codex, Z Code, OpenCode, DeepSeek Harness, Claude Code and WorkBuddy. Cost is explicitly labelled as an estimate, not a bill; two restored days are disclosed as estimates.
- Turning Token Overview off removed the settings navigation and returned HTTP 404 from its API. Turning it back on restored the navigation, API and prior snapshot without restarting the process.
- The first snapshot was generated at 17:21. The background schedule started again at 17:31 and committed the second snapshot at 17:32, changed the active slot from A to B, and scheduled the next start for 17:41. The live settings page displayed both new timestamps.
- Token Overview and Xiaozhuang tests passed 14/14; syntax and report GET checks passed. All eight plugins ended enabled and `active`. Browser logs contained no application error; warnings were only the expected connection retries from controlled service restarts.

## Findings

The popup link was the only actionable issue found during the real user-path pass and was fixed before handoff. No actionable P0, P1 or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: Codex logo visual weight and Teamwork history recovery

## Evidence

- User baseline: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-b6c6a971-68e8-491a-a41d-caba6a06de77.png`.
- First mechanical fill pass: `/var/tmp/dsh-codex-logo-after.png`.
- Final visible-weight result: `/var/tmp/dsh-codex-logo-final.png`.
- Live surface: `http://127.0.0.1:3080/`, task `插件桥接验收调用`, Settings → `小庄的插件`.

## Result

Codex and Z Code still occupy identical 36×36 layout slots, so the title and control columns do not move. Codex alone compensates for the transparent/product-tile breathing room inside its PNG: its image box is 44×44 with no generic four-pixel inset, while Z Code remains 28×28. The final screenshot shows the visible blue cloud and black Z square at comparable weight rather than forcing their unequal source canvases into the same mechanical dimensions.

The same real-page pass exposed a separate core regression from the preceding Teamwork change: sessions persisted `teamwork/state`, but the persistence vocabulary did not recognize that event after a process restart. `teamwork/state` is now a declared log-only `SessionEventMap` member and appears in the generated runtime vocabulary and persistence catalog, so the plugin may be disabled or mounted after restore without making the task history unreadable.

## Interaction and runtime checks

- Live geometry: Codex image 44×44, Z Code image 28×28; both retain a 36×36 slot and the shared title column starts at x=514.
- Codex model picker opened with seven options and closed normally; the enlarged image did not change the row height, toggle, model, or reasoning controls.
- The previously broken `插件桥接验收调用` task loaded its complete historical stream after restart, with no `历史加载失败` or unknown `teamwork/state` error.
- All seven Xiaozhuang plugins remained enabled and `active`.
- Xiaozhuang contract tests passed 4/4; persistence-catalog generator tests passed 25/25; syntax, catalog freshness, runtime vocabulary assertion, and `git diff --check` passed.

## Findings

The initial 36×36 pass fixed the CSS box but did not fully fix perceived size because the source PNG itself contains visual padding. The final implementation uses brand-specific optical compensation while preserving the shared layout grid. No actionable P0, P1 or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: additive Teamwork over native permissions

## Evidence

- User baseline: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-78560657-dd2d-4908-b598-1993544cb990.png`.
- Full Access plus Teamwork: `/var/tmp/dsh-teamwork-additive-full.png`.
- Dual-check menu: `/var/tmp/dsh-teamwork-additive-menu.png`.
- Read Only plus Teamwork: `/var/tmp/dsh-teamwork-additive-readonly.png`.
- Live surface: `http://127.0.0.1:3080/`.

## Result

The first three rows remain one permission group. Teamwork is separated below them and uses its own checked state. The trigger composes both dimensions, so it reads `完全权限 + Teamwork` or `仅可查看 + Teamwork`; choosing another permission no longer turns Teamwork off and toggling Teamwork never submits `/permission`.

Host state now matches the presentation: `/teamwork on|off` appends `teamwork/state`, while the native permission service remains the sole writer of sandbox and approval. Legacy `permission/preset=team-work` sessions are migrated to an explicit Teamwork state without rewriting their existing permission knobs.

## Interaction and runtime checks

- Full Access and Teamwork rendered two simultaneous trailing checks.
- Changing Full Access to Read Only kept Teamwork selected and changed the trigger to `仅可查看 + Teamwork`.
- Turning Teamwork off restored the plain `完全权限` trigger; no Teamwork permission preset was written.
- Disabling the Teamwork plugin removed the row immediately even though the browser still held the prior projection value. Re-enabling the plugin republished the projection and restored the row without a page-level fake toggle.
- Final state: Full Access, Teamwork off, all seven Xiaozhuang plugins enabled and `active`.
- Teamwork 12 tests, Xiaozhuang 8 tests and InputBar 80 tests passed; the ui-conversation bundle completed successfully.
- No framework overlay or current-page rendering failure remained. Console entries collected during QA were the expected transient connection/service errors from two controlled DSH restarts and the deliberate Teamwork hot-unplug window.

## Findings

The first implementation exposed a stale-projection hot-unplug bug: disabling Teamwork removed the Host unit but left the menu row visible. The final implementation uses a client-lifetime capability marker plus a one-time projection reassertion, so both unplug and replug are now observable immediately.

final result: passed

---

# Previous Design QA: external-agent logo alignment and Codex product icon

## Evidence

- User alignment baseline: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-3cbf0426-34a9-4c7a-846c-1629e6e6c326.png`.
- User Codex icon reference: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-11d19682-4448-4c21-8257-3ba523d5232b.png`.
- Source asset: `/Applications/ChatGPT.app/Contents/Resources/icon-codex-light.png` (1024×1024 official product resource).
- Rendered implementation: `/var/tmp/dsh-external-agent-logos-aligned.png` at `http://127.0.0.1:3080/`.

## Result

Codex and Z Code logos no longer inherit the vertical center of rows made tall by the model and reasoning controls. Each 36×36 logo slot now starts at the same y-coordinate as its 18px name line. Codex uses a 128×128 derivative of the installed application's blue-purple terminal icon, served by the plugin itself instead of depending on a generic OpenAI mark or a third-party CDN.

## Required fidelity surfaces

- Alignment: live geometry reports `iconTop - nameTop = 0px` for both Codex and Z Code.
- Image quality: Codex loads as a complete 128×128 PNG and renders inside the existing 28×28 image area; Z Code remains the complete 150×150 Z.ai SVG.
- Layout: row height, descriptions, metadata, selectors, inset divider and switches are unchanged.
- Copy and behavior: no visible text, selected model, reasoning strength or plugin state changed.

## Interaction and runtime checks

- Codex model picker still opened and exposed all seven configured model choices.
- The plugin asset endpoint returned HTTP 200, `Content-Type: image/png`, immutable caching and the expected 128×128 alpha PNG.
- Client and Host syntax checks plus all eight plugin-center tests passed.
- All seven plugins remained active. Browser logs contain no application error; the only warnings are expected reconnect attempts from the controlled DSH restart.

## Findings

No actionable P0, P1 or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: in-conversation mode switching copy

## Evidence

- User baseline: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-1e1efdd4-aae5-4d26-b7e3-3681cc49034d.png` (the plugin was labelled `会话模式`).
- Final implementation: `/var/tmp/dsh-dialog-mode-switch.png` (live Xiaozhuang settings at `http://127.0.0.1:3080/`).

## Result

The row is now named `对话内模式切换`. Its supporting copy says that no new conversation is required and lists the modes users can switch between. The metadata states `从下一轮生效 · 当前任务不中断`, matching the actual runtime boundary instead of implying that an already-generating turn is rewritten.

`一键切换` was not used as the title because it describes the gesture but not the object or the product capability. `对话内模式切换` remains understandable even when read outside the immediate control context and distinguishes this plugin from the default-mode setting for newly created conversations.

## Interaction and runtime checks

- Initial state: all seven plugins active and the current conversation header contained one `创造模式` trigger.
- Turning off `对话内模式切换` changed its accessible switch state to disabled and removed the header trigger without refreshing the page (`1 → 0`).
- Turning it back on restored both the enabled state and the same header trigger (`0 → 1`).
- Client syntax and all eight plugin-center tests passed.
- Browser logs contain no application error; the only warnings are the expected reconnect attempts from the controlled DSH restart.

## Findings

No actionable P0, P1 or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: external-agent brand logo reuse

## Evidence

- User-reported baseline: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-9d5a6767-bd43-467c-b25c-4ec6c2f1cc80.png` (624×410 pixels; generic `#` and Agent marks).
- Brand source truth: `/var/tmp/dsh-brand-source-quota.png` (858×820 pixels; live model-usage GPT and GLM cards).
- Rendered implementation: `/var/tmp/dsh-external-brand-logos-after.png` (858×820 pixels; live Xiaozhuang settings).
- Same-input comparison: `/var/tmp/dsh-brand-logo-comparison.png` (3432×1640 pixels). The two 858×820 captures are placed side by side on a macOS 2× comparison canvas without changing their internal proportions.
- Surface: `http://127.0.0.1:3080/`, light theme, desktop viewport 858×820 CSS pixels, source and implementation captures at 1 screenshot pixel per CSS pixel.

## State and comparison

The source and implementation necessarily show different product panels: model usage is the source of the reusable brand assets, while Xiaozhuang settings is the consuming surface. The comparison therefore judges the focused 28×28 logo artwork, not the unrelated panel composition. The source GPT knot and GLM Z artwork are visually identical in the implementation. Both images loaded completely; GPT reports a 16×16 intrinsic SVG and GLM a 150×150 intrinsic SVG, each rendered at 28×28 without distortion.

## Required fidelity surfaces

- Fonts and typography: untouched; Codex/Z Code titles, descriptions, metadata and selector hierarchy retain the approved styles.
- Spacing and layout rhythm: the existing 36×36 icon slot is preserved; four-pixel inset yields a 28×28 brand image and no row-height or separator change.
- Colors and visual tokens: official artwork is used unchanged on the existing layer-one logo surface; no approximate color or custom drawing was introduced.
- Image quality and asset fidelity: the implementation uses the exact same OpenAI and Z.ai SVG URLs as model usage, with `object-fit: contain` and 6px inner radius. No text glyph, inline SVG, CSS art or generated substitute remains.
- Copy and content: unchanged.

## Interaction and runtime checks

- Codex model menu still opened with GPT-5.6-Sol selected and closed with Escape after the icon replacement.
- All seven plugins remained active; Codex stayed `gpt-5.6-sol / low` and Z Code stayed `builtin:zai / GLM-5.3 / max`.
- Client syntax and all eight plugin-center tests passed.
- Browser logs contain no application error; warnings are the expected reconnect attempts from the controlled DSH restart.

## Comparison history and findings

First pass found no actionable P0, P1 or P2 difference in the requested logo reuse. A separate focused crop was unnecessary because both 28×28 source and implementation marks remain clearly readable in the combined 2× comparison image. Full-view layout differences are intentional because the source and destination are different panels.

final result: passed

---

# Previous Design QA: compact plugin switches

## Evidence

- Final compact state: `/var/tmp/dsh-plugin-switch-compact.png`.
- Surface: `http://127.0.0.1:3080/`, real settings dialog, light theme, desktop viewport.

## Result

The seven black-and-white hot-plug switches are reduced from 42×24 to 36×20 pixels. Their circular thumbs are reduced from 20×20 to 16×16 pixels and the enabled translation is recalculated to keep a two-pixel inset on both sides. Color, state direction, focus treatment and animation are unchanged.

## Verification

- The compact switches render at the right edge without clipping, overlap or row-height changes.
- Vision completed enabled → disabled → enabled; the accessible name and actual plugin phase changed together.
- All seven plugins were active again at handoff.
- Client syntax and all eight plugin-center tests passed.
- Browser logs contain only the expected connection-retry warnings from the controlled DSH restart, with no application error.

## Findings

No actionable P0, P1 or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: modern external-agent pickers

## Evidence

- Native-select baseline: `/var/tmp/dsh-external-dropdown-before.png`.
- Final closed state: `/var/tmp/dsh-external-dropdown-after.png`.
- Final open state: `/var/tmp/dsh-external-dropdown-open.png`.
- Surface: `http://127.0.0.1:3080/`, real settings dialog, light theme, desktop viewport.

## Result

The Codex and Z Code model/effort controls no longer use the browser's bordered native selects. Each control is now a compact neutral-layer trigger with a small category label, a stronger current value and a restrained chevron. The open menu uses the product's elevated menu surface, inset padding, rounded cells, a lightweight shadow and one trailing check for the selected value. It opens only on click and closes after selection, outside click or Escape.

## Verification

- DOM semantics: trigger exposes `aria-haspopup=menu` and live `aria-expanded`; choices use `menuitemradio` with the current item checked.
- Real interaction: Codex model menu opened with all seven model options; outside click closed it.
- Real persistence: Codex effort completed `LOW → MEDIUM → LOW`; the visible control and status API agreed after both writes.
- Final runtime: all seven plugins active; Codex `gpt-5.6-sol / low`; Z Code `builtin:zai / GLM-5.3 / max`.
- Regression: client syntax and all eight plugin-center tests passed. A fresh 3080 page opened the settings and rendered both pickers without the earlier missing-component crash.

## Findings

No actionable P0, P1 or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: unambiguous black-and-white plugin switches

## Evidence

- Previous text capsules: `/var/tmp/dsh-plugin-switch-before-v2.png`.
- Final enabled state: `/var/tmp/dsh-plugin-switch-after-v2.png`.
- Verified disabled state: `/var/tmp/dsh-plugin-switch-off-v2.png`.
- Surface: `http://127.0.0.1:3080/`, real settings dialog, light theme, 740 × 820 desktop viewport.

## Same-state comparison

The previous control rendered the word `开启` inside a filled black capsule. That presentation could be read as either current state or the action that would happen after clicking. The final enabled state removes visible copy from the control, keeps the same right-side alignment, and uses the familiar two-part switch grammar: black track plus white thumb on the right. No row spacing, hierarchy, icon, description, divider, model selector, or settings-dialog chrome changed.

## Interaction-state comparison

The verified disabled state uses a pale gray track and moves the white thumb to the left. The enabled-count summary changes from seven to six at the same time. Returning the same control to enabled restores the thumb to the right and the summary to seven. The visible position communicates state; the accessibility label communicates both state and next action as `已开启，点击关闭` or `已关闭，点击开启`.

## Required checks

- Page identity: `http://127.0.0.1:3080/`, title ends in `DeepSeek Harness`.
- Meaningful content: settings dialog, seven plugin rows and external-agent model controls all rendered.
- Framework overlay: none.
- Console health: no application error; only expected reconnect warnings during the explicit DSH restart.
- Interaction proof: `视觉插件` completed enabled → disabled → enabled; `aria-checked`, accessible name, visual thumb position and overview count all changed together.
- Tests: plugin center 8 passed; client syntax and `git diff --check` passed.

## Findings

No actionable P0, P1 or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: external-agent controls and Teamwork projection

## Evidence

- External-agent settings: `/var/tmp/dsh-external-agents-after.png`.
- Teamwork runtime result: `/var/tmp/dsh-teamwork-external-after.png`.
- Surface: `http://127.0.0.1:3080/`, real historical session, Teamwork permission, light theme.

## Step review

1. **Choose the worker capability — verified.** Codex and Z Code each use one compact row in `小庄的插件`; model and thinking controls stay inline rather than creating a second page or nested card. The final values are Codex `GPT-5.6-Sol / LOW` and Z Code `GLM-5.3 / MAX`, populated from each installed product's current catalog.
2. **See delegated work — verified.** Both direct user requests and automatic Teamwork dispatch use the same external-agent lifecycle projection. The member row shows product, selected model, thinking strength and elapsed time while preserving the existing stage, overview and member hierarchy.
3. **Recover from failure honestly — corrected.** Tool results with `isError` no longer appear as completed work. The panel now groups failed calls separately, uses a restrained red state capsule, and summarizes `completed / failed` in the header while the latest repaired Z Code run remains visibly completed.
4. **Dismiss without another control — verified.** Running work opens Teamwork once; clicking outside or pressing Escape closes it, while clicking the header trigger continues to provide an explicit toggle. No close or refresh button was reintroduced.

## Interaction and runtime checks

- Real Z Code bridge: app-server session created with `GLM-5.3 / max`; one in-product request returned `ZCODE_CONFIG_OK` in 9 seconds and left no app-server process running.
- Teamwork: live run appeared automatically; final member metadata showed `Z Code · GLM-5.3 · MAX · 3秒`. Two historical bridge failures were rendered under `失败`, not `已完成`.
- Mode menu: the same historical session completed `创造模式 → 标准模式 → 创造模式`; the header button changed after each selection.
- Copy: the plugin center contains no `本机` or `本地` product labels; the section remains `小庄的插件`.
- Browser logs: only expected reconnect warnings caused by explicit launchd restarts; no application error after the final reload.
- Tests: Teamwork 8 passed, plugin center 8 passed, Z Code 1 passed, Codex／preset／ApiProxy targeted suite 445 passed, Codex TypeScript passed, translation pairing and `git diff --check` passed.

## Findings

No actionable P0, P1 or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: Xiaozhuang plugin hot-plug switches

## Evidence

- User source: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-8390eb64-697b-4b49-8ae2-ca5fa5cbfdf2.png`.
- Same-page baseline: `/var/tmp/dsh-plugin-switches-before-settings.png`.
- Same-viewport enabled implementation: `/var/tmp/dsh-plugin-switches-after-initial.png`.
- Final live state after runtime verification: `/var/tmp/dsh-plugin-switches-after.png`.
- Disabled implementation state: `/var/tmp/dsh-plugin-switches-off-state.png`.
- Same-viewport comparison: `/var/tmp/dsh-plugin-switches-comparison.png`.
- Surface: `http://127.0.0.1:3080/`, real local profile and historical session, light theme. Baseline/comparison images are 1065 × 808 pixels; the final in-app-browser state is 740 × 820 pixels after the user resized the desktop browser.

## Step review

1. **Understand state — corrected.** The source showed a repeated green dot plus `已启用`, which described status but offered no action. Every row now ends in the same compact text capsule. The filled `开启` state is visually primary; the outlined `关闭` state is visibly inactive without adding another status dot or nested control.
2. **Operate one plugin — verified.** Every capsule is a semantic `role=switch` with live `aria-checked`; clicking enters a disabled `关闭中／开启中` state, waits for the Host Loader result, then renders the actual settled state. The overview count changes between six and seven enabled plugins from the same snapshot.
3. **Keep the approved hierarchy — preserved.** The overview card, category headings, shared product icons, three-line row hierarchy and inset one-pixel separators remain unchanged. Only the low-information green status label was replaced, so the requested hot-plug control does not introduce another page, card, modal or configuration concept.
4. **Make the product actually pluggable — verified.** The browser graph now follows Host graph additions/removals. In the same page, disabling model usage removed its page-header action and enabling restored it (`1 → 0 → 1`); Teamwork did the same and also cleared its active planning projection. No browser or DSH restart occurred during either pair of operations.

## Interaction and runtime checks

- Model usage: capsule `开启 → 关闭 → 开启`; header action count `1 → 0 → 1`; no alert remained.
- Teamwork: capsule `开启 → 关闭 → 开启`; team-panel action count `1 → 0 → 1`; planning indicator count became `0` while disabled.
- Compound plugin: Codex toggled both provider and tool rows and returned to active.
- Persistence: model usage was disabled, DSH restarted, Loader still reported `phase=disabled`; enabling it afterward restored `phase=active`. All seven plugins are enabled in the final state.
- Process boundary: DSH PID stayed unchanged through live toggle operations; only the explicit persistence test changed the PID.
- Tests: local plugin center 6 passed; Teamwork 7 passed; client modules/HMR 36 passed; targeted bundles and `git diff --check` passed.

## Findings

No actionable P0, P1 or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: Xiaozhuang plugin center and Teamwork external-agent bridge

## Evidence

- Current product baseline: `/var/tmp/dsh-xiaozhuang-settings-before.png`.
- Browser-rendered implementation: `/var/tmp/dsh-xiaozhuang-settings-after.png`.
- Same-viewport comparison: `/var/tmp/dsh-xiaozhuang-settings-comparison.png`.
- End-to-end bridge result: `/var/tmp/dsh-teamwork-bridge-pass.png`.
- Surface: `http://127.0.0.1:3080/`, Codex in-app browser, light theme, 845 × 808 screenshot pixels before and after.

## Step review

1. **Find the self-developed extensions — corrected.** The baseline settings rail separated Computer Use from the generic Plugins page and provided no inventory for Teamwork, vision, model quota, mode switching, or local coding agents. The implementation adds one first-level `小庄的插件` row with a shared monochrome sparkle glyph and keeps every prior setting in place.
2. **Understand what is installed — corrected.** The selected page opens with a short Chinese summary and three compact facts, then groups seven currently enabled capabilities into `核心能力` and `外部智能体`. Every row contains one existing product icon, a plain-language outcome, a secondary runtime fact, and one consistent enabled status.
3. **Scan without nested-card noise — healthy.** Only the overview is a restrained native-radius surface. Plugin entries sit on the page plane with inset one-pixel separators, matching the existing settings typography and token palette. The list intentionally scrolls inside the existing settings panel at this desktop-app viewport; the rail and dialog chrome remain fixed.
4. **Use the external collaborators — verified.** A new real session selected `Teamwork` from the existing access-mode menu and asked for both tools in one turn. The UI showed `subagent_codex` and `subagent_zcode` as parallel tool calls and returned `CODEX_BRIDGE_OK ZCODE_BRIDGE_OK` after 22 seconds.

## Interaction and runtime checks

- Page identity: URL `http://127.0.0.1:3080/`; the live historical workspace and new acceptance session both rendered meaningful content with no framework overlay.
- Settings path: expand sidebar → `设置` → `小庄的插件`; the nav row becomes active and all seven expected entries are present in the DOM.
- Bridge path: new session in `迭代DSH` → access mode `Teamwork` → one self-contained dual-provider prompt → both external results returned.
- Browser console: no relevant post-reload application error. Four connection warnings were emitted only while the controlled launchd restart temporarily removed port 3080, then the same tab reconnected.
- Tests: local plugin contracts 10 passed; Settings shell tests 23 passed; settings client bundle and profile compose passed.
- This is a desktop product surface, so phone-sized behavior was not treated as a release path; the existing settings shell remains width-constrained and scroll-safe.

## Findings

No actionable P0, P1, or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: Teamwork icon and automatic refresh v2

## Evidence

- User panel reference: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-2ac92ece-d3f7-4864-a0e2-4d2008a1175a.png`.
- User icon reference: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-d8858cc1-028e-4d25-bd97-f738f4c7b2b7.png`.
- Current-run baseline: `/Users/zhuanghongkai/Desktop/迭代DSH/teamwork-before-v2.png`.
- Browser-rendered implementation: `/Users/zhuanghongkai/Desktop/迭代DSH/teamwork-after-v2.png`.
- Same-size before/after comparison: `/Users/zhuanghongkai/Desktop/迭代DSH/teamwork-before-after-v2.png`.
- Focused reference/implementation comparison: `/Users/zhuanghongkai/Desktop/迭代DSH/teamwork-icon-reference-after-v2.png`.
- Surface: `http://127.0.0.1:3080/`, real historical session with four completed subagents, light theme, Teamwork panel open. Baseline and implementation are both 845 × 808 image pixels at the same browser viewport.

## Step review

1. **Find the Teamwork entry — corrected.** The baseline used a detailed blue/black branching-node PNG in a blue selected square. It competed with the adjacent monochrome header controls and stayed visually ambiguous at 17px. The implementation reuses the product's existing two-person glyph as a shared `IconTeamworkOutline16`; the header is a 16×16 `currentColor` SVG and clearly communicates a team.
2. **Read the panel header — corrected.** The baseline repeated the node PNG inside a 34px pale-blue rounded square and added a visible `关闭` action. The implementation uses the same two-person SVG at 20×20, removes the colored container, and leaves the title/subtitle as the only header hierarchy.
3. **Review the panel footer — corrected.** The manual `刷新` action is gone. The footer now states `成员状态每 15 秒自动同步 · 点击成员可查看对话与轨迹`; the panel synchronizes immediately on open, then polls the official subagent catalog every 15 seconds without overlapping requests.
4. **Verify the remaining card — preserved.** Stage card, three-step progress, member/concurrency summary, completed-member rows, token/duration metadata, border radius, shadow, spacing, and maximum height are unchanged. The user-approved card remains intact.

## Interaction and runtime checks

- The page-header trigger still toggles the panel and updates `aria-expanded`; Escape closes it and the trigger reopens it.
- The panel contains 0 close buttons and 0 refresh buttons. Both header and panel marks are SVG elements, not raster images.
- A fresh 3080 tab loaded the trigger and panel with 0 console errors or warnings.
- Plugin contract/lifecycle tests: 5 passed. Shared icon tests: 77 passed. Conversation skeleton tests: 18 passed. Client TypeScript and complete official build passed.
- The user explicitly allowed ImageGen, but its own UI guidance says not to generate icons that must match an existing vector system. The existing two-person design-set glyph is the higher-fidelity deterministic asset, so no new raster image was generated or stored.

## Findings

No actionable P0, P1, or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: provider model usage header icon v8

## Evidence

- 16px baseline: `/Users/zhuanghongkai/Desktop/迭代DSH/usage-icon-16-before.png`.
- 14px implementation: `/Users/zhuanghongkai/Desktop/迭代DSH/usage-icon-14-after.png`.
- Surface: `http://127.0.0.1:3080/`, same real session and viewport.

## Result

The data icon now renders proportionally at 14×14 CSS px inside the unchanged 28px header action. Its 16-unit vector view box is preserved, so reducing the rendered size also reduces the visible stroke weight without altering or faking the source asset. The 12px label, chevron, color, spacing, and click target remain unchanged. Browser measurement confirms 14×14, the usage dialog still opens with `aria-expanded=true`, and the console has no errors or warnings.

final result: passed

---

# Previous Design QA: provider model usage header icon v7

## Evidence

- Current-run baseline: `/Users/zhuanghongkai/Desktop/迭代DSH/usage-icon-before.png`.
- Browser-rendered implementation: `/Users/zhuanghongkai/Desktop/迭代DSH/usage-icon-after.png`.
- Surface: `http://127.0.0.1:3080/`, real historical session, light theme, model-usage panel open.

## Step review

1. **Scan the session header — needs correction in the baseline.** The previous 64px generated PNG is reduced to 16px, so its blue bars, curved activity mark, and purple track merge into a noisy pixel cluster. It also introduces an isolated two-color accent between monochrome peer controls.
2. **Identify the model-usage action — healthy after correction.** The replacement is the existing `IconDataOutline16` from `ui-primitives`: a single-color SVG with a 16×16 view box, `currentColor`, and the same visual weight as the adjacent preset and chevron icons. The label remains the primary identifier, so the icon does not need to carry provider-specific meaning by itself.
3. **Open the model-usage panel — healthy after correction.** Clicking the same button still sets `aria-expanded=true` and opens the labelled `模型用量概览` dialog with live data. The trigger keeps its visible keyboard focus ring; no extra image alternative text is announced because the icon is decorative and the button already has the accessible name `模型用量`.

## Validation

- Browser inspection: trigger contains two SVGs (data + chevron), no raster image, and the usage glyph is exactly 16×16 CSS px.
- Interaction: panel opens from the replaced icon button; focus/expanded state remains intact.
- Browser console errors and warnings: 0.
- Targeted component test: 1 passed. Relevant TypeScript, provider-quota bundle, bilingual pairing, and complete official build: passed.
- Screenshot evidence can confirm visual hierarchy and the visible focus state; it cannot alone prove every screen-reader/browser pairing, so the accessible-name and DOM checks were verified separately.

No actionable P0, P1, or P2 issue remains in the requested path.

final result: passed

---

# Previous Design QA: provider model usage dividers v6

## Evidence

- Source visual truth: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-d008f3d0-4a0b-4b31-9765-0ed6bf5eeb07.png`, supplemented by the same-state baseline `/Users/zhuanghongkai/Desktop/迭代DSH/provider-quota-before-dividers.png`.
- Browser-rendered implementation: `/Users/zhuanghongkai/Desktop/迭代DSH/provider-quota-after-dividers.png`.
- Full-view same-input comparison: `/Users/zhuanghongkai/Desktop/迭代DSH/provider-quota-divider-comparison.png`.
- Focused panel same-input comparison: `/Users/zhuanghongkai/Desktop/迭代DSH/provider-quota-divider-panel-comparison.png`.
- Responsive implementation: `/Users/zhuanghongkai/Desktop/迭代DSH/provider-quota-after-dividers-600x800.png`.
- Viewport: baseline and desktop implementation are both 1280 × 720 CSS px and 1280 × 720 image pixels at density 1. The comparison canvas is a 2× macOS export, with both halves kept at equal scale. The 586 × 392 annotated user image communicates the separator intent and is not used for pixel-distance claims.
- State: the same real DeepSeek Harness session, light theme, four live providers loaded, model-usage panel open.

## Full-view comparison evidence

The previous implementation rendered four separate rounded rectangles inside the already-rounded panel. The implementation keeps the same 2×2 information order, logos, labels, quota tracks, reset times, refresh control, and outer panel, but places the providers on one continuous white surface. One centered vertical gray rule and one centered horizontal gray rule provide the requested grouping without creating four nested cards.

## Focused-region comparison evidence

The panel crop was compared separately because the one-pixel rules and their endpoints are too small to judge in the full application view. The horizontal rule is inset 24 px from both provider-list edges. The vertical rule begins 12 px below the list top and ends 20 px above its bottom, so neither rule reaches the panel edge. KIMI and GLM retain their short internal gray divider between the five-hour and weekly metrics. At 600 px viewport width, the layout becomes one column and uses three individually inset horizontal rules instead of leaving an invalid vertical divider.

## Required fidelity surfaces

- Fonts and typography: all existing product font sizes, weights, line heights, percentage emphasis, and reset-time wrapping remain unchanged.
- Spacing and layout rhythm: four independent borders and 10 px gutters are removed; shared dividers and 16 px card content padding create one calmer plane while preserving equal provider regions.
- Colors and tokens: all new rules use `--dsw-alias-border-l2`; there are no literal colors, gradients, or theme-specific overrides.
- Image quality and asset fidelity: all four existing provider logos and their shared rounded-square frames are unchanged and remain sharp.
- Copy and content: brand names, plan names, balance, percentages, progress semantics, reset timestamps, auto-refresh copy, and Beijing timezone disclosure are unchanged.

## Interaction and runtime checks

- Page identity: `http://127.0.0.1:3080/`, title `DeepSeek Harness`, real historical session loaded.
- Manual refresh entered its disabled loading state and returned to enabled.
- Header trigger closed and reopened the panel; `aria-expanded` returned to `true`.
- Desktop and 600 × 800 responsive screenshots contain no clipping, framework overlay, or stray card border.
- Browser console errors and warnings: 0.
- Targeted component test: 1 passed. Package TypeScript build and client bundle: passed.

## Comparison history

- P2: four rounded provider outlines made the 2×2 layout feel like nested cards rather than one coherent panel. Fix: removed provider borders, radii, and tinted backgrounds; added one inset cross-divider on desktop and inset row dividers on narrow screens. Post-fix evidence: both same-input comparison images show a continuous surface with line endpoints clear of every outer edge.
- Post-fix review found no additional P0, P1, or P2 issue, so no second visual correction was required.

## Findings

No actionable P0, P1, or P2 finding remains in the requested path.

final result: passed
# Design QA: 运行详情直达 Token 总览与精确趋势

## Evidence and normalization

- User issue source: `/var/folders/dt/4fn7m4f50ls_8jkk9vzhsxh80000gn/T/codex-clipboard-4d6c4eee-5001-4d43-9d4b-65cd36c3cd82.png`, showing the existing 「本会话运行详情」 header where the new navigation action belongs.
- Before captures: `/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-runtime-token-before.png` and `/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-token-overview-before.png`.
- Tokscale visual and information reference: `/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-token-report-reference.png`, captured from the live canonical report route rather than reconstructed from prose.
- Rendered implementation: `/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-runtime-token-final.png` and `/Users/zhuanghongkai/ZCodeProject/deepseek-harness/design-qa-token-overview-final-v2.png`, captured from the same `http://127.0.0.1:3080/` task, light theme and settled data.
- Generated asset source: `/Users/zhuanghongkai/.codex/generated_images/01a02a16-f998-7763-b426-b1b027e8309f/exec-2ac44e5d-b005-405f-bf72-8eef55f009ae.png`; product asset: `~/.dsh/profiles/web/packages/token-overview/assets/token-overview-icon.png` (128×128 RGBA PNG).

## Comparison history

- Earlier P1 finding: runtime details and whole-machine usage were disconnected, forcing users to close the panel, open Settings, and locate Token Overview manually. Fix: a compact header action dispatches a validated settings-section request; the registered `token-overview` section opens directly and the runtime panel closes.
- Earlier P2 finding: the old multi-node icon read as a generic agent/network glyph and had weak small-size recognition. Fix: ImageGen produced one restrained monochrome token-meter and pulse mark; the same packaged PNG is used in navigation and the page header, with a cache-busted URL.
- Earlier P1 finding: the core metrics sat inside one large gradient plane, while lower ranking and coverage areas alternated between bare rows and unrelated gray boxes. Fix: follow the canonical Tokscale report's shallow hierarchy—four individual neutral KPI cards, one Token-composition card, and consistent neutral trend/list/coverage cards. There are no gradients or decorative shadows.
- Earlier P1 finding: each trend bar exposed only a delayed browser `title`, so exact values were neither responsive nor keyboard/touch friendly. Fix: all eight bars are semantic buttons. `pointerenter`, focus and click synchronously select a row, and a reserved live readout shows exact interval, processed Token, non-cache Token, calls and estimated cost without floating overflow.
- Post-capture P2 finding: the first implementation inherited `bg-layer-2`, which computed to white in the current theme, and long exact values clipped in equal-width tooltip columns. Fix: surfaces now use a 4% neutral color mix matching the Tokscale reference; Token units move into labels and the exact-value columns receive deliberate minimum widths.

## Required fidelity surfaces

- Runtime header: title remains primary; settled/running state, compact `Token 总览` action and existing collapse control share one line without changing the 620px panel or its four metric groups.
- Token heading and navigation: one actual generated PNG, no text symbol, CSS drawing or replacement icon family; the settings rail and page use the same asset.
- Cards: shallow neutral planes, 12–14px radii, no gradient, no drop shadow, existing Harness typography and label tokens.
- Trend: exactly eight three-hour columns for today; zero-use periods stay gray. The live readout preserves exact values and remains above the chart, so it cannot be clipped by horizontal scroll.
- Responsive behavior: existing 760px maximum and settings scroll remain. Component queries collapse KPIs, readout, composition, rankings and coverage at 520px/380px without adding a separate page.

## Runtime and interaction checks

- Real path exercised: open 「本会话运行详情」 → click `Token 总览` → Settings opens directly with `用量趋势` and `核心指标` visible.
- Trend exposes eight interactive bars. Exact readout switched from `18–21 / 236,059,750 / 5,739,238 / 1,605 / $64.37` to `03–06 / 90,820,205 / 1,801,325 / 667 / $18.91`; selecting the unused `21–24` bar showed `0 / 0 / 0 / $0.00`.
- The final source uses the same Tokscale definitions: processed = input + output + cache read + cache write; non-cache = input + output; reasoning remains folded once in output and is not added twice.
- Runtime Pulse and Token Overview Host/Client contract tests pass 11/11. Settings shell tests pass 18/18; the rebuilt client bundle loads the cache-busted icon and the new cross-plugin listener.
- Browser logs contain only the expected connection retry warnings caused by the controlled local service rebuild; the final interactions produced no rendering, navigation, snapshot or data error.

## Findings

No actionable P0, P1 or P2 issue remains in the requested runtime-to-overview path, Token Overview icon, card hierarchy, or exact trend interaction.

final result: passed

---
