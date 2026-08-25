# @deepseek-ai/dsh-agent-instructions

[English](README.md) | 中文

为与 `AGENTS.md` 兼容的文件提供受保护的所有者指令和逐会话工作区指引。固定的 `$DSH_HOME/AGENTS.md` 会在每次提示词组装时重新读取，并作为 DSH 可控制的唯一最高权限段落在 system prompt 末尾渲染；项目文件仍是持久的 user 角色工作区指引，保留嵌套发现与变更／移除报告。

## 生命周期

所有者段在每次 `systemPrompt.assemble()` 时读取 `$DSH_HOME/AGENTS.md`，所以保存后的修改会在每个对话的下一次模型步骤生效，无需改写历史。该段由 system-prompt 注册表保护：它能穿透 complete persona 与组装 listener，不能被同名作用域段遮蔽，并会在 system prompt 末尾按原文恢复。这是 DSH 能提供的最高权限；模型供应商策略与 DSH 外部的强制机制仍位于其上。

每个实时会话第一次符合条件的 `agent/pre-step` 会另行组合项目基线，并在下游进入非空批次时把它放在已领取提示词之后。loader 只读取从项目根到 `agent.session.header.cwd` 各目录中的基础候选文件和本地 overlay；`$DSH_HOME/AGENTS.md` 被明确排除在 user 角色历史之外。同目录中去除首尾空白后相同的候选文件会折叠到最早项。恢复后的会话会保留兼容的可见项目基线，并仅追加当前文件变化；发现、优先级、项目根或预算标识变化时，则折入一条明确取代旧基线的完整项目基线。

该插件还会观察第一方 `read`、`write` 和 `edit` 调用成功后产生的不可变 `tools/result`。每个已接受的 touch 都会检查新达到的后代 scope 以及之前加载的每个 scope。每个已配置候选名称都是所在目录中的独立 scope：新出现的文件会在 agent inbox 中排入一项新增；已改变文件会排入一项替换；文件消失或成为同一目录中较早候选文件的重复项时，会排入一则移除通知。原生调用与 Code Mode 子分派共享该路径：嵌套 touch 会沿不透明的父级执行 token 逐层上浮，直到顶层结果落定；在 agent loop（智能体循环）步骤内产生的 touch，须等持久 `step/end` 后才开始异步投影。打开的步骤之外直接执行工具时，则立即投影。这样无需依赖文件系统时序，也能保持工具调用／结果／步骤的相邻关系。这种发现跟随结构化文件系统活动，而不是 shell `cd`，因为每次本地 bash 调用都启动新 shell，解析任意 shell 语法也不可靠。

项目指令读取使用可选 `ctx.fs` 提供方；没有提供方的产品树仍可启动，项目加载会成为 no-op。所有者文件优先使用同一提供方，并在缺席时回退到 Host 文件系统，因此全局权限不依赖某个预设是否带工作区工具。解析会跟随最终组件 symlink 到常规文件目标；取消会传播到元数据探测与流式读取，提供方失败视为暂时不可用而非删除。

<a id="prompt-shape"></a>

## 提示词结构

所有者文件是最后一个受保护 system 段：

```md
<owner-directives>
The following are the DSH owner's highest-priority instructions inside DeepSeek Harness. ...

Instructions from: ~/.dsh/AGENTS.md

...
</owner-directives>
```

项目基线指令仍是持久 user 角色消息，并使用熟悉的 system-reminder 模式框定：

```md
<system-reminder>
The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.

Instructions from: AGENTS.md

...
</system-reminder>
```

新达到的 scope 使用持久的带来源 `user/message`：

```md
<system-reminder>
Additional instructions from: packages/app/AGENTS.md

These instructions apply to work under `packages/app`. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.

...
</system-reminder>
```

同一文件的编辑以 `Updated instructions from: <path>` 开头，并说明使用新内容替代之前加载的内容。候选文件消失或成为同一目录中较早候选文件的重复项时，消息是 `Instructions removed: <path>`，后跟 `The previously loaded instructions from this file no longer apply.`。指令内容或模型可见的路径、scope 与预算元数据中出现的字面 `</system-reminder>` 文本都会转义，因此仓库控制的文本无法关闭插件控制的框架。

该插件控制完整的 `<system-reminder>` 框架，每个注入的 `user/message` 都不经核心包装便原样传给模型。

## 状态与刷新

模型可见文本不含隐藏状态标记。每个基线或动态上下文事件改为携带带类型的 `agent-instructions` 来源，其中包含 `{ action, scope, path, digest? }` 变更列表；完整基线还会携带 `baseline: true`，以及从规范化的发现、优先级、项目根目录和预算配置派生的 `baselineIdentity`。匹配的持久 `user/message` 会确认已排队基线及其候选版本。进入步骤的 pre-step 会等待所有已排队投影完成，再把新组合的上下文折入最终批次，位置紧随已领取的消息，并移除 inbox 中仍待处理的副本；若被拒绝，当前上下文则继续排队。若监听器改写掉已领取的 workspace 消息，又没有让替代消息进入，后续边界会重新组合当前上下文。即使后续复合结果被拦截，成功的嵌套文件 touch 也会聚合到父级执行 token 下；顶层结果会将这些 touch 交给当前打开的会话步骤，或直接交给逐 agent 投影队列。`step/end` 只会在自身边界进入持久历史后释放其暂存的 touch；串行投影会根据可见会话事件和当前 inbox 协调状态，再替换唯一一条待处理工作区上下文。

路径与 SHA-1 内容 digest 都未变时，不会重复注入。每会话、每 scope 提供方 cache 只存储 `{ path, version, digest, trimmedDigest }`：当提供方的不透明 `FsVersion` 与有效可见状态都匹配时，对账会跳过内容读取；版本改变会在任何模型可见更新之前触发有界读取与 SHA-1 确认。`trimmedDigest` 是针对去除空白后内容的 SHA-1，也是每目录重复 key，因此较早候选文件与某个未更改文件的内容收敛后，后者仍可被移除。恢复可行，因为 SHA-1 状态持久化在带类型的来源中，而空的内存版本 cache 只会导致一次确认读取。压缩（compaction）会在 scope 的上下文事件离开可见表层后重新启用它，即使缓存版本未变。移除是 tombstone，因此候选文件之后重新出现时会重新加载。模型可见变更只有在对应文件专属段落保留至少一个内容字节，或原始内容确实为空时，才会进入来源、pending 状态和版本 cache。只要任一内容字节保留下来，部分截断就会记录完整内容的 digest；截断到零字节则仍可在后续 touch 处理，而相同 digest 的版本刷新只更新提供方 cache。基线即使带空变更列表，仍可发布字节预算诊断。动态批次若没有可提交变更，则完全不注入，并在后续 touch 时重试。

初始基线事件自身不会被改写。其带类型的变更仅在该事件仍位于可见会话表层时才是权威状态。当压缩遮蔽该事件时，下一次进入步骤的 pre-step 会组合当前基线，并在同一请求中记录它；也可以改由一次成功的文件系统 touch 重新添加未变的基线 scope，或追加其替换或移除。内存中的 scope 标记和提供方版本 cache 只负责选择探测对象并加速探测。恢复或插件热重挂后的第一次 pre-step 会保留兼容的可见基线，并将它与当前完整渲染所保留的文件进行比较。未变化和被预算省略的文件不追加任何内容；agent 离线期间新增、编辑、移除或不再属于预算保留集的文件会追加 `set`、`replace` 或 `remove` 转换。不兼容的可见基线会被一条完整的当前基线取代；如果没有候选文件，这条当前基线会是显式空基线。没有文件 watcher，因此磁盘变更会在下一次成功 `read`、`write` 或 `edit` touch 时可见，也会在恢复后的会话对账其基线时，或进入步骤的 pre-step 恢复被遮蔽的基线时可见。

## 配置

```ts
export interface Config {
  dshHome?: string
  projectRootMarkers?: string[]
  maxBytes: number
  maxSourceBytes?: number
  includeOwnerInstructions?: boolean
  includeWorkspaceInstructions?: boolean
  instructionFileCandidates?: string[]
  localInstructionFileCandidates?: string[]
}
```

`maxBytes` 必填，并同时限制所有者段和每个项目上下文批次。`maxSourceBytes` 在渲染前限制每个源文件，默认为 1 MiB。`includeOwnerInstructions` 与 `includeWorkspaceInstructions` 均默认为 `true`，因此随附 Web 组合可以让 Host 级实例独占所有者读取，而预设级实例只负责项目指引。`projectRootMarkers` 默认为 `['.git']`；项目候选和 overlay 默认值仍为 `['AGENTS.md', 'CLAUDE.md']` 与 `['AGENTS.local.md', 'CLAUDE.local.md']`。

所有者文件始终是 `$DSH_HOME/AGENTS.md`，没有本地 overlay；两个候选列表只控制项目 scope。`$DSH_HOME` 默认为 `~/.dsh`。非正数或非有限预算会同时禁用所有者与工作区渲染；已配置 `maxSourceBytes` 必须是正整数。

## 预算与有界读取

渲染会优先保留最具体的指令文件。它会先丢弃完整的较宽泛文件，再截断最具体文件，并发出可见 `Workspace instruction budget ...` 通知，其中指名已省略与已截断路径。渲染后字节数绝不超过 `maxBytes`。

即使提供方元数据省略大小，或文件在元数据探测后增长，指令内容仍会通过 `streamText()` 在 `maxSourceBytes` 下读取。超大文件会被忽略；在动态对账期间，它会暂时不可用，而不是被移除。该插件不保留进程级 cache，绝不缓存指令文本。其会话本地 scope cache 只将提供方版本用作快速失效信号；失效后，对有界读取计算的 SHA-1 仍是存储在结构化消息来源中的跨提供方内容标识。

## 模型体验

### 基线上下文

#### 模型看到的内容

每个模型步骤都会把当前有界所有者文件作为最后一个受保护 system 段。第一次请求还会收到一条仅含项目指令链的持久 user 角色消息；可见项目基线兼容时，恢复会复用该消息。

##### 基线指令模板

```markdown
<system-reminder>
The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.

Instructions from: AGENTS.md

<project-instructions>
</system-reminder>
```

#### Token 影响

渲染后基线只追加一次，并保留在派生历史中直到压缩。`maxBytes` 会限制完整消息，较宽泛文件在最具体文件截断之前被省略，空指令链不产生 token。

#### KV Cache 影响

仅追加，位于现有可复用前缀之后。可见基线标识兼容时，恢复会保持复用；不兼容的标识会追加一条完整的替代基线，因此发现、优先级、项目根目录或预算变更只会从该历史位置起影响复用。

### 新发现的 scope 上下文

#### 模型看到的内容

成功的第一方文件系统调用达到更深目录后，下一个请求会包含一条保留的带来源 `user/message`，其中包含新适用的指令文件。

##### 附加指令模板

```markdown
<system-reminder>
Additional instructions from: packages/app/AGENTS.md

These instructions apply to work under `packages/app`. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.

<nested-instructions>
</system-reminder>
```

#### Token 影响

每个已发现 scope 都会添加有界历史 token，直到压缩。可见会话状态与版本／digest 比较会抑制未更改内容，Code Mode 将同一消息延迟至外层 `run_code` 结果及其所属持久步骤之后。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使现有 KV-cache 条目失效。

### 已改变或移除的指令上下文

#### 模型看到的内容

已改变文件会产生 `Updated instructions from: <path>` 加替换内容。消失或成为同一目录中较早候选文件重复项的候选文件会产生下方移除通知。

##### 移除通知

```markdown
<system-reminder>
Instructions removed: packages/app/AGENTS.md

The previously loaded instructions from this file no longer apply.
</system-reminder>
```

#### Token 影响

每项已确认变更或移除都是一条受 `maxBytes` 限制的保留历史消息。提供方失败不添加消息，预算省略的更新仍可在后续文件系统 touch 中处理。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使现有 KV-cache 条目失效。

## 已知限制与暂缓事项

- **发现跟随结构化 fs 工具，而非 shell 导航**：更改目录的 `bash` 命令不会触发嵌套指令发现，因为 shell 语法与每次调用 shell 状态不是可靠的文件系统 seam。
- **项目刷新由 touch 驱动**：项目文件编辑会在下一次成功的第一方 `read`、`write` 或 `edit`、恢复对账或 pre-step 恢复被遮蔽基线时可见。所有者 `$DSH_HOME/AGENTS.md` 不同：它会在每次提示词组装时重新读取，因此下一次模型步骤即生效。
- **候选语义有意保持简单**：不解释小写名称、`.claude/rules/` 与 `@path` import；项目 scope 默认加载 `AGENTS.local.md`／`CLAUDE.local.md` overlay，但用户全局 `$DSH_HOME` scope 没有本地 overlay，其他自定义名称需要显式候选配置。
- **每目录去重基于内容**：只有在去除首尾空白后字节完全一致时，才折叠同级候选文件。`CLAUDE.md` 若 symlink 到同级 `AGENTS.md`，会解析为相同内容，并像任何重复项一样折叠；从 `AGENTS.md` 漂移的独立实体副本则会与它一起完整加载。
- **Symlink 指令文件会跨越信任边界跟随**：最终组件是 symlink 的候选文件会被解析并加载其目标，因此克隆仓库可以将树外文件内容呈现为较低优先级的工作区指引（它绝不会覆盖 system、developer 或用户直接下达的指令）。加载不受信任仓库时，请用文件系统策略门禁或 OS 沙箱限制 `ctx.fs`。
- **指令内容受限但不会被摘要**：超出预算的宽泛文件会被省略，最具体文件可能被截断；该插件绝不请求模型压缩指令文本。
