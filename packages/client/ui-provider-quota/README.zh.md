# `@deepseek-ai/dsh-client-ui-provider-quota`

[English](README.md) | 中文

会话页头的模型用量面板。浏览器端向 `conversation.session.header.actions` 贡献一个页头动作，并在统一的 2×2 紧凑中文面板中展示 DeepSeek、KIMI、GLM 与 GPT。产品启动时不会请求任何提供方；用户首次打开面板时立即用宿主缓存渲染，过期条目转为后台刷新，Host 缓存、手动刷新按钮与打开状态的五分钟轮询共同保持数据更新。Node 端通过 `GET /plugins/ui-provider-quota/api/usage` 提供聚合快照；它与页面同源，因此浏览器不需要接触厂商密钥，也不会遇到跨域限制。密钥会以只读方式依次从环境变量、`~/.dsh/.env`、`~/.claude/multi-gateway/config.json` 与 `~/.zcode/v2/config.json` 解析。GPT 读取已安装 Codex app-server 中当前登录的账号；app-server 管道中断或提前关闭时只会记录为该提供方错误，不会终止 Web Host，快照也不会返回邮箱或任何凭据。`~/.claude/multi-gateway/config.json` 中用户选定的 DeepSeek Key 优先于其他账号的 Key。快照在内存中缓存五分钟并镜像到 `~/.dsh/provider-quota-cache.json`，重启后首开由磁盘秒回，过期条目按“先给旧值、后台刷新”策略响应；`?force=1` 会现场采集。

## Channel shapes

- **DeepSeek** — 官方余额 API，面板只展示一个账户余额；内部的充值与赠送拆分不对用户展示。
- **Kimi** — `sk-kimi-*` 密钥查询 Kimi Code `/usages` 接口（周额度、5 小时滚动窗口与 booster wallet 事实）；普通 Moonshot 开放平台密钥改为查询金额余额接口。
- **Z.ai / GLM** — 控制台 monitor 配额接口；只展示额度，不展示金额。
- **GPT** — 已安装 Codex app-server 的登录账号限额快照。面板只展示主账号的 10,080 分钟本周订阅窗口，明确不再混入模型专属的五小时限额桶。

会员标签同样来自当前登录账号：KIMI 展示官方英文套餐名 `Allegro`，GLM 展示 `Pro`，GPT 展示 `Pro`，并按用户的实际权益补充 `20X` 标识。

每个额度窗口都是带明确标题的进度条：完整额度使用可见灰色底轨，只把已经消耗的部分显示为蓝色，因此 0% 会保持全灰。进度条下方直接展示北京时间的具体重置日期与时刻。如果厂商在 0% 时没有返回重置时间，面板会明确写“未使用，暂无重置”，不会猜测时间。

四个厂商共享同一个面板平面，不使用独立圆角卡片；两端内收的横向和纵向灰线划分 2×2 信息区，KIMI 与 GLM 内部的短竖线继续区分五小时和本周额度。

品牌图片中，KIMI 使用官方正方形应用图标，GLM 使用当前机器已安装 Z Code 桌面应用包中的原生图标；DeepSeek 与 OpenAI 使用固定版本、MIT 许可的 Lobe Icons 素材。四个品牌统一使用 34×34px、8px 圆角的裁切槽；黑底和白底只负责保持各自品牌观感，最终外轮廓始终由同一槽位裁切。

标题栏入口使用项目原生图标库中的单色“数据”矢量图标，与智能体模式和展开箭头保持一致的线性风格和颜色。图标以 14px 等比渲染，使轮廓比相邻文字更轻；厂商警告仍留在面板内部，作用范围更加清楚。

## Model Experience

None, as the node half registers no prompt, tool, message, or provider request and the browser half is display-only.

#### KV Cache effect

None。

## Known Limitations and Deferred Work

- **Kimi 与 Z.ai 接口未公开文档** — 两者均从官方客户端逆向并经过真实验证，但厂商可能随时修改；单个厂商失败时，面板会展示该厂商错误，不会让整个面板失败。
- **Kimi 与 Z.ai 的额度不等于金额** — 只有 DeepSeek（以及 Moonshot 开放平台密钥）提供真实余额；Kimi booster wallet 仅在账号启用时返回用量事实。
- **密钥发现仅限当前机器** — 解析逻辑只遍历固定的本地配置文件链；密钥不在其中时会显示 `no key found`。
- **GPT 额度跟随桌面账号** — GPT 用量要求已安装 `codex` 二进制并登录 ChatGPT 账号。仅使用 API Key 的 Codex 配置无法提供 ChatGPT 订阅限额。
