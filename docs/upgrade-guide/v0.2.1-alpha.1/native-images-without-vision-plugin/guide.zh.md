---
kind: upgrade-guide
description: "移除旧读图插件，内置 DeepSeek 模型修改显示名后仍保留原生图片能力。"
---

# 原生图片输入

## 变更

旧 `vision-local` 插件和 `image_vision` 工具已移除。DSH 将图片附件直接发送给支持图片的模型。配置内置 DeepSeek 模型时，省略 `inputModalities` 会继承默认输入能力；显式配置仍优先。

## 迁移

1. 从 profile 的 `cordis.patch.yml` 中删除 `vision-local` 插入项和覆盖项。
2. 从自定义依赖列表中删除 `@deepseek-ai/dsh-vision-local`，保留用户图片附件和会话历史。
3. DeepSeek V4.1（`deepseek-flash`）可省略 `inputModalities` 来继承原生能力，也可显式设置为 `[text, image]`。
4. 重启 DSH，在新建的 V4.1 对话中发送图片，确认模型直接识别。
