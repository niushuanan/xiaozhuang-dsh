# DSH rc.7 本机升级与插件兼容设计

## 目标

将本机 DeepSeek Harness 从 `0.1.0-rc.5` 升级到官方 `0.1.0-rc.7`，保留当前历史会话、附件、设置、本地源码改动以及 `team-work`、`vision-local` 两个插件，并证明升级后的真实 Web 主链路可用。

## 当前状态

- 官方上游为 `https://github.com/deepseek-ai/deepseek-harness.git`，默认分支为 `master`。
- 本机源码仓库为 `/Users/zhuanghongkai/ZCodeProject/deepseek-harness`，由 `/Users/zhuanghongkai/.local/bin/dsh` 以源码入口启动。
- 当前本地提交 `7a8e28d8eb3ca981ce8538b36b895991c68b393a` 包含团队协作、子智能体返回入口和图片视觉桥改动。
- 本机 Web profile 位于 `/Users/zhuanghongkai/.dsh/profiles/web`，自定义插件为 `team-work` 和 `vision-local`。
- 历史会话、附件、设置和 profile 都位于 `/Users/zhuanghongkai/.dsh`；升级不得删除、重建或覆盖这些数据。
- `com.deepseek.harness.web` 当前通过 launchd 在 `127.0.0.1:3080` 提供 Web UI。

## 方案选择

采用“保留本地提交并合并官方上游”的原地升级方案：先创建可回滚 Git 引用和配置备份，再把最新 `origin/master` 合并进本地 `master`。不使用 npm 纯净安装覆盖源码，也不建立第二套长期运行实例。

该方案保留现有运行入口和用户数据，且临时合并演练表明上游 111 个提交与本地改动只有一个文档元数据冲突。短期验证实例可以使用独立临时目录或端口，但验收后不保留第二套服务。

## 升级流程

1. 记录当前源码 SHA、远端 SHA、运行进程和配置文件清单。
2. 创建指向升级前源码的本地备份分支，并为 `settings.yaml`、Web profile 配置及两个本机插件创建带时间戳的备份；会话与附件原地保留，不复制也不改写。
3. 获取官方 `master`，核验其版本为 `0.1.0-rc.7`，再合并到本地 `master`。
4. 解决 `packages/llm/llm-deepseek/README.i18n.yaml` 冲突：保留 rc.7 的翻译元数据结构，同时保留本机视觉桥对应的中英文说明。
5. 审查自动合并后的 ApiProxy 与 DeepSeek serializer，确保文本模型仍能接收原生图片附件，并把图片投影为 `attachment:<id>` 提示供 `image_vision` 使用。
6. 根据 rc.7 的真实服务接口调整两个 profile 插件，只修改发生不兼容或阻塞真实链路的部分。
7. 安装 rc.7 锁文件对应依赖，运行定向测试、类型检查和构建验证。
8. 先进行不占用 3080 的启动与插件加载验证；成功后受控重启 launchd 服务，再在 3080 走真实浏览器路径验收。

## 插件兼容边界

### `team-work`

必须继续提供团队协作权限选项、计划优先提示、计划阶段工具门禁、子智能体目录和返回主智能体入口。升级适配优先使用 rc.7 已有的 `permissionPresets`、`agentPresets`、`agents`、`planMode`、session projection 和 slot 服务，不新增第二套工作流状态。

当前日志中的部分历史会话无法取得 `planMode` 需要在验收中区分：如果 rc.7 当前会话也无法激活计划模式，则修复插件的作用域或激活时序；如果仅旧会话缺少对应组合，则保留明确降级提示，不修改历史会话数据。

### `vision-local`

必须继续提供图片选择、拖拽和粘贴入口，保留 DSH 原生附件持久化，并通过 `image_vision` 读取当前 Agent 会话中的 `attachment:<id>`。适配不得把图片转为不受 DSH 管理的临时路径，也不得把附件正文或密钥写入日志。

## 数据与运行安全

- 不删除或重建 `/Users/zhuanghongkai/.dsh/sessions`、`attachments`、`storages`、`.env` 和上传文件。
- 不执行清空缓存、重新初始化 profile 或覆盖设置的命令。
- 正式服务只在代码、插件加载和构建验证通过后重启一次；验证期间不同时运行第二个会写同一数据目录的 DSH 实例。
- 不推送官方仓库或任何远端；本次只更新本机 checkout 和本机 profile 插件。
- 如果启动、历史会话读取或核心插件验收失败，停止新进程，恢复升级前 Git 引用和 profile 配置，再启动原版本。

## 验证

### 源码验证

- 运行 ApiProxy 图片准入与附件持久化定向测试。
- 运行 DeepSeek serializer 图片注记和普通文本回归测试。
- 运行团队协作 UI 相关快照或定向前端测试。
- 运行受影响包的类型检查，并执行仓库构建，证明源码启动入口可生成完整产物。

### 插件加载验证

- 启动日志必须显示两个插件完成加载，且没有依赖缺失、服务注入失败或 Cordis 激活异常。
- Web 会话输入区必须显示团队协作入口和图片入口。
- 选择团队协作后，新会话必须进入计划优先状态；用户批准后才允许进入执行阶段。
- 子智能体目录可以打开，子会话可以进入，并能返回主智能体会话。
- 发送一张图片后，消息必须成功落盘，`image_vision` 必须读取对应附件并返回与图片内容一致的结果。
- 普通文本发送必须保持可用，不能因图片桥或插件异常返回 HTTP 500。

### 历史数据验证

- 3080 启动后能显示原有会话列表。
- 至少打开一个升级前会话，确认消息记录和已有附件可读取。
- `settings.yaml` 和 Web profile 继续生效，无需用户重新配置模型或插件。

## 完成标准

- 本机源码版本为官方 `0.1.0-rc.7`，且保留本地功能提交的有效行为。
- `team-work`、`vision-local` 均在 rc.7 上完成真实加载与核心路径验收。
- 普通文本、团队协作、子智能体导航、图片理解和历史会话读取全部可用。
- 3080 只运行升级后的单一 DSH 服务，并保留可执行的本地回滚入口。
