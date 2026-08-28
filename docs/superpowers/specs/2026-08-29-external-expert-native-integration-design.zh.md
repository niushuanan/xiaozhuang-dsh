# 外部专家原生融合设计

[English](2026-08-29-external-expert-native-integration-design.md) | 中文

## 产品结果

Codex 和 Z Code 是可调用的协作者，不是只出现在设置里的身份。普通 Agentic Coding 会话可以通过与原生子 Agent 相同的工具契约把任务交给任一专家。Teamwork 增加先规划后执行的路由、共享并发上限和独立复核策略，但不拥有第二套执行运行时。

安装后的专家可供每个新组装的、带工具的 Agent preset 使用。移除 Provider 会让它的工具从实时 Prompt 组装中消失；恢复 Provider 后工具自动恢复，不需要重启浏览器或重建会话。现有原生 `subagent` 和 `subagent_fork` 继续作为默认路径。

## 源码调研

- [OpenAI Agents SDK](https://github.com/openai/openai-agents-python/blob/main/src/agents/agent.py) 用独立名称、路由描述、运行时可用条件、嵌套流和最终输出把专家暴露成工具。DSH 采用这种 manager 模式，因为父 Agent 必须保留用户对话和最终责任。
- [A2A](https://github.com/a2aproject/A2A/blob/main/docs/specification.md) 把发现元数据、传输能力、任务生命周期、流式更新和产物分开。DSH 保留现有 `SubagentProvider` 执行契约，只吸收有价值的发现原则：路由依据已声明且当前可用的 Provider，而不是静态 UI 名单。
- [AutoGen SelectorGroupChat](https://github.com/microsoft/autogen/blob/main/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_selector_group_chat.py) 在模型选择前过滤候选者，并要求稳定的成员名称和说明。因此 Teamwork 只列出活跃 Provider，并为每个工具提供稳定、用途明确的描述。
- [CrewAI 委派工具](https://github.com/crewAIInc/crewAI/blob/main/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py) 从可用成员名单生成模型可见的协作者说明，并传递明确任务与上下文。DSH 已要求简短展示说明和完整独立 Prompt，因此扩展现有 schema，不再增加另一条委派命令。

## 架构

共享 Host 继续作为产品 Provider 实例的唯一归属。Codex 和 Z Code 在 `ctx.subagents` 注册具名实现；两个产品都只在工具被调用时启动。每个 Agent preset 通过为每位外部专家挂载一个 `dsh-tool-subagent` 实例，独立拥有模型可见权限。

`dsh-tool-subagent` 新增可选 `routingGuidance`。包会把这句话追加到依据 Provider 生成的上下文、调度和结果说明中。Provider 生命周期继续负责注册：Provider 缺席时工具缺席，重新注册时完整描述会重新生成。

内置 `standard`、`ptc` 和 `cordis` preset 包含启用的 Codex 与 Z Code 工具行。Provider 不存在时这些行仍可存在；它们等待 `subagent/provider-added`，在 `subagent/provider-removed` 时消失，并且自身不会授予产品访问权。`minimal` 和 `chat` 按产品定位继续不带委派工具。

Teamwork 在每次 Prompt 组装时从 `ctx.subagents` 解析外部专家名单。策略只列出当前可调用的专家，继续把原生子 Agent 作为默认执行路线，并要求独立复核使用另一条可用路线。被委派的原生子 Agent 仍归属于同一个 Teamwork 主 Agent，因此嵌套升级不能绕过五人并发上限。

## 热插拔和失败行为

Provider 安装和认证仍归部署负责。Provider 缺失时没有模型可见工具；Provider 已存在但未认证时，只在真实调用时失败并返回既有诊断。关闭 Teamwork 会移除它的规划策略与面板，但不会移除独立启用的专家 Provider 或它们由 preset 拥有的工具。

工具名和 Provider 名仍是静态配置事实。模型不能任意选择 Provider id、权限模式、可执行路径或凭据。Codex 与 Z Code 继续使用一次性外部运行；原生 spawn 和 fork 子 Agent 保留现有可继续行为。

## 验证

定向测试覆盖 Provider 增删期间的路由说明、所有带工具内置 preset 的活跃专家行、minimal/chat 的排除、Teamwork 名单变化和嵌套子 Agent 并发。包类型检查与构建验证发布面。真实 Web 会话验证当前工具名单、一次原生委派、一次外部委派、Teamwork 路由，以及不重启 DSH 进程时 Provider 的关闭与恢复。
