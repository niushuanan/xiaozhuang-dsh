# 外部专家原生融合实施计划

[English](2026-08-29-external-expert-native-integration.md) | 中文

> **面向 Agent 工作者：**必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，逐项执行本计划。步骤使用复选框（`- [ ]`）跟踪。

**目标：**让 Codex 和 Z Code 通过 DSH 原生 Sub-Agent 工具在普通 Agentic Coding 与 Teamwork 中可调用，并由 Provider 生命周期驱动热插拔。

**架构：**产品 Provider 继续归 Host 所有。Agent preset 挂载绑定 Provider 的 `dsh-tool-subagent` 消费方；Teamwork 从实时 subagent 注册表推导候选名单和共享并发归属。

**技术栈：**TypeScript、Cordis 生命周期事件、Schemastery 配置、YAML Agent preset、Node 测试运行器、Vitest。

**设计：**[`docs/superpowers/specs/2026-08-29-external-expert-native-integration-design.zh.md`](../specs/2026-08-29-external-expert-native-integration-design.zh.md)

## 全局约束

- Provider 实例留在共享 Host，模型可见工具放在 Agent preset 内。
- 原生 `subagent` 和 `subagent_fork` 继续作为 Teamwork 默认路线。
- 不向模型暴露凭据、可执行路径、权限模式或动态 Provider 选择。
- 保持热移除语义：Provider 缺席时工具必须缺席。
- 不重启正在运行的本地 DSH 进程。

---

### 任务 1：Provider 专属路由说明

**文件：**
- 修改：`packages/subagent/tool-subagent/src/index.ts`
- 测试：`packages/subagent/tool-subagent/tests/tool-subagent.spec.ts`
- 修改：`packages/subagent/tool-subagent/README.md`
- 修改：`packages/subagent/tool-subagent/README.zh.md`

**接口：**
- 使用：`Config.provider`、`Config.toolName` 和 `SubagentProvider.inheritsParentContext`。
- 产出：可选 `Config.routingGuidance: string`，在每次 Provider 挂载时追加到生成的工具描述。

- [ ] 编写测试：挂载带 `routingGuidance` 的 Provider，确认工具 schema 含该句；移除并重新加入 Provider 后，确认重新生成的描述仍包含它。
- [ ] 运行 `pnpm vitest run packages/subagent/tool-subagent/tests/tool-subagent.spec.ts`，确认因为说明缺失而失败。
- [ ] 增加类型化配置字段、Schemastery 解析项和描述组合，不改变 Prompt 参数或执行语义。
- [ ] 重新运行定向测试和包类型检查。
- [ ] 更新双语包参考与配对记录。

### 任务 2：Preset 拥有的专家工具

**文件：**
- 修改：`packages/preset/agent-presets/presets/standard/agent.cordis.yml`
- 修改：`packages/preset/agent-presets/presets/ptc/agent.cordis.yml`
- 修改：`packages/preset/agent-presets/presets/cordis/agent.cordis.yml`
- 测试：`packages/preset/agent-presets/tests/shipped-root.spec.ts`

**接口：**
- 使用：Host Provider 名 `codex` 和 `zcode`。
- 产出：模型工具 `subagent_codex` 和 `subagent_zcode`，支持一次性后台执行和 Provider 自管深度。

- [ ] 编写内置 preset 测试：要求 `standard`、`ptc`、`cordis` 中存在启用、名称唯一且带路由说明的 Codex 与 Z Code 行，并确认 `minimal`、`chat` 不包含它们。
- [ ] 运行定向 preset 测试，确认它在禁用或缺失行上失败。
- [ ] 启用 Codex 行、增加 Z Code 行，并保持 Claude Code 按需启用。
- [ ] 重新运行定向测试和 preset 包类型检查。

### 任务 3：Teamwork 动态名单与共享归属

**文件：**
- 修改：`$DSH_HOME/profiles/web/packages/team-work/lib/index.js`
- 测试：`$DSH_HOME/profiles/web/packages/team-work/test/external-agents.test.mjs`
- 测试：`$DSH_HOME/profiles/web/packages/team-work/test/plan-mode-lifecycle.test.mjs`

**接口：**
- 使用：`ctx.subagents.getProvider(name)` 和 `ctx.agents.isOwnedBy(childId, parent)`。
- 产出：每次组装时的可调用专家名单，以及供原生和外部并发计数共用的 Teamwork 归属 id。

- [ ] 扩展 Profile 测试，要求只输出活跃专家说明，并证明嵌套原生子 Agent 会消耗根 Teamwork 的并发额度。
- [ ] 运行 Profile Node 测试，确认新增预期失败。
- [ ] 从实时 Provider 名单生成 Teamwork 策略，并把嵌套调用者解析到其 Teamwork 主 Agent。
- [ ] 重新运行全部 Teamwork Profile 测试。

### 任务 4：分发与持久设计记录

**文件：**
- 修改：`packages/client/ui-plugin-catalog/src/catalog.ts`
- 修改：`README.md`
- 修改：`README.zh.md`
- 修改：`README.i18n.yaml`
- 创建：`.agents/notes/implemented/feature/2026-08-29-native-external-expert-routing.md`
- 创建：`.agents/notes/implemented/feature/2026-08-29-native-external-expert-routing.zh.md`
- 创建：`.agents/notes/implemented/feature/2026-08-29-native-external-expert-routing.i18n.yaml`
- 修改：`PROJECT_CONTEXT.md`

**接口：**
- 使用：Teamwork 导出目录和根产品能力说明。
- 产出：包含 preset 所拥有工具授权的可安装源码闭包，以及当前架构决策。

- [ ] 把三个带工具的 preset 目录加入 Teamwork 导出来源，并增加目录回归测试。
- [ ] 更新根双语产品说明、已实现 Agent Note 和 `PROJECT_CONTEXT.md`。
- [ ] 重新记录所有改动的双语配对并运行定向文档检查。

### 任务 5：产品验证与发布

**文件：**
- 验证：改动源码、包构建、Web 组装和生成的独立仓库载荷。

**接口：**
- 使用：完成的实现和正在运行的已认证 Web Profile。
- 产出：已验证的主仓库与 `dsh-teamwork` 提交，远端 `master` 与本地提交一致。

- [ ] 运行定向 subagent、preset、Teamwork、目录、类型、构建、文档和 diff 检查。
- [ ] 不重启 DSH，验证实时工具名单及 Provider 关闭／恢复；当产品已认证时运行一次外部委派。
- [ ] 更新计划复选框并提交主仓库范围内改动。
- [ ] 推送 `origin/master`，从已推送提交重新生成 `dsh-teamwork`，推送其 `master` 并核对两个远端 ref。
