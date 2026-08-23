# Agent Note: 会话内实时切换 Agent preset

Status: implemented

[English](2026-08-23-live-session-agent-preset-switching.md) | 中文

## Problem

Web 会话标题栏原本只用只读文字显示当前 Agent preset，`agentPreset.select` 也会拒绝已经跑过第一轮的所有会话。用户若要在标准、创造、PTC、D 建或其他本地创作的组装间切换，只能放弃当前对话。直接在活跃请求中重链则更糟：它可能在轮次仍在运行时更换底层工具与提示词段落。

## Decision

`@deepseek-ai/dsh-client-ui-agent-preset` 把标题栏标签改为本会话的模式菜单。空闲时选择会立即发出；会话运行中作出的选择会保存在按会话隔离的插件 store 中，以所选模式加“下轮生效”徽记展示，并在共享会话摘要下一次报告空闲时重试。页面跳转不会丢掉排队选择，再次选择当前模式则会取消它。

Host 把准入规则从“仅空白”改为“仅空闲”。`agentPreset.select` 先按会话串行化请求，再通过 `Agent.runMaintenance()` 占用空闲阶段，然后由 `AgentPresets.recompose()` 把 Agent scope 移到所选的常驻挂载。maintenance 期间到达的唤醒输入会被暂存，只在重链完成后开启轮次。活跃轮次或另一个 maintenance 所有者仍返回可重试的 `agent-preset-locked`，因此客户端会把选择保留到之后的空闲边界。

只有重链提交成功后，Host 才追加 `agent-preset/selected`。这项持久事实决定恢复和后续轮次的组装，把既有 owner 事件转发到每个浏览器标签页，更新会话摘要，并让 preset 决定的命令和技能目录失效。创建头部和旧消息保持不变；新组装只管理后续轮次。

## Alternatives considered

**首轮之后保持 preset 不可变。** 否决，因为它会把日常模式切换变成新建对话流程，也会丢失有价值的对话上下文。

**取消正在运行的轮次并立即切换。** 否决，因为用户当前任务是价值最高的状态，模式选择绝不能丢弃已经进行中的工作。

**只改变浏览器标签，并在下次 prompt 时应用 preset。** 否决，因为这样每个 prompt 入口都要理解待切换状态，其他标签页或非 Web 调用方也可能与这项隐藏在客户端的决定竞争。Agent maintenance 边界是已经负责串行化唤醒工作的唯一权威。

## Consequences

既有对话无需从头开始，即可在随附模式和自定义模式之间移动。当前轮次始终使用它开始时的组装完成；排队切换能跨越标题栏卸载，并在下一条唤醒输入之前生效。模型可见前缀会在边界处变化，因此不期待此处复用 KV cache。历史工具调用不会被重放或改写，已经删除的 preset 仍无法再被选择，也无法在重启后据其重建。

## Verification

客户端 store 测试覆盖运行中排队、空闲重试、陈旧状态锁定、取消、owner 事件确认、会话消失、传输失败与飞行中去重。组件测试真实驱动标题栏菜单及其排队、切换中和错误状态。Host 测试证明活跃轮次与被其他 maintenance 占用时均返回 `agent-preset-locked`，而已完成轮次的会话可以重组并记录新的解析 preset。组装 Web e2e 打开一个已完成的种子对话，通过真实标题栏菜单从 Minimal 切到 Standard，并在零模型调用的情况下验证 Host 会话列表基线与渲染标签收敛。

## Related

本说明取代 [per-session agent presets](../architecture/2026-08-03-per-session-agent-presets.zh.md) 中“仅空白可切”与“标题栏只读”的决策。[slash catalog follows a preset switch](../bug-fix/2026-08-10-slash-catalog-follows-preset-switch.zh.md) 建立的落账提交和目录失效路径保持不变；只有可切换边界从空白扩展为空闲。
