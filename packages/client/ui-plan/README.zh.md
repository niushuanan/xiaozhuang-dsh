# @deepseek-ai/dsh-client-ui-plan

[English](README.md) | 中文

Plan mode 会话状态，纯浏览器 surface 插件。空白会话使用 Hero 布局时，浏览器侧向 `conversation.hero.actions` 贡献低强调操作；会话进入活跃布局后，同一操作转入 `conversation.session.header.actions`；node 侧是空 apply（roster 行）。plan 行为本身——`/plan` 命令、边界或空闲即时提交的 `plan/mode` 状态、`plan` 投影单元与 policy 段——归 [`@deepseek-ai/dsh-plan-mode`](../../plan/plan-mode/README.zh.md) 所有，由 host roster 独立组合。

plan mode 经 `/plan` 命令路径进入：用户可以从 composer 的 `+` Command 菜单选择 Plan，也可以输入 `/plan`，而本包不渲染未激活态控件。当 host 计算的 `plan` 投影有效目标为 plan mode 时（`pending ? !active : active`——折叠的 host 值而非客户端乐观态，帧到达即自动纠正），空白会话的上下文行或活跃会话的页头显示无底色、无边框的「规划模式 ×」文字操作，经 `command.execute` 执行 `/plan off`；否则不渲染。输入框只保留任务输入所需控件，文本框 placeholder 仍切换为 plan 任务提示——"describe your task to generate plan"（中文「描述你的任务以生成计划」），经 ui-conversation 的 `conversation` locale 命名空间（`placeholder.plan` / `hint.plan` 键）本地化，并与已认领 `/plan` 命令的提示逐字共用同一份文案（由同一投影渲染；owner 提供的 placeholder 优先）。

顶层操作携带无障碍描述「规划模式已开启，按下关闭」。准入失败（`matched: false`、业务错误、传输故障）会保留给辅助技术并显示在操作 title 中；状态保持显示直至投影确认退出。

模型通过稳定的 `exit_plan_mode` 工具退出 plan mode；其 plan 评审走已组合的 Web question 通道。

## 模型体验

间接地，通过顶层操作派发的 `/plan off` 命令行：`@deepseek-ai/dsh-plan-mode` 拥有该命令行驱动的模型可见 policy 段、退出工具 schema 与已记录状态，本包只渲染投影并发送用户同样可以手敲的内容。

#### KV Cache 影响

进入或离开 plan mode 会改变活跃的 `plan:policy` 系统提示词段，因此改变请求前缀；顶层状态本身不添加任何提示词内容。

## 已知局限与延后工作

- **Plan mode 是引导而非执行沙箱**：需要强制只读规划的部署必须组合独立的沙箱与审批策略。
- **无未激活态 plan 控件**——入口使用共享 Command source；有能力但 mode 未激活的会话在两种顶层区域均不显示 plan 状态。
