# Agent Note: 原生 Computer Use 与浏览器桥接

Status: implemented

[English](2026-08-21-native-computer-use-and-browser-bridge.md) | 中文

## Problem

桌面控制与浏览器自动化需要成为 DeepSeek Harness 的能力，而不是要求每位用户自行粘贴外部 MCP 配置。全局发布所有动作会让无关会话承担工具 schema 成本；若没有明确授权步骤就控制现有 Chrome 登录态，也会侵犯用户对登录状态的所有权。

## Decision

`@deepseek-ai/dsh-computer-use` 统一拥有三个原生 Provider：Qwen Open Computer Use 负责 macOS 应用，Playwright Context 负责干净浏览器任务，已解压的 DSH Browser Bridge 扩展负责用户现有 Chrome。`/computer` 与 `/browser [isolated|real]` 只在接收命令的 Agent 作用域注册对应工具族，再追加一条任务专属 steering 消息。Web Bundle 同时装配 Host 运行时与 `@deepseek-ai/dsh-client-ui-computer-use`，因此设置页和工具行都是插件注册，而不是 Shell 条件分支。

## Provider ownership

Qwen 的 9 个线协议工具使用稳定的 DSH `computer_*` 名称。DSH 把 `computer_click` 收窄为无障碍 `element_index`；全局坐标只保留在显式的拖拽回退中。对于点击、次级动作、带索引的滚动和设置值，运行时会从规划快照记录目标的无障碍 ID 或完整特征，串行执行所有桌面调用，在动作执行前立即获取应用实时树，并重新解析当前索引。因此，窗口被移动、隐藏或最小化后，动作仍会绑定到语义目标，而不是停在过期的屏幕坐标；目标缺失或无法唯一确定时会安全失败并要求重新检查。桌面租约只有一个，由调用 Session 持有到 `turn/end`；此时 DSH 发送 `notifications/turn-ended` 并释放租约。本机权限状态共用一次进行中的探测与一份 Host 生命周期缓存；开始或完成权限引导都会使缓存失效，设置页下一次刷新只会重新探测一次。Playwright 为每个 Session 拥有一个非持久化浏览器 Context，并随 Session 关闭。Chrome Bridge 分开记录“正在控制”和“由 DSH 新建”的标签页；会话清理只关闭 DSH 新建的标签，绝不关闭用户原本的标签页。

## Bridge authorization

Host 把带版本的扩展资源复制到 `<DSH_HOME>/browser-bridge-extension`，并把随机配对密钥以 `0600` 权限持久化到 `<DSH_HOME>/computer-use/bridge-token`。当前 Web 服务拥有精确的升级路由；它只接受 `chrome-extension://` 来源，并要求首条消息携带密钥。状态、权限设置与打开扩展目录接口要求回环客户端。同一时间只有一个已鉴权扩展连接，新连接替换旧连接时会拒绝旧连接中的待处理请求。

## Visual results

每个浏览器动作返回有界 DOM 快照，Qwen 返回无障碍状态。只有当前模型路由明确声明支持图像输入时，截图才会持久化为普通 DSH 附件；因此纯文本路由仍能合法续跑，原生视觉路由则会收到动作所依据的同一视觉状态。真实 Chrome Bridge 会把高分辨率可见页截图缩到最长边 1600px；截图捕获或缩放失败时仍保留 DOM 文本，视觉附件异常不会使整个浏览器动作失败。

## Conversation browser workspace

会话骨架提供单占用 `conversation.session.workspace` seam，Computer Use Client 在该 seam 注册与对话同高的浏览器工作区，并在会话标题栏注册显式「浏览器」入口。宽内容区保持对话与浏览器并列，可拖动分隔宽度；窄内容区改为右侧覆盖层，不改变底层对话排版。每个已挂载工作区只轮询当前 Session 的轻量状态，以便活动浏览器任务自动打开；本机权限轮询只在工作区可见时启动。它不嵌入任意站点 iframe，也不创建第二套提供方。

Host 的回环工作区接口复用同一个 `BrowserRuntime`。模型工具、地址栏导航、前进／后退／刷新、暂停／继续和人工点击都进入同一串行动作路径；最近 12 个步骤、暂停状态、DOM 摘要和截图版本按 Session 投影。人工接管把截图内点击转换为 0–1 归一化坐标，再由 Playwright 或 Browser Bridge 映射到真实可视区域。关闭会话会同时回收浏览器上下文、DSH 创建的 Chrome 标签和该投影。

## Alternatives considered

**直接配置 Qwen 上游 MCP 包。** 这种方案会暴露实现术语，生成带限定前缀的 MCP 工具名，无法在斜杠命令后才注册工具，也没有 DSH 原生设置页和结果展示。

**让所有任务共用一个持久化 Playwright Profile。** 这会混合不同 Session 的登录态与浏览器状态，降低可复现性。干净 Context 是默认模式；现有登录态必须通过独立、由用户配对的 Bridge 使用。

**通过调试端口接管 Chrome。** 启动参数和远程调试会暴露更宽的浏览器控制边界，也缺少产品可见的授权步骤。扩展把访问限制在用户明确加载并配对 DSH 的浏览器 Profile 中。

## Consequences

## Status update (2026-08-27)

`computer-use` / `ui-computer-use` 挂载行已从 web-app bundle 移除，浏览能力改由 vendor 的 [better-sidebar 工作台](../../implemented/architecture/2026-08-27-vendored-better-sidebar.zh.md) 承担。本 Note 仍保持活跃：桌面控制理由与恢复路径仍然有效——重新加回两行挂载（并重新配对桥接扩展）即可恢复 `/computer` 与 `/browser`。

普通会话没有 Computer Use schema 成本；通过命令激活的 Agent 可在后续轮次继续使用同一组工具。设置中的 `browserEnabled` 同时门禁 `/browser` 与会话工作区动作，关闭后 Host 拒绝新浏览器动作。桌面控制需要 macOS 辅助功能与屏幕录制授权。真实 Chrome 页面动作属于合成事件，无法绕过 `isTrusted` 校验、验证码、浏览器内部页面或不可访问的跨域 iframe。当任务不需要登录态时，隔离 Provider 是这些网站的确定性回退方案。

## Verification

包测试通过真实隔离 Playwright Context 驱动系统 Chrome，使用返回的 DSH ref 和归一化截图坐标定位元素，并校验点击后的快照、PNG 与步骤投影。桌面目标回归证明：元素数字索引变化后可通过稳定无障碍 ID 跟随；替换界面中出现多个同名目标时会安全失败。直接 MCP 冒烟测试连接包内 Qwen 0.2.3 原生运行时并确认上游 9 个工具。Provider 生命周期回归证明 DSH 会话销毁时会请求关闭对应的真实浏览器任务。Web 组件测试覆盖能力开关与浏览器来源控件。完整库构建与官方 Web 构建通过；真实 `127.0.0.1:3080` 产品已从标题栏打开会话侧工作区，通过地址栏载入 `example.com`、回传实时截图、暂停／继续、人工点击，并在已配对 Chrome 与隔离 Provider 之间往返后恢复隔离模式。已授权的真实 Chrome 扩展 1.1.0 自动恢复配对。
