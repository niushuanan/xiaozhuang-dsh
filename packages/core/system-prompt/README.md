# dsh-system-prompt

English | [中文](README.zh.md)

System prompt assembly registry. Plugins contribute ordered sections, tool schemas, and named variables. The loop assembles once per step and renders the result as the complete model prompt. This plugin owns the static harness identity and global deployment persona; an agent-scoped persona shadows the global default.

## Config

| Key | Default | Meaning |
|---|---|---|
| `includeHarnessIdentity` | `true` | Include the fixed `You are an AI agent powered by DeepSeek Harness.` order-−100 opener. Set false only when a compatibility deployment owns the complete system prompt. |
| `includeRuntimeContext` | `true` | Include ordered dynamic contexts in assembly. When false, context providers are not evaluated and contexts added by `system-prompt/assemble` listeners are discarded after the waterfall; other services and their enforcement remain active. |
| `persona` | `''` | The global deployment-persona default: the ONE config-authored prompt fragment, rendered as the order-0 `deployment:persona` section unless an agent-scoped contribution shadows it. A template — complete `{{…}}` groups are interpreted strictly against the registered variables (the shipped loop registers `{{model}}`/`{{cwd}}`), with no escape syntax for literal braces yet. Empty ⇒ the section is dropped at render. |
| `toolOrder` | — | Explicit model-facing tool order, as a list of `ToolSchema.name`s with one `'<unlisted-tools>'` rest entry (`TOOL_ORDER_REST`): listed tools take their listed position, unlisted tools land at the rest entry in lexicographic name order. Absent ⇒ plain lexicographic name order. Applied to the collected tools BEFORE the `system-prompt/assemble` waterfall — like the sections' `order` sort, it canonicalizes what the registry contributed (registration order is a plugin-load artifact), and a waterfall listener that mutates the list owns the determinism of what it emits. Misconfiguration fails loud: a list without exactly one rest entry, or with duplicates, throws at load; a listed name with no registered tool rejects every `assemble()`; a tool provider returning the reserved rest-entry name also rejects. Under the shipped loop the turn fails before any model request. Why a central list and not per-plugin weights: [Explicit model-facing tool order](../../../.agents/notes/implemented/feature/2026-07-06-explicit-tool-order.md). |

## Service: `SystemPrompt` (ctx key: `systemPrompt`)

### Public API

- `ctx.systemPrompt.section(section: PromptSection): () => void` Contribute a section. The layer is the calling context's scope: `agent.ctx` contributes to that agent alone, shadowing an ordinary same-named global section there. A `complete: true` section suppresses ordinary sections after the assembly waterfall. The one `authoritative: true` user-system section cannot be scoped-shadowed, replaces the deployment persona, survives listener mutation, and is restored immediately before the one `protected: true` deployment-owner section; the protected section also survives `complete` and renders last. Multiple effective authoritative or protected sections reject assembly. Duplicate names within one layer and non-finite orders throw. Disposed with the calling fiber.
- `ctx.systemPrompt.context(context: PromptContext): () => void` Contribute ordered dynamic context for the calling scope. Providers are evaluated for each eligible assembly and become a sourced runtime-context snapshot in model history under the shipped loop.
- `ctx.systemPrompt.suppressRuntimeContext(): () => void` Suppress every dynamic-context contribution for the calling scope. Multiple registrations compose independently; disposing the returned effect restores context when no suppressor remains.
- `ctx.systemPrompt.tools(provider: (context: AssembleContext) => ToolProviderResult): () => void` Contribute tool schemas, evaluated at each assembly with that assembly's context. `ToolProviderResult` = `{ schemas, knownNames? }`: `schemas` is the post-restriction visible set; `knownNames` is the pre-restriction universe used by `toolOrder`. A provider must not return a schema named `TOOL_ORDER_REST`. Scoped providers are consulted only for their scope's assemblies. Disposed with the calling fiber.
- `ctx.systemPrompt.variable(name: string, provider: (context) => string | undefined): () => void` Contribute a prompt variable, referenced from section text as `{{name}}`. Scoped variables shadow a same-named global for that agent. Duplicate-in-layer or unreferenceable names throw; `undefined` means "no value for this assembly". Disposed with the calling fiber.
- `ctx.systemPrompt.assemble(context?: AssembleContext): Promise<PromptAssembly>` Assemble the prompt for one caller: the global layer merged with `context.scope`'s layer, with tool schemas detached before the transform waterfall. Section text providers may be async and are evaluated for every assembly. After the scope-filtered waterfall, an effective complete section replaces ordinary sections, the authoritative user-system section and protected owner section are restored in that order, and active runtime-context suppressors are enforced. An optional `context.signal` controls this assembly request. Rejects for multiple complete, authoritative, or protected sections, invalid tool order, or a reserved rest-entry tool name.

### Live events

`system-prompt/assemble` is authoritative for ordinary sections. Complete sections constrain that ordinary set, while the single authoritative user-system section and the final protected owner section are restored after the waterfall. Listeners that replace entries must preserve any active Code Mode or structured-output protocol. Use [`ToolRuntime.restrict()`](../tools/README.md) when filtering must stay aligned across presentation, lookup, and execution. Registry-change notifications are unfiltered.

### Key types

- `AssembleContext` — what one `assemble()` call is FOR. Merge-extensible; declares `scope?: ScopeKey` (the layer selector) and `signal?: AbortSignal` (the explicit request control capability) here, while `dsh-agent` declares `agent?: Agent` (the typed DX field — never set without `scope`; use `assembleContextFor(agent, signal)`). Providers must tolerate absent fields because a bare `assemble()` carries an empty, scope-less, signal-less context. `signal` is a request value, not part of the ambient Agent execution frame.
- `PromptSection` — `{ name, order, text, interpolate?, complete?, authoritative?, protected? }`. Text providers may return a string, `undefined` to omit the section for that assembly, or a promise of either. `interpolate: false` preserves literal user-authored `{{…}}` text. Ordinary sections are sorted by `order`; one effective `complete` section suppresses other ordinary sections. The one effective authoritative section replaces the deployment persona and renders immediately before the one effective protected deployment-owner section.
- `PromptAssembly` — `{ sections: AssembledSection[], tools: ToolSchema[], variables: Record<string, string | undefined> }`. Section texts arrive resolved but not yet interpolated; `variables` holds every registered variable resolved against the context. Tool schemas are part of the assembly by design: "what the model is told it can do" is one coherent thing, even though adapters transmit schemas as a separate wire field.
- `renderPrompt(assembly)` — interpolates `{{variable}}` references in each section, drops empty sections, joins with blank lines. STRICT: an unknown reference (`Object.hasOwn` lookup — prototype names like `{{constructor}}` are unknown), a registered-but-valueless reference, a malformed complete `{{…}}` group, or a `{{` that opens no complete group while a `}}` still follows (`{{{model}}}`) throws — fail loud beats shipping a malformed prompt. A lone `{{` with no `}}` anywhere after it passes through verbatim; substituted values are never re-scanned.

Merge-extensible: plugins can declare extra fields on `PromptAssembly` and `AssembleContext` via declaration merging.

### Extension points

- Section providers: tool packages own their cross-call guidance (`tool:bash`, `tool:read`, …); this plugin owns `harness:identity` and `deployment:persona`.
- Variable providers: the agent loop registers `model` and `cwd`; any plugin can register the facts it owns (a future `date`, git state, …).
- Tool schema providers: `ToolRuntime` registers itself as a tool provider automatically.
- The [`system-prompt/assemble` waterfall](#live-events): cooperatively mutate or replace the assembly per caller before any complete-section constraint is enforced.

Design rationale: [the prompt-variables Agent Note](../../../.agents/notes/implemented/architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.md).

## Model Experience

### System prompt

#### What the model sees

By default every assembly starts with the harness identity below, then the configured persona and ordered plugin sections after strict variable interpolation. `includeHarnessIdentity: false` omits only that fixed opener. Empty sections disappear; scoped sections and variables can shadow globals for one agent. The `system-prompt/assemble` waterfall determines the delivered prompt and tool schemas unless one effective section declares itself complete; that exact section then becomes the whole system prompt while the waterfall's contexts, tools, and variables remain. One effective `authoritative` section may replace the deployment persona and is restored after the waterfall; one effective `protected` owner section is restored after it as the final DSH section. Ordered dynamic contexts are separate from system-prompt sections and become sourced user-role snapshots only when present. `includeRuntimeContext: false` or a scoped suppressor removes all such contexts, including listener additions, without disabling the services that own the underlying policy or state.

##### Harness identity

```markdown
You are an AI agent powered by DeepSeek Harness.
```

#### Token effect

Identity is a fixed per-request cost when enabled. Persona and plugin text are repeated per request and scale with their rendered content.

#### KV Cache effect

Prefix-stable while identity, persona, variables, section text, and order render identically. Any change may invalidate reuse from the first changed system-prompt token.

### Tool schemas

#### What the model sees

For shipped tools, the model receives the per-agent-visible subset of the [generated tool schemas](../../../docs/tool-catalog.md#tool-package-map), ordered by configuration or lexicographically after restrictions and assembly interception. Extensions can contribute additional definitions through the same registry. Sections and schema providers are separate assembly inputs, so a tool restriction does not remove independently registered guidance.

#### Token effect

Schema tokens repeat on every request. Restricting a tool removes its entire schema cost for that agent but not a separate prompt section; reordering changes cache shape but not semantic content.

#### KV Cache effect

Prefix-stable while the visible schema set, rendering, and order are unchanged. Registration, restriction, or reordering may invalidate reuse from the first changed schema token.

## Known Limitations and Deferred Work

- **Deployment-authored prompt text is config/composition only** — this plugin owns the global persona default, creator plugins may register agent-scoped shadows, and other sections come from the plugin that owns the fact; there is no end-user prompt-editing API.
- **No escape syntax for literal `{{…}}` braces** — every complete group is interpolated against registered variables; an escape is deferred until a real prompt needs one.
- **`toolOrder` misconfiguration surfaces at prompt assembly (the first turn), not at boot** — only shape violations throw at config load.
- **Sections sharing an `order` value tie-break by registration order** — a plugin-load artifact; determinism relies on the distinct-order band convention, unlike the canonicalized tool order.
