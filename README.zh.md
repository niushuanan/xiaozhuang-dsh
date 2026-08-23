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
| **模型用量** | 预加载 DeepSeek、KIMI、GLM 和当前 GPT 登录账号的用量，支持手动刷新、自动刷新、额度窗口与重置时间。 |
| **会话内实时控制** | 在已有对话中切换 Agent 预设，按模型选择合理思考强度，并把规划和团队状态放到更合适的位置。 |
| **可扩展输入区** | 为文件、文件夹、命令、技能和插件提供直接扩展点，同时保留产品原生输入流程。 |
| **模型输入路由** | 明确区分纯文本与原生视觉能力，让图片模型和视觉工具回退可以同时存在。 |
| **产品伙伴** | 提供可拖动的跨页面鲸鱼伙伴，包含蓝色与黑色皮肤，并跟随运行、等待、完成和空闲任务状态变化。 |

这些能力继续使用 DSH 的普通包与 Profile patch layer 组装，没有另起一套平行应用。主要新增代码位于 [`packages/computer-use/`](packages/computer-use/)、[`packages/client/ui-computer-use/`](packages/client/ui-computer-use/)、[`packages/client/ui-provider-quota/`](packages/client/ui-provider-quota/)、[`packages/client/ui-product-companion/`](packages/client/ui-product-companion/)，以及 [`packages/`](packages/) 下的子代理、会话、预设和插件加载扩展。

### Computer Use 工作区

<img src="design-qa-computer-use-wide-final.png" alt="Xiaozhuang DSH 产品内的 Computer Use 浏览器工作区" width="920">

### 模型用量面板

<img src="design-qa-provider-quota-v4.png" alt="DeepSeek、KIMI、GLM 和 GPT 模型用量面板" width="720">

### 小鲸灵产品伙伴

<img src="design-qa-product-companion-frames.jpg" alt="小鲸灵蓝色与黑色皮肤的空闲、工作、等待、完成和睡眠状态" width="920">

小鲸灵常驻在产品页面之间，会根据当前任务自动切换状态。点击会在目录、页头与输入框之间跳动，拖到产品区域附近会自动吸附，也可以自由放置；还可以从“小庄的插件”随时关闭或重新开启。

<a id="run"></a>

## 下载与运行

### 推荐：下载发行包

打开 [Releases](https://github.com/niushuanan/xiaozhuang-dsh/releases/latest)，下载 `xiaozhuang-dsh-v0.1.0-prebuilt-source.tar.gz`。发行包同时包含源码和对应提交已经构建好的 Host、Client 与 Web 产物，首次运行前不需要再在本机执行构建。

运行要求：

- Node.js `^22.19.0` 或 `>=24.0.0`
- 通过 Corepack 使用 pnpm `11.7.0`
- 开发和 Teamwork worktree 功能需要 Git
- 只有启用桌面 Computer Use 时，才需要授予 macOS 辅助功能与屏幕录制权限

```sh
tar -xzf xiaozhuang-dsh-v0.1.0-prebuilt-source.tar.gz
cd xiaozhuang-dsh-v0.1.0
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

仓库和发行包不包含 API Key、登录会话、账号 Token、对话数据或本机 DSH Profile 状态。模型提供方和系统权限都需要在使用者自己的电脑上配置。模型用量插件只在运行时读取支持的本机账号配置，不会把凭据暴露给浏览器。

Computer Use 和外部协作者都是可选能力。各包 README 记录了权限、提供方要求、失败方式和已知限制。

## 持续迭代

这个仓库会持续公开已经在日常本地工作中证明有用的插件改进。后续会重点完善整机 Token 总览、更清楚的运行详情、更高效的输入区菜单、更流畅的输出体验，以及更简单的精选插件安装方式。

新增能力仍然遵循插件优先：必须解决一个用户能感知的任务，保留上游运行主干，并且可以在不破坏其他流程的情况下移除。

## 开发与贡献

修改包之前请先阅读[开发指南](docs/development.zh.md)、[架构文档](docs/architecture.zh.md)和[贡献指南](CONTRIBUTING.zh.md)。适用于所有使用者的通用修复，仍建议提交给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上游。

## 许可证

[MIT](LICENSE)。第三方依赖与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
