# Skill Management UI

English | [中文](README.zh.md)

`@deepseek-ai/dsh-client-ui-skill-manager` owns the native **Skill Management** Settings page. The Client lists current Skills, opens their files without leaving the page, and submits local files, folders, ZIP archives, or a GitHub repository URL for personal installation. The Host resolves the same preset-scoped Skill registry as the active work Session, previews only files owned by the selected Skill, and installs only into `$DSH_HOME/skills`. If pure Chat is selected, management falls back to the latest work Session so installed Skills remain visible without granting Chat any Skill capability.

## Sources and inspection

The page groups `user-dsh` and `user-agents` as personal, `project-dsh` and `project-agents` as project, and shows runtime, custom, and bundled sources separately. Only personal rows are writable. Project, runtime, custom, and bundled rows are read-only. A selected directory Skill shows a file tree and renders Markdown, text, code, and raster images; other binary files show type and size metadata. Hidden files and symbolic links are not exposed through directory preview.

## Import and installation

`POST /plugins/skill-manager/api/import` accepts browser file data or a plain `https://github.com/<owner>/<repository>` URL from a loopback, same-origin page. Browser folder imports preserve `webkitRelativePath`. ZIP entries are validated before extraction, and GitHub imports use a shallow, single-branch clone without tags. Each operation stays in a temporary `$DSH_HOME/tmp/skill-import-*` directory and is removed after success or failure.

Imported repositories and files are untrusted data. The Host rejects path traversal and symbolic links, caps file count and bytes, and excludes common credential and secret filenames from model input. It calls only `deepseek-official/deepseek-v4-flash-vision-exp` with an explicit empty tool list. The model returns one `SKILL.md` plus validated mappings to staged resources; it cannot execute imported code or choose another model. When the normalized name already exists, only that Skill's direct definition is added to a second normalization call.

The Host validates the final name, frontmatter, and resource paths before writing a same-filesystem candidate directory. Replacing a personal Skill first renames the original to a private backup, swaps the candidate into place, and restores the original if the swap fails. Project and bundled directories are never modified.

## Composition

The Host requires WebServer, `ctx.skills`, `ctx.llm`, Sessions, Agents, and Agent Presets. Requests carry the active work Session id so the page resolves the same cwd, live Agent, preset, and scoped registry as the composer. The Client uses the selected Session directly unless it is pure Chat; in that case it picks the newest non-Chat Session from the existing Session list. It falls back to `Config.cwd` and the global registry only when no usable work Session exists. `Config.dshHome` selects the personal destination and otherwise follows the standard DSH Home resolver. The Client requires the Settings slot registry and Session service. The package contributes section id `skill`, ordered after the native Xiaozhuang plugin catalog.

## Model Experience

### Auxiliary Skill normalization

#### What the model sees

The fixed `deepseek-official/deepseek-v4-flash-vision-exp` request sees the bounded staged file list and inline text, framed as untrusted data. A same-name conflict causes one second request that additionally sees only that existing Skill's name, description, and instruction body. The request has no tools and does not join a user conversation or Session log.

#### Token effect

One auxiliary call consumes the bounded imported text; a same-name conflict consumes one additional call. Binary resources contribute only path and size metadata. Installed content becomes model-visible only later through the existing Skill registry and Skill consumer.

#### KV Cache effect

The auxiliary calls are independent from the active conversation and do not rewrite its cache. Each import's staged file JSON changes the auxiliary request, while the fixed system instruction remains reusable subject to provider caching.

## Known Limitations and Deferred Work

- The catalog shows the winning Skill for each name because `ctx.skills` resolves provider precedence before this package reads it; shadowed duplicates are not separately inspectable.
- Raster images are previewed but reach normalization as resource metadata in this first implementation; the original bytes remain available for validated resource copying.
- Import is one synchronous request. The page reports completion or failure but does not persist a background progress history.
