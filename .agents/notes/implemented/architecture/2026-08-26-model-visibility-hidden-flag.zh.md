# Agent Note: 模型可见性开关（`hidden` 目录面字段）

Status: implemented

[English](2026-08-26-model-visibility-hidden-flag.md) | 中文

## Problem

模型接入得越多，选择器与设置目录就越长，而删除一条 `settings.yaml` 模型是全有或全无：删掉就丢容量元数据，想恢复就要重新核对端点文档。用户需要的是「先不看」而不是「删掉」，这个语义在两个 LLM adapter 家族里都不存在。

## Decision

给两个 adapter 的模型条目加同一个可选布尔位 `hidden`（`llm-deepseek.catalogModel`、`llm-pi-ai` 的 `modelFields`），并把它定义为**只作用于广告面**：

- 过滤点收敛在每个 adapter 自己的 `listModels()`——全部目录消费方（apiproxy 的 `session.models`/`llm.models`、tool-cordis 的 api-catalog）都经由 `ctx.llm.listModels()`，在此处收口即对所有界面一次生效。
- 精确路由不受影响：pi-ai 物化清单保留全部模型（`getModel` 不看 `hiddenIds`），deepseek 的 `resolveModel`/`resolveModelInfo` 同样照常回答。这正是 [[2026-07-15-llm-model-catalog-and-acp-selection]] 确立的 advisory 契约——隐藏一个已被选中的模型不会让会话失效。

数据流：pi-ai 侧 `resolveRouteModels` 收集 `hiddenIds` 进 `RouteCatalog`，`ResolvedPiAiProviderProfile.hiddenModels` 随 profile 快照走；deepseek 侧 catalog 条目自带标志。缺省缺席 = 展示，且写回时清除即删除键，不落 `hidden: false`。

客户端 `ui-settings-models` 在两条编辑器行上各加一枚眼睛开关（新共享组件 `ModelVisibilityToggle`）：按压态即隐藏态，隐藏行整行降透明度便于扫读；reveal 清除字段而非存 `false`，与其余可选字段「清空即离场」的惯例一致。

## Consequences

- 「隐藏但保留配置」成为一等能力：想瘦身选择器不再需要权衡删配置的风险；已记录会话里引用被隐藏模型的默认选择仍可路由。
- UI 免改的部分刻意不改：模型选择器、agent-default-model、子代理协作等消费方零改动——它们读的目录已经不含隐藏项；显式引用它们的深链、zcode 协作者 modelId 继续工作。
- 一个无效对照：把过滤放进物化层（从 piProvider.models 剔除）会把隐藏升级成禁用并使既有选中失效；否决。把过滤下推到每个前端消费方则要为每个 UI 各补一份同样的判断；否决。
- 已知预存在问题（与本次无关、留给下一轮清理）：`styles.client.spec.ts` 的下拉 chevron 门在干净树上即红（`ModelCapabilitySelect.tsx` 的 select 未带 `selectInput` 类）。

## Alternatives considered

- **每个消费者各传一个 hidden 标记到 RPC 载荷**——否决：协议变宽、载荷结构改动波及 SDK 快照，而结论与在源头少列一项完全一致。
- **仅前端 CSS/选择器过滤**——否决：API 目录（ACP、api-catalog 工具）仍会列出该模型，「隐藏」名不副实。
