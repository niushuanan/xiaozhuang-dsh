---
description: "使用按会话隔离的 DSH 侧边工作台处理文件、终端、Git、轻量浏览、任务和插件提供的标签页。"
kind: "package-reference"
---

# @deepseek-ai/dsh-better-sidebar

[English](README.md) | 中文

## 概述

`dsh-better-sidebar` 为每个 DSH 会话提供可持久化的右侧栏和底部面板，用于文件、编辑、终端、Git、轻量网页浏览、后台任务、侧边对话和模型终端输出。浏览器支持显式的网址或直接搜索输入，远程页面默认仍运行在沙箱 iframe 中。外部插件与内置标签页、预览器使用相同的 `ctx.betterSidebar.registerTab` 和 `registerFileViewer` 操作。Web 应用已直接挂载这个一等包；不要在同一个 profile 中再次安装另一份 `dsh-better-sidebar`。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

已发布的 Web bundle 以 `@deepseek-ai/dsh-better-sidebar` 挂载本包；用户通过**设置 → 侧边卡片**配置它的行为。

### 按网址浏览或直接搜索

浏览器地址框有两种显式模式。**网址**会规范化 HTTP(S) 地址并执行本机回环白名单。**直接搜索**保留用户输入的查询词，并在同一个轻量沙箱中打开 Bing 结果。输入框右侧的选择器控制当前标签页；侧边卡片设置中的**默认输入模式**控制之后新建的浏览器标签。

允许 iframe 嵌入的页面可以继续在侧边卡片中使用。目标站点如果返回 `X-Frame-Options` 或阻止性的 CSP `frame-ancestors` 策略，任何 iframe 都无法强行打开；侧边卡片会说明拒绝原因并提供**使用系统浏览器打开**。关闭页面沙箱也不能绕过远端站点的嵌入策略。

### 最小配置

Web 组合通过一行插件配置加载本包：

```yaml
- name: '@deepseek-ai/dsh-better-sidebar'
```

Host 限制均为可选项，并在 [`src/config.ts`](src/config.ts) 中提供默认值。浏览器输入模式和外链拦截属于用户设置，不是 Loader 配置：

| 偏好项 | 默认值 | 含义 |
|---|---|---|
| `browserDefaultMode` | `url` | 新建浏览器标签默认使用网址或直接搜索模式 |
| `browserNoSandbox` | `false` | 对完全可信的页面移除 iframe 沙箱隔离 |
| `browserInterceptLinks` | `true` | 允许符合条件的界面外链进入侧边卡片 |
| `browserInterceptHttp` | `true` | 开启拦截时转入 HTTP 外链 |
| `browserInterceptHttps` | `false` | 开启拦截时转入 HTTPS 外链 |
| `browserAllowedLoopback` | 空 | 侧边浏览器可访问的本机地址，使用英文逗号分隔 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

Host 端在浏览器信任围栏后提供 `/sidebar/api`、媒体、HTML、上传、懒加载 bundle、终端、任务和模型终端路由。文件操作始终以 realpath 限制在调用会话的工作区内，UI 终端通过 `ctx.subprocess.spawnTerminal` 运行，并拥有转录、停放和重连生命周期。

Client 端拥有工作台界面、`dsh-sidebar:v1:<id>` 下经过净化的按会话布局持久化、浏览器输入解析和嵌入探测，以及声明式的侧边卡片设置页。编辑器、终端和 Mermaid 等重依赖拆成独立 chunk。内置标签页和外部 Client 插件都通过同一个 `ctx.betterSidebar` 服务注册。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [工作台侧边栏决策](../../.agents/notes/implemented/architecture/2026-08-27-vendored-better-sidebar.zh.md)——包归属、浏览器选择与被拒绝的替代方案。
- [Web 应用组合](../../packages/bundle/web-app/cordis.patch.yml)——已发布的挂载行。
- [`BrowserView`](src/client/BrowserView.tsx) 与[浏览器解析器](src/client/browser.ts)——地址框行为、搜索解析和嵌入回退。

-----

<a id="model-experience"></a>
## 模型体验

### 打开侧边卡片

#### 模型看到什么

开启 `agentOpenTools` 后，模型会收到带目标和可选标题的 `sidebar_open` 工具。工具结果会说明文件、文件夹或 HTTP(S) 页面是已经送达已连接的侧边卡片，还是为该会话排队等待。浏览器布局、导航历史、搜索结果和网页内容都不会进入模型上下文。

#### Token 影响

工具定义会在启用期间占用 Token。每次调用会产生常规的工具调用与结果；浏览器界面状态和远端网页内容不会增加 Token。

#### KV Cache 影响

只要 `agentOpenTools` 不变，已注册的工具集就保持稳定。切换该设置会改变后续请求的工具定义前缀，而打开或导航标签页不会改变此前缀。

### 可选的侧边栏终端工具

#### 模型看到什么

开启 `agentTerminalTools` 后，模型会收到本包拥有的八个 `terminal_*` 工具及其受限结果。模型官方终端会话的只读映射只属于界面，不会添加模型内容。

#### Token 影响

可选工具定义及其调用和结果只会在启用并使用时占用 Token。模型没有通过这些工具读取的终端输出不会增加 Token。

#### KV Cache 影响

启用或关闭 `agentTerminalTools` 会改变后续请求可用的工具定义前缀。终端输出只会改变实际返回给模型的工具调用与结果历史。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 浏览器是沙箱 iframe，不是内嵌的 Chrome 引擎。禁止 framing 或依赖不可用第三方 Cookie 的站点必须使用系统浏览器。
- iframe 内部的链接跳转由远端页面拥有，不会生成地址框历史记录。
- UI 终端以用户权限运行，不受模型沙箱策略治理。
- Git 不支持 push、pull 或 fetch；文件预览需要手动刷新；宽度低于 768 px 时底部面板会并入右侧抽屉。
- 没有引入上游第三语言词典、better-locale 整合、设置导航图标和生态插件目录。
- `ctx.betterSidebar` 类型增强需要 `import type {} from '@deepseek-ai/dsh-better-sidebar/client'`；Host 根导出不会合并 React Client 类型。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

本包基于 MIT 许可，从 `omdsh-dev/DSH-better-sidebar` v0.17.0 vendor 而来。重新移植上游改动时，必须经过本 fork 的 locale 字典、Client 服务、subprocess 终端和 chunk CSS 适配。

</details>
