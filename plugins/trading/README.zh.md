# 交易工作区

侧栏的**交易**入口提供自选、行情图表、指标、策略、研究知识、资产与交易任务。**返回对话**回到原有工作台。**发给 Agent**把行情上下文和可用的图表图片追加到当前草稿，不自动提交。

## 整合方式

这是 Xiaozhuang DSH 整合产品中的可选原生目录。仓库构建通过 `package.json` 与 `cordis.patch.yml` 发现它，再运行 `scripts/build.mjs` 按依赖顺序构建自有包。全部 DSH 依赖使用本地 workspace 包，源码与运行资源留在本目录内。

设置使用宿主现有窗口。新增角色预设为 `trading-master`、`trading-trader`、`trading-researcher` 和 `trading-risk-reviewer`。普通会话保留当前模型、默认预设、历史和工作区。复制的交易预设绑定当前安装。交易存储使用 `$DSH_HOME/trading`；未设置该变量时，宿主目录按惯例回退到 `~/.dsh`。启动不导入旧交易数据或修改宿主文件。

## 验证

在仓库根目录执行 `node plugins/trading/scripts/build.mjs` 构建。使用 `node node_modules/vitest/vitest.mjs run --config plugins/trading/vitest.config.ts <test paths>` 运行选定源码测试。真实验收使用独立 DSH Home 和常规 `dsh web` 启动器，验证入口进出、图表、自选、设置、角色选择与草稿传递。

## 限制

外部数据可用性取决于各数据源和本地网络。需要凭据的数据源在配置前不可用；不可用不代表持仓为零或市场为空。实盘下单不属于整合验收范围：下单默认使用模拟模式，实盘执行仍要求显式配置和交互审批。上游独有的产品管理与外壳接管功能未纳入整合。

## 许可

本目录包含来自 [dsh-trading](https://github.com/zhu1090093659/dsh-trading) 的代码，使用 [PolyForm Noncommercial 1.0.0](LICENSE)，不适用宿主的 MIT 许可。来源与整合修改详见 [UPSTREAM.md](UPSTREAM.md)。
