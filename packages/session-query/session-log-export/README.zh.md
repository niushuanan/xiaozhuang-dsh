# @deepseek-ai/dsh-session-log-export

[English](README.md) | 中文

Web 对话导出控制。Session Header 中的“导出对话”会打开两个普通用户可理解的选项：保留原有 Session ZIP 的“导出文本记录”，以及把完整问答整理成单张 PNG 长图的“导出对话图片”。Host 半包仍注册 `/export`，浏览器半包负责菜单、下载控制器和共用结果弹窗。ZIP 生成、原始 JSONL/zstd 读取、子 Session、附件、背压和 HTTP 错误语义仍由 [ApiProxy 下载实现](../../host/apiproxy/README.zh.md)负责。

图片导出会先加载当前 Session 的全部历史页，再从会话数据中只选择用户消息、Steering 消息和助手正文。思考过程、工具调用、系统上下文、命令行、错误卡片和用量信息不会进入图片；正在生成中的助手正文会作为最后一条回答保留。图片由专用画布排版为一张长图，而不是截取当前可视 DOM，因此折叠或隐藏的思考内容也不会泄漏。

## 命令约定

| 输入 | 结果 |
|---|---|
| `/export` | 记录一组用户命令生命周期；提交命令的浏览器收到本地执行确认后，下载 `GET /api/session.export?sessionId=<id>&includeDescendants=true`。 |
| `/export <path>` | 返回错误。浏览器下载通过浏览器的普通下载行为选择目标位置。 |

该命令只由 Web bundle 挂载。只有 `/export` 返回成功时，本地 `command/executed` 确认才会在提交命令的浏览器中触发斜杠下载；其他标签页仍会渲染持久命令行，但不会重复执行浏览器副作用。Header 菜单的“导出文本记录”调用同一个 ZIP 控制器：先发出 `HEAD` 预检，再把 GET URL 交给浏览器下载管理器，JavaScript 不会缓冲 ZIP。“导出对话图片”读取同一浏览器已经加载的 Session，并在缺少旧历史时按页补齐。两条路径共用并发折叠、插件释放时取消、准备阶段错误处理、浏览器保存行为和同一个 Modal。

Host 下载端点会在 `readRaw` 前 flush 活动的根 Session，因此斜杠命令触发的 ZIP 会包含启动下载的 `command/run` 与 `command/done` 事件对。冷持久化 Session 不需要 flush。

弹窗会根据用户选择分别报告文本记录或对话图片的准备中、开始下载与失败。关闭弹窗不会取消正在进行的下载；该操作随后完成时也不会重新打开弹窗。每个 Session 同时只允许一项导出，重复操作会共用该任务。

## 组合

```yaml
- id: session-log-download
  name: '@deepseek-ai/dsh-session-log-export'
```

Web bundle 将本包与 `dsh-host-apiproxy`、`dsh-commands`、`dsh-client-ui-commands` 和 `dsh-client-ui-conversation` 一起挂载。本包把按钮和弹窗贡献到最右侧的 `conversation.session.header.utilities` 列表，与标题旁 `conversation.session.header.actions` 中的模式、Subagent 和 Task 配置项相互独立；Trajectory 不包含导出入口。

## 模型体验

### 用户 `/export` 控制

#### 模型看到什么

无。`/export` 留在用户命令平面，ZIP 下载不会进入模型历史。

#### Token 影响

为零。该命令不创建模型轮次。

#### KV Cache 影响

无。仅日志命令生命周期和浏览器下载不会改变派生请求前缀。

## 已知限制与暂缓事项

- 下载端点要求持久化后端具有逐 Session 原始工件。随附 JSONL 后端支持明文和 zstd 工件；本次改动不包含 SQLite 导出。
- 两种格式都是浏览器下载，不是 Host 路径写入。目标位置由浏览器选择，不会返回 Host 路径或原生文件夹操作。
- 预检只报告 ZIP 开始流式传输前发现的失败。浏览器接受 GET 后发生的子 Session 或附件读取失败由浏览器下载管理器报告，不通过弹窗报告。
- 对话图片只导出当前 Session 的问答，不包含子 Session；图片中的消息附件以“【图片】”占位，暂不把原图像素嵌入长图。
