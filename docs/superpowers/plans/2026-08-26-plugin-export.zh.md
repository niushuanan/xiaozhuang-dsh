# 插件选择导出实施计划

[English](2026-08-26-plugin-export.md) | 中文

**目标：** 在现有插件页把目录中的每个小庄插件选择性导出为一个可交给 AI 安装的 ZIP。

**规格：** [`docs/superpowers/specs/2026-08-26-plugin-export-design.zh.md`](../specs/2026-08-26-plugin-export-design.zh.md)

## 1. 建立原生包与契约

先增加 Host 定向测试，覆盖封闭选择目录、仓库／Profile 文件排除、manifest 哈希、安装说明和真实解压往返；增加 Client 测试，覆盖进入选择、选择一个、搜索状态下全选全部、取消和启动浏览器下载。实现前先确认测试失败。

## 2. 实现 Host 导出与既有插件控制

新增 `packages/client/ui-plugin-catalog/`，把当前本机的状态开关与协作者配置迁入 Host。增加仅限本机的 `POST /plugins/xiaozhuang-plugins/api/export`：校验 id、收集有界包文件、生成 manifest 与 AI 安装说明，并直接返回内存 ZIP，不在磁盘暂存数据。

## 3. 实现原生目录界面

把现有分组搜索目录迁入 React 与 CSS Modules。增加 Hero 导出操作、行内选择、明确的全目录全选、已选数量、下载进度、取消和成功／失败反馈；选择模式外保持原有插件开关不变。

## 4. 组装、文档与验证

把新包挂入 Web bundle 与 TypeScript 工程；更新包级／根目录双语 README、已实施 Agent Note、配对记录和 `PROJECT_CONTEXT.md`。构建新包与 Web UI并运行定向测试，再从本机真实插件页分别导出一个插件和全部插件；检查两个 ZIP 的必需文件与隐私／运行数据排除项，最后提交并推送当前分支。
