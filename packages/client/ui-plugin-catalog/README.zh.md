# 小庄插件目录 UI

[English](README.md) | 中文

`@deepseek-ai/dsh-client-ui-plugin-catalog` 持有原生的**小庄的插件**设置页。Host 负责投影所选 Loader 行、在 Web Profile 的有界开关块中原子保存实时启停、保留 Teamwork 使用的协作者配置 API，并提供选择性插件导出；Client 负责分组搜索目录、胶囊开关、行内导出选择、浏览器下载和用户反馈。

Hero 会用品牌蓝直接写出仓库地址，并追加可见的点击提示。链接以带 `noopener noreferrer` 的新标签页打开 `https://github.com/niushuanan/xiaozhuang-dsh`，用户无需猜测哪段文字可以交互就能进入 Star 页面。

## 选择性导出

**导出插件**会在当前目录直接进入选择模式。用户可以逐项选择，也可以全选目录中的 16 项能力；选择条只保留纯文字数量，只有最终导出动作使用主按钮。全选不受搜索与当前启停状态影响：已经安装但处于关闭状态的能力仍可导出。目录包只是服务这些插件的基础能力，不会把自己列进导出项。**持续适配**是独立能力，因此进入目录并可导出。输入框添加菜单属于常驻的产品基础交互，刻意不单独进入可开关、可导出的插件目录。**聊天迁移**把聊天模式、DeepSeek 历史导入、输入框附件入口、内部无工具预设，以及直接扩展的连接、侧边栏、Session 运行时、工作区、对话、预设和图标源码作为一项完整能力导出。**Skill 管理**会导出自己的原生包源码，让另一套 DSH 通过普通 Cordis 行恢复 Skill 能力库。

`POST /plugins/xiaozhuang-plugins/api/export` 只接受本机同源页面提交的目录 id。Host 把这些 id 映射到封闭的仓库或 Web Profile 包根目录，收集源码、package manifest、构建后 JavaScript 和 package 声明的运行素材；排除 `node_modules`、Git 元数据、测试、缓存、凭据、本机设置、会话和对话记录。ZIP 在内存中生成，不会写入长期保留的暂存压缩包。

每个压缩包包含 `README.md`、`AGENTS.md`、`INSTALL.md`、`manifest.json` 与 `payload/<plugin-id>/...`。manifest 记录源码 commit、包来源、Cordis 行、文件大小和 SHA-256。安装说明要求 AI 把插件窄范围合入目标 DSH 版本，保留用户数据和现有改动；直接安装失败时只适配冲突的插件组装、记录全部调整，无法安全完成时停止，不能留下已经启用的半安装状态。

仓库包只会带上其 package `files` manifest 声明的素材。鲸少女会保留当前运行帧，但不导出已经淘汰的原始素材和旧动画版本，因此全选插件不会额外复制数百 MB 开发材料。

## 组装

Web bundle 在其他设置贡献者之前挂载 `xiaozhuang-plugins`。Host 依赖 Loader 与 WebServer；Client 依赖 Settings Slot 与共享图标。实时开关继续使用固定的 `# xiaozhuang-plugin-switches:start`／`:end` 块，所以迁移成原生包后，用户已有选择仍然保留。

## 模型体验

### 目录与压缩包生成

#### 模型看到什么

当前 DSH Session 中的模型看不到任何内容。导出包内的 `AGENTS.md` 与 `INSTALL.md` 只供接收电脑上的安装 AI 使用，不属于当前产品实例的提示词。

#### Token 影响

浏览目录、切换开关和生成 ZIP 都不会请求模型，也不消耗模型 Token。

#### KV Cache 影响

这些本地设置与压缩包操作不改变对话提示词，因此不会影响缓存。

## 已知限制与延后工作

- 导出是同步的浏览器本地下载，页面不保留服务端导出历史。
- 封闭导出目录会排除尚未审查源码和私有数据边界的未知第三方 Loader 行。
