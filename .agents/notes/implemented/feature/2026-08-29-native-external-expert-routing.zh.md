# Agent Note: 原生外部专家路由

Status: implemented

[English](2026-08-29-native-external-expert-routing.md) | 中文

## 问题

Codex 与 Z Code 虽然以可配置外部专家的形式出现，但它们已配置的 Provider 并不会让官方 Agent preset 获得可调用工具。Teamwork 也会静态描述两个产品，即使其中一个已经关闭或不可用；同时，它只统计由根 Session 直接发出的委派。因此，原生子 agent 可以再次升级调用，却不占用根 Teamwork 的并发预算。

现有 subagent 运行时已经负责 Provider 发现、生命周期事件、运行结算、父级所有权和模型可见工具。新增并行的外部 agent 调度器或第二份名单会复制这些约定，并让 UI 状态与真实可执行能力发生漂移。

## 决策

Codex 与 Z Code 通过现有 `ctx.subagents` Provider 注册表和 `dsh-tool-subagent` 消费方完成集成。它们的 Provider 继续按照[共享 Host 放置](../architecture/2026-08-10-product-subagent-providers-in-shared-host.zh.md)作为共享 Host 注册；Agent preset 负责模型可见工具的公开范围。官方 `standard`、`ptc` 与 `cordis` preset 均包含启用的 `subagent_codex` 和 `subagent_zcode` 消费方；`minimal` 与 `chat` 则有意不公开任何外部专家。

`dsh-tool-subagent` 接受可选的 `routingGuidance`。每次 Provider 挂载时，它都会把这段稳定的实例用途追加到由 Provider 派生的描述中。现有[Provider 生命周期](../architecture/2026-07-05-subagent-provider-lifecycle-events.zh.md)继续是权威：Provider 缺失或关闭就没有工具，Provider 恢复后会用完整描述重新创建工具。工具调用不能选择 Provider、权限模式、可执行程序、凭据或部署路径。

Teamwork 每次组装提示词时都会从 `ctx.subagents` 派生外部专家名单。原生 `subagent` 与 `subagent_fork` 是常规执行池；外部专家只用于困难实现、原生尝试受阻、用户明确点名或确有价值的独立复核。策略只会列出当前可调用的 Provider，并要求每次外部调用都携带完整独立任务说明。

Teamwork 通过 `ctx.agents.isOwnedBy` 把已委派调用方解析回最近的 Teamwork 根节点。原生后代与外部调用共享根节点的五个工作者并发预算，因此嵌套委派不能绕过上限。复核默认使用不同于实现的执行路线，也不会自动同时调用两个外部产品。

### 可执行能力边界

| 关注点 | 责任方 | 可观察结果 |
| --- | --- | --- |
| 产品安装、认证与进程生命周期 | Host Provider 配置项 | 仅在启用时存在一个休眠的命名 Provider |
| 工具可见性与专家用途 | Agent preset 与 `dsh-tool-subagent` | 只有带工具的 preset 能调用专家，而且只在 Provider 存在期间可调用 |
| Teamwork 候选名单与路由策略 | Teamwork 提示词组装 | 模型只看到可调用专家，并继续默认使用原生工作者 |
| 委派计数 | Teamwork 根节点所有权 | 原生后代与外部调用共享一个五工作者上限 |
| 分发 | Teamwork 导出目录 | 独立插件载荷包含 Provider 适配器、工具消费方和带工具的 preset 授权 |

## 外部先例

[OpenAI Agents SDK](https://github.com/openai/openai-agents-python/blob/main/src/agents/agent.py) 把专门 agent 公开为由管理者持有的工具，具备稳定名称、描述、运行时可用性条件和返回结果。[AutoGen SelectorGroupChat](https://github.com/microsoft/autogen/blob/main/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_selector_group_chat.py) 会先筛选候选方再进行选择，并依赖稳定的参与者描述。[CrewAI 委派工具](https://github.com/crewAIInc/crewAI/blob/main/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py) 根据可用 agent 生成模型可见的协作者名单，并要求明确任务与上下文。[A2A](https://github.com/a2aproject/A2A/blob/main/docs/specification.md) 将发现元数据与任务传输、生命周期分开。

DSH 采用共同的「管理者把专家作为工具调用」和实时发现原则，但保留自己的 Provider／运行约定。这样既能让本地产品适配器热插拔，也无需新增网络 Agent Card、handoff 协议或第二套任务状态机。

## 验证

定向测试会固定 Provider 移除与恢复期间的路由说明、所有带工具官方 preset 中启用的专家配置项、`minimal` 与 `chat` 对专家的省略、Teamwork 仅包含活跃专家的名单文本，以及嵌套原生子 agent 受到根并发上限约束。目录测试会固定导出的 Teamwork 包中 preset 源码闭包与专家路由说明。包类型检查、bundle、文档门禁和真实 Web 组合会验证已发布入口与热插拔行为。

## 考虑过的替代方案

**建立独立外部 agent 调度器。** subagent 运行时已经负责提供方注册、运行、取消、结算和生命周期事件。第二套调度器会制造冲突的执行真相与独立工具体系。

**为本地产品使用 A2A Agent Card 与网络协议。** Agent Card 适合跨部署边界，但 Codex 与 Z Code 是 Profile 持有的本地适配器。加入发现端点、任务 id、流式传输和产物协商并不会消除当前用户阻碍。

**只在共享 Host 挂载产品工具。** 每个 Session 的 Agent preset 持有模型可见工具集。只有 Host 配置项会让设置看似启用，却仍让所选 Agent 缺少可执行工具。

**在 Teamwork 中始终调用两个外部专家。** 强制 fan-out 会增加普通工作的延迟、成本与矛盾输出。策略把一个独立复核者作为正常的高风险路径，只有跨模块风险或证据冲突确有必要时才同时使用两者。

**从 UI 设置读取外部名单。** UI 意图不等于可执行能力。Provider 注册表才是运行时权威，并会自动跟随热移除与恢复。

## 结果

外部专家现在是普通、静态授权的 subagent 工具，而不是装饰性的设置项。Agentic Coding 无需 Teamwork 也能调用它们；Teamwork 负责增加先规划后选择、独立复核和共享并发，而不是另建运行时。Provider 移除会 fail-closed，并立即移除对应工具。

本设计有意不增加任意 Provider 选择器、自动 fallback 链、跨产品上下文继承、远程 Agent Card 端点、外部专家调用配额或独立外部任务历史。新增专家只需要命名 Provider、目标 preset 中用途明确的工具配置项，以及可选的 Teamwork 名单描述；无需修改执行服务。
