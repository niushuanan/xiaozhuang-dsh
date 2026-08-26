# @deepseek-ai/dsh-computer-use

[English](README.md) | 中文

Web 组合中的原生 Computer Use 插件。它注册 `/computer <任务>` 与 `/browser [isolated|real] <任务>`。命令只把对应动作集加入接收命令的 Agent 作用域，再把任务 steer 给该 Agent；其他会话与普通提示词不会承担 Computer Use 工具 schema。

桌面动作把 `@qwen-code/open-computer-use` 的 9 个工具适配成 `computer_*` 名称。`computer_click` 接受无障碍 `element_index`，不再接受全局屏幕坐标。DSH 会记录该元素的无障碍 ID 或完整特征、串行执行桌面动作，并在每次索引动作执行前刷新目标应用的实时树、重新解析当前索引。因此，即使窗口被移动、隐藏或最小化，排队中的点击也不会落在原来的屏幕位置；如果目标已无法唯一确定，动作会停止并要求模型重新检查。坐标拖拽只作为无障碍动作无法表达手势时的显式回退。全局桌面租约避免两个会话并发控制同一套 macOS 界面，`turn/end` 会释放租约并发送上游的 turn-ended 通知。本机权限检查共用一次进行中的探测与一份 Host 生命周期缓存；开始或完成权限引导都会让缓存失效，设置页下一次刷新只重新读取一次最新状态。设置页操作会启动上游权限引导，插件启动时不会自动弹出。

隔离浏览器通过 Playwright 启动系统 Chrome，每个 DSH 会话拥有一个干净、非持久化的 Context。真实浏览器使用 `<DSH_HOME>/browser-bridge-extension` 中已解压的扩展。配对密钥以 `0600` 权限保存在 `<DSH_HOME>/computer-use/bridge-token`；WebSocket 只接受 Chrome 扩展来源，设置接口只服务回环客户端。Bridge 分开记录正在控制的标签和由 DSH 新建的标签；`browser_close` 与会话销毁只关闭后者。

`computer-use` 配置命名空间包含 `desktopEnabled`（默认 `true`）、`browserEnabled`（默认 `true`）、`defaultBrowserMode`（默认 `isolated`）和 `connectedBrowserNewTab`（默认 `true`）。浏览器动作通常返回 DOM／无障碍快照；`browser_selection` 改为读取用户当前划词，并返回一份有界 JSON，其中包含文字、地址、邻近文本、最近标题、DOM 选择器和来源元素 HTML，同时明确把网页内容标为不可信证据。当当前模型路由声明支持图像输入且附件存储已挂载时，插件还会持久化截图并作为图像块返回。

会话侧浏览器工作区复用同一个 `BrowserRuntime`，不会另起第二套浏览器。Host 通过回环接口投影每个 Session 最近 12 个步骤、当前模式、暂停状态、DOM 摘要与最新截图；地址栏、前进／后退／刷新和人工接管调用同一动作调度器。人工点击使用截图内的归一化坐标，Playwright 映射到隔离浏览器视口，Browser Bridge 映射到真实标签页可视区域。关闭会话时，同一生命周期同时清理 Context、DSH 新建的 Chrome 标签页和工作区状态。

## Model Experience

### 斜杠激活的桌面工具

#### What the model sees

执行 `/computer` 后，接收命令的 Agent 会看到 `computer_list_apps`、`computer_get_state`、`computer_click`、`computer_secondary_action`、`computer_scroll`、`computer_drag`、`computer_type_text`、`computer_press_key` 和 `computer_set_value`，并收到一条包含用户任务与验收要求的 steering 消息。Steering 约定要求每次只执行一个索引动作，并在每次动作后使用新状态；运行时还会在执行前独立复核索引目标。

#### Token effect

仅在触发后生效并保留到该 Agent 作用域结束；从不执行 `/computer` 的会话没有直接工具 schema token 成本。

#### KV Cache effect

第一次执行 `/computer` 会追加 steering 消息并改变该 Agent 的工具目录；后续桌面命令保留同一目录，只追加新的任务消息。

### 斜杠激活的浏览器工具

#### What the model sees

执行 `/browser` 后，接收命令的 Agent 会看到 `browser_open`、`browser_snapshot`、`browser_selection`、`browser_click`、`browser_fill`、`browser_press_key`、`browser_scroll`、`browser_tabs`、`browser_use_tab` 和 `browser_close`，并收到一条明确浏览器模式与任务的 steering 消息。`browser_selection` 只返回用户已经划选的内容，不会从整页猜测目标。

#### Token effect

仅在触发后生效并保留到该 Agent 作用域结束；从不执行 `/browser` 的会话没有直接工具 schema token 成本。

#### KV Cache effect

第一次执行 `/browser` 会改变该 Agent 的工具目录；后续切换模式会保留 schema，只追加新的模式与任务消息。

## Known Limitations and Deferred Work

- **macOS 桌面权限属于外部授权** — 桌面动作可用前，用户必须为 Qwen 上游运行时授予辅助功能与屏幕录制权限。
- **真实 Chrome 使用页面脚本** — 要求可信物理输入的网站、验证码、浏览器内部页面与不可访问的跨域 iframe 可能拒绝或隐藏动作；此时应改用隔离浏览器或桌面控制。
- **全局桌面租约只有一个** — macOS 输入与前台应用状态属于全局资源，第二条 DSH 会话必须等当前控制会话的一轮结束。
