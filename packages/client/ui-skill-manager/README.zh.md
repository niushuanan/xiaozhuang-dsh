# Skill 管理 UI

[English](README.md) | 中文

`@deepseek-ai/dsh-client-ui-skill-manager` 持有原生的 **Skill** 设置页。Client 列出当前 Skill，在同一页打开其文件，并提交本地文件、文件夹、ZIP 压缩包或 GitHub 仓库 URL 安装成个人 Skill。Host 解析与当前 Session 相同的预设级 Skill 注册表，只预览所选 Skill 自己的文件，并且只能安装到 `$DSH_HOME/skills`。

## 来源与查看

页面把 `user-dsh` 和 `user-agents` 归为个人来源，把 `project-dsh` 和 `project-agents` 归为项目来源，并单独显示运行时、自定义和内置来源。只有个人项可写；项目、运行时、自定义和内置项均只读。选中目录型 Skill 后，页面显示文件树，并渲染 Markdown、文本、代码和栅格图片；其他二进制文件只显示类型与大小。目录预览不会暴露隐藏文件或符号链接。

## 导入与安装

`POST /plugins/skill-manager/api/import` 只接受本机同源页面提交的浏览器文件数据，或普通的 `https://github.com/<owner>/<repository>` URL。浏览器文件夹导入保留 `webkitRelativePath`。ZIP 会在解压前校验每个条目；GitHub 只做无 tag 的单分支浅克隆。每次操作只使用临时的 `$DSH_HOME/tmp/skill-import-*` 目录，无论成功或失败都会删除。

导入的仓库和文件一律是不可信数据。Host 拒绝路径穿越与符号链接，限制文件数和总字节，并不把常见凭据或密钥文件名送给模型。它只调用 `deepseek-official/deepseek-v4-flash-vision-exp`，且工具列表显式为空。模型返回一份 `SKILL.md` 和指向暂存资源的受校验映射；它不能执行导入代码，也不能选择其他模型。归一后的名称已存在时，第二次归一只增加该同名 Skill 的直接定义。

Host 在写入前校验最终名称、frontmatter 和资源路径，再在同一文件系统创建候选目录。替换个人 Skill 时，Host 先把原目录重命名成私有备份，再将候选目录切换到正式位置；切换失败会恢复原目录。项目和内置目录永远不会被修改。

## 组装

Host 需要 WebServer、`ctx.skills`、`ctx.llm`、Sessions、Agents 和 Agent Presets。请求携带当前 Session id，因此页面会解析与输入框一致的 cwd、实时 Agent、预设和作用域注册表；只有不存在可用 Session 时，才回退到 `Config.cwd` 与全局注册表。`Config.dshHome` 选择个人安装目标，否则遵循标准 DSH Home 解析器。Client 需要 Settings Slot 注册表与 Session 服务。该包贡献 id 为 `skill` 的设置分区，排在原生“小庄的插件”目录之后。

## 模型体验

### 辅助 Skill 归一

#### 模型看到什么

固定的 `deepseek-official/deepseek-v4-flash-vision-exp` 请求会看到受大小限制的暂存文件列表和内联文本，并被明确告知这些内容是不可信数据。同名冲突会触发第二次请求，且只额外提供现有同名 Skill 的名称、说明和指令正文。请求没有工具，也不会进入用户对话或 Session log。

#### Token 影响

一次辅助调用会消耗受限的导入文本；同名冲突会再消耗一次调用。二进制资源只提供路径和大小元信息。安装后的内容只会在之后通过现有 Skill 注册表和 Skill 消费者进入模型上下文。

#### KV Cache 影响

辅助调用独立于当前对话，不会改写其缓存。每次导入的暂存文件 JSON 会改变辅助请求；固定系统指令是否复用缓存取决于模型提供方。

## 已知限制与延后工作

- 目录只显示每个名称最终胜出的 Skill，因为 `ctx.skills` 会在该包读取之前解决 Provider 优先级；被覆盖的同名项不能单独查看。
- 首版会预览栅格图片，但归一时只把它们作为资源元信息交给模型；原始字节仍可供受校验的资源复制使用。
- 导入是一次同步请求。页面显示完成或失败，但不持久化后台进度历史。
