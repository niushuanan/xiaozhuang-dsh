# DSH 原生划词与记忆体系实现计划

[English](2026-08-25-dsh-selection-memory.md) | 中文

> **给 Codex：** 必须使用子 Skill `superpowers:executing-plans`，逐项执行本计划。

**目标：** 交付可分别启停的“选中操作”和“记忆体系”两个 DSH 原生插件，跑通划词引用、AI 主动写记忆、双文档编辑、每日维护和相关召回。

**架构：** `memory-system` 作为 Host+Client 插件拥有固定全局文档、模型维护、会话扫描、召回和设置页；`ui-selection-actions` 作为 Client 插件拥有选区浮层和新对话引用。引用复用 DSH Input Trigger 的隐藏序列化机制；新会话复用 Workspace/Session Runtime，多对话插件提供可调用协调服务。

**技术栈：** TypeScript、React、Cordis、DSH LLM/Session Query/Client Runtime、Vitest、CSS Modules。

---

### 任务 1：原生服务接缝

**文件：**
- 修改：`packages/client/ui-multi-window/src/client/index.ts`
- 修改：`packages/client/ui-multi-window/src/client/coordinator.ts`
- 测试：`packages/client/ui-multi-window/tests/coordinator.client.spec.ts`

先写测试，给多对话插件提供最小 `multiPane.openSession(id)` Client 服务，并保证卸载时消失；不改变现有菜单和分屏行为。

### 任务 2：记忆领域与固定文档存储

**文件：**
- 新建：`packages/memory/memory-system/src/domain.ts`
- 新建：`packages/memory/memory-system/src/store.ts`
- 新建：`packages/memory/memory-system/tests/domain.spec.ts`
- 新建：`packages/memory/memory-system/tests/store.host.spec.ts`

先写失败测试，定义双文档、修订、游标、原子保存、恢复、敏感内容门禁、相关片段检索和优先级。文件固定在 DSH Home 下，不接受任意路径。

### 任务 3：模型维护、每日扫描与 Agent 召回

**文件：**
- 新建：`packages/memory/memory-system/src/model.ts`
- 新建：`packages/memory/memory-system/src/maintenance.ts`
- 新建：`packages/memory/memory-system/src/index.ts`
- 测试：`packages/memory/memory-system/tests/model.spec.ts`
- 测试：`packages/memory/memory-system/tests/maintenance.spec.ts`

复用当前会话模型路线和 Session Query。主动记忆请求维护用户文档；本地 00:00 只复盘刚结束的自然日，错过后不补跑。`agent/pre-step` 只追加相关、低权限参考上下文。

### 任务 4：双文档设置页

**文件：**
- 新建：`packages/memory/memory-system/src/client/index.ts`
- 新建：`packages/memory/memory-system/src/client/MemorySettings.tsx`
- 新建：`packages/memory/memory-system/src/client/MemorySettings.module.css`
- 测试：`packages/memory/memory-system/tests/memory-settings.client.spec.tsx`

先写组件测试，再实现两个标签页、编辑保存、冲突刷新、恢复上一版、最近维护状态和错误反馈。

### 任务 5：划词引用与主动记忆

**文件：**
- 新建：`packages/client/ui-selection-actions/src/client/selection.ts`
- 新建：`packages/client/ui-selection-actions/src/client/reference.ts`
- 新建：`packages/client/ui-selection-actions/src/client/SelectionActions.tsx`
- 新建：`packages/client/ui-selection-actions/src/client/index.ts`
- 修改：`packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx`
- 测试：`packages/client/ui-selection-actions/tests/selection.client.spec.ts`

先写用户路径测试。只在 DSH 会话范围内接受非空选区；浮层只显示两个动作。引用创建同工作区对话、写入引用 occurrence、打开并排对话且不发送；记忆发送有界选区包并展示结果。

### 任务 6：组装、插件中心与浏览器桥协议

**文件：**
- 修改：`packages/bundle/web-app/package.json`
- 修改：`packages/bundle/web-app/cordis.patch.yml`
- 修改：`tsconfig.base.json`
- 修改：`tsconfig.host.json`
- 修改：`tsconfig.client.json`
- 修改：`packages/computer-use/computer-use/assets/browser-bridge/service-worker.js`
- 修改：`~/.dsh/profiles/web/cordis.patch.yml`
- 修改：`~/.dsh/profiles/web/packages/xiaozhuang-plugins/lib/index.js`
- 修改：`~/.dsh/profiles/web/packages/xiaozhuang-plugins/lib/client.js`

注册两个独立 Loader 行和插件中心条目；给 Chrome Bridge 增加同一选区包协议。只改当前本机原生 profile，不创建平行应用。

### 任务 7：文档、构建与真实验收

**文件：**
- 新建：两个包的 README 三件套
- 修改：根目录 `README.md`、`README.zh.md`、`README.i18n.yaml`
- 修改：`PROJECT_CONTEXT.md`

运行定向 Vitest、相关 TypeScript project build、bundle/readme 门禁。最后在 `http://127.0.0.1:3080` 按真实用户路径验证划词、引用新分屏、记忆写入和双文档编辑，并审计最终 diff，不提交、不推送。
