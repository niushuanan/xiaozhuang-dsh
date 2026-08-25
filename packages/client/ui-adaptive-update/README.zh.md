# 自适应更新 UI

[English](README.md) | 中文

这是一个原生 Host + Client 插件，用于让 Xiaozhuang DSH 安全适配上游预览阶段的破坏性变化。

设置入口和页面标题都是**自适应更新**。开始后不会立即改动正在使用的源码。独立后台工人先锁定官方提交，在可丢弃工作树中做一次真实合并，由仍然运行的稳定版 DSH Agent 完成语义兼容审查，然后丢弃审查区，再在独立候选工作树中执行适配。

候选版本必须通过依赖安装、插件回归、Host 与 Client 类型检查、生产构建、Web 回放和最小私有 DSH Home 的影子启动。全部通过后，工人才会等待所有实时对话空闲，停止旧运行时，创建一份写时复制数据快照，把源码切到已验证的候选版本，并确认 Host 和 Client 同时就绪。若启动失败，先恢复上一个 Git 提交和数据快照，再重新打开 DSH。

审查和验证期间，对话记录、附件、凭据和用户设置始终留在原 DSH Home。完成后会删除审查工作树、候选工作树、影子 Home 和旧日志。源码版本由 Git 对象保存，保留策略最多留一份上一版写时复制数据快照，不会为每个版本复制一整套产品。

HTTP 入口只允许本机通过 `/plugins/ui-adaptive-update/api` 访问。操作状态会原子写入 DSH Home 之外，新启动的插件实例可以恢复被中断的切换，不依赖已被替换的旧进程。

## 开发验证

```sh
pnpm exec vitest run packages/client/ui-adaptive-update/tests
pnpm exec tsc -b packages/client/ui-adaptive-update/tsconfig.host.json
pnpm --filter @deepseek-ai/dsh-client-ui-adaptive-update run bundle
```

## 模型体验

### 兼容审查请求

#### 模型看到什么

稳定版 Headless DSH Agent 会收到已锁定的合并清单，包括 `conflictFiles`、`overlappingFiles`、`impactedPlugins` 和 `riskAreas`，以及“不修改可丢弃审查区、只输出中文兼容报告”的指令。

#### Token 影响

只有用户开始更新后才会产生一次独立模型请求；输入和输出长度取决于确定性清单和仓库审查。

#### KV Cache 影响

审查运行在影子 DSH Home 和独立 Headless 会话中。它不会向用户当前对话上下文追加或替换内容，因此不会让该对话的可复用前缀失效。

### 候选适配请求

#### 模型看到什么

第二个稳定版 Headless DSH Agent 会收到已完成的兼容审查报告、确定性冲突清单，以及“解决候选区、不提交、不修改真实 DSH Home、不停止当前产品”的指令。

#### Token 影响

只会为已完成审查的候选版本产生一次独立模型请求；输入包含审查报告，输出长度取决于所需的适配工作。

#### KV Cache 影响

适配使用同一个隔离影子 Home，但是一次单独的 Headless 调用。它与当前对话的 KV Cache 复用相互独立；审查报告或锁定提交改变时，只会影响这次更新请求。

## 已知限制与暂缓工作

- **需要源码工作区**——更新器需要干净的 Git 工作区、可访问的官方 Git 远程、Node.js、pnpm，以及容纳一个候选工作树的临时空间；没有仓库元数据的打包安装不能使用这条路径。
- **写时复制数据快照**——不持续增长的回滚设计需要文件系统支持 clone 或 reflink 复制。不支持的文件系统会在切换源码前失败，不会转而复制完整 DSH Home。
