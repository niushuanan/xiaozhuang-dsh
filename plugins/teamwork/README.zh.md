# Teamwork

[English](README.md) | 中文

Teamwork 拥有独立协作开关、先规划工作流、并发上限和可选外部专家。其 Cordis patch、Host 与 Client 包、素材和构建脚本都位于本目录。

插件为 Session 格式 v0 到 v2 声明历史 `teamwork/state` 兼容。只接受精确的 `{ active: boolean }` payload：它没有序号引用或生命周期依赖。迁移保留开关和事件顺序，增加 `ignorable: true`，并通过标准不可变后继机制写入。原始 Session 代际保持不变。首次迁移成功后，移除插件仍可读取当前后继。未标记的 v0/v1 源仍需要插件完成首次迁移；缺席的插件无法安全分类未知的必需历史事件。

声明通过可释放的 Cordis effect 注册，并检查迁移 API 是否存在，让没有新可选 API 的构建保留插件普通运行行为。插件不导入其他产品插件。从产品根目录运行 `node --import tsx/esm --test plugins/teamwork/packages/team-work/test/session-history.test.mjs` 即可检查源码兼容。
