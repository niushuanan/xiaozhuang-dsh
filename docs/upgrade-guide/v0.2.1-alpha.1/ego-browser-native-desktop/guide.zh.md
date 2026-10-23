---
kind: upgrade-guide
description: "Ego Browser 删除重复的 ego_cli 工具，并区分安装状态与浏览器就绪状态。"
---

# Ego Browser 工具与桌面启动

## 变更

可选的 Ego Browser 插件使用 macOS 原生桌面启动，无需 Xvfb。重复的 `ego_cli` 工具已删除。`ego_status.available` 现在表示浏览器正在运行；`installed` 表示命令行工具是否可用。工具卡片使用易读的动作名称。

## 迁移

1. 将已保存提示词中的 `ego_cli` 调用替换为 `ego_script`。本地文件与命令使用文件或终端工具。
2. 读取 `ego_status.installed` 判断是否安装，读取 `running` 判断浏览器是否就绪。未运行时，下一次导航会启动浏览器。
3. 重新构建插件并重启 DSH，打开网页、填写输入框、点击并读取结果，确认浏览器操作可用。
