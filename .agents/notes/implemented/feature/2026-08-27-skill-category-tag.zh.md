# Agent Note: Skill 分类标签来自 frontmatter 字段，客户端不做推断

Status: implemented

[English](2026-08-27-skill-category-tag.md) | 中文

## Problem

Skill 管理目录一行放两个 Skill，几乎每一行都标着同样的来源字样（个人），也看不出每个 Skill 是做什么的。本机约三十个已安装 Skill 的列表里，每行几乎没有可区分的信息。主人还定下方向性规则：任何分组标签必须来自数据——创建 Skill 时由 AI 判定产出，存量 Skill 由 AI 判定回填——绝不能在 UI 里写名称前缀或关键词的硬编码映射。

## Decision

可选的 frontmatter 字段 `category` 现在是一等 `SkillSummary` 成员，与 `whenToUse` 同级：

- `dsh-skill-filesystem` 像解析 `whenToUse` 一样解析可选的 `category:`，并在候选与定义上携带。
- 注册表在该值存在时做类型校验（`validateCandidate`、`validateDefinition`），并通过 `runtimeCandidate()` 与 `toSummary()` 投影；本地文件、自定义 Provider 和 `ctx.skills.register()` 调用都能提供该字段。
- Skill 管理页渲染单列限宽（820 px）目录。每行展示图标、名称、标题旁的分类标签、合并 `description` 与可选 `whenToUse` 并截断两行的介绍，以及右端的可写徽章。没有分类的行不显示标签。行保留无障碍按钮语义；可见的来源分组字样被移除，因为徽章已经表达权限，专注阅读区仍显示完整来源分组。
- 导入归一化要求该字段：固定的归一化提示词要求 JSON 响应携带两到四个汉字的中文分类，安装时若 `SKILL.md` frontmatter 中的 category 与之不一致则拒绝提案。此后每个导入的 Skill 都自带分组。
- 存量 Skill 由 AI 逐个判读描述后一次性回填纯文本 `category:` 行：`~/.agents/skills` 下 28 个个人 Skill、`~/.dsh/skills` 下的 `tokscale-token-report`、仓库内 `.agents/skills` 的 11 个条目，使用五个值 {飞书, 钉钉, 工作流, 开发, 数据}。产品里不存在任何推断代码。

## Alternatives considered

- 在客户端代码中按名称前缀和描述关键词推断分类——拒绝：这种映射会把偏见固化并随真实内容漂移，且主人明确否决硬编码。
- 在新标签旁保留来源分组字样——拒绝：可写/只读已经表达权限，阅读区保留精确来源分组，而 30 行里有 28 行重复「个人」只是噪音。
- 复用 Provider 不透明的 `metadata` 透传而不设类型化字段——拒绝：调用中立摘要 seam 只应通过命名成员保持显式并被校验。

## Consequences

目录每行现在都展示自己的可区分事实——做什么、属于哪类、能否编辑——既不拉宽面板，也不在渲染时调用任何模型。导入时为必填字段多支付少量输出 token。

Runtime 与 bundled Skill 没有可编辑的 SKILL.md 文件，在其注册项携带 `category` 之前保持无标签；`image-vision` 在其 profile bundle 可重建前都没有标签，且重建不得打断运行中的实例。重装外部套件（例如 lark-* 系列）会覆盖回填的 frontmatter，需要再跑一次判定流程。

## Related

[原生 Skill 库与自适应导入](2026-08-26-native-skill-library.zh.md) 拥有设置页本身的决定；本 note 只负责每行如何获得分组标签与介绍。

## Testing

注册表套件新增候选/定义类型错误用例与摘要投影断言；文件系统套件解析 `category:` 行；导入 Host 规格覆盖缺字段拒绝与 frontmatter 不一致拒绝；组件规格断言标签、合并介绍、徽章与无标签行；web e2e 夹具加入 category 并在 `DSH_SNAPSHOT=refresh` 下重新生成三份金快照。
