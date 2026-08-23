# Agent Note: Publish Xiaozhuang DSH as a plugin-enhanced community distribution

Status: implemented

[English](2026-08-24-xiaozhuang-community-distribution.md) | 中文

## 问题

公开的 `xiaozhuang-dsh` 仓库已经包含原生 Computer Use、厂商用量、会话内切换、外部智能体和 worktree 等增强，但根目录 README 仍然只介绍 DeepSeek Harness 上游项目。读者无法区分社区发行版和上游发行版，不知道仓库实际包含哪些新增能力，也无法在不执行完整仓库构建的情况下获得已经构建好的 Web 与包产物。

仓库必须保留上游署名与包归属。直接在上游 npm scope 下发布修改后的包图，会让人误以为这是官方发行版，而且需要为每个包维护另一套版本序列。把本机 Profile、凭据、账号状态或 `node_modules` 打进发行包，则会让产物不安全或只能在一台机器上使用。

## 决定

公开仓库使用 Xiaozhuang DSH 作为名称，定位为基于 DeepSeek Harness 的独立社区插件增强发行版。README 链接上游项目，保留 MIT 署名，只列出仓库里真实存在的能力，并分别提供发行包和 Git 源码两条运行路径。

社区版本使用 `xiaozhuang-v*` Git tag 和 GitHub Releases，不进入上游 `dsh-v*` npm 发布序列。每个版本附带一个 `xiaozhuang-dsh-v*-prebuilt-source.tar.gz` 压缩包和 SHA-256 校验文件。压缩包包含该 tag 的源码，以及 official profile 对应的 Host、Client 与 Web 构建产物；排除 `.git`、`node_modules`、本机 DSH 状态、凭据、缓存、worktree、测试输出和发行暂存文件。使用者仍需在自己的平台安装锁定依赖，然后运行 `pnpm dsh web`。

它是可分发的源码 checkout，不是受管安装器。[源码运行决策](../simplification/2026-08-10-source-run-without-managed-installer.zh.md)仍然有效：仓库不负责原子升级、回滚状态、凭据配置或现有本机 Profile 的迁移。

## 考虑过的替代方案

**把所有修改过的包发布到 npm。** 这样安装命令最短，但现有包名仍属于上游 `@deepseek-ai` scope，而且仓库修改了一整张依赖图。社区 npm fork 需要先确定新的所有者、包名、协调版本和迁移方案，才能诚实表达这些包。

**只使用 GitHub 自动生成的源码压缩包。** 这种产物安全且可复现，但会忽略 `lib/` 和 Web `dist/` 构建结果。每个下载者首次运行前都必须执行完整 official build，不符合直接下载后尽快使用的目标。

**打包 `node_modules` 或整台机器镜像。** 这样可以省掉依赖安装，但会大幅增加体积、固化平台专属原生包，并增加携带本机状态的风险。预构建源码包只保留生成后的应用代码，依赖仍由 lockfile 按下载者平台选择。

## 影响

读者可以识别这个发行版、查看新增能力，并下载一个带校验值的版本压缩包。发行包省掉仓库构建步骤，但仍需要受支持的 Node.js、Corepack 和依赖安装。模型凭据、ChatGPT 或 Codex 登录、macOS 权限、浏览器扩展配对与其他可选本机插件仍由每台机器单独配置。

社区版本号不会修改包 manifest，也不宣称 npm 包与 Xiaozhuang 版本存在兼容关系。后续发布需要更新 README 中的资源名，从发行提交执行构建，验证解压后的 checkout，并发布新的 `xiaozhuang-v*` tag。仓库继续通过独立的 `origin` remote 同步上游。
