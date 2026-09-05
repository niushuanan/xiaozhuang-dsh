# Agent Note：Safari Agent 历史 JSON 识别

Status: implemented

[English](2026-09-05-safari-agent-history-json.md) | 中文

## 问题

Safari 桌面应用只显示最初的用户／上下文行或空白对话，Chromium 却能展示同一份历史。WebSocket 已成功打开，但 Session 事件订阅器抛出 `Assistant stream raw chunk must be a lossless JSON object`。共享 JSON 校验器要求 V8 的单行原生构造函数文本，而 WebKit 会输出换行。因此合法的助手数据块被拒绝，后续回答和工具结果无法进入视图。桌面旧页面及刷新后的纯文本 401 又掩盖了这个独立的回放错误。

## 决策

[`hasIntrinsicConstructor`](../../../../packages/util/values/src/index.ts) 将候选构造函数的原生文本表示与当前执行引擎的 Object 或 Array 表示比较。名称和原型归属检查仍为必需。修复作用于共享 JSON 读取器，而非单个会话或产品插件，不改变任何持久事件或原始文件。

Connection 在未认证 HTML 中提供同源令牌表单，保留 HTTP 401、无正文 HEAD、已有签名 cookie 校验和根路径令牌交换。Frontend-static 以 `no-store` 提供 index HTML，并增加已认证的激活时间戳探针。页面自身的提示在重启或登录过期后提供手动重新加载入口；它不自动刷新、不清除草稿，也不证明流连接健康。

## 考虑过的替代方案

**重写或重新导入历史。** 原始回答和结果都在。改写数据不能修复引擎相关校验器，还可能产生重复或改变对话。

**跳过非法助手数据块。** 这会掩盖共同错误并主动丢弃回答，因此保留严格 JSON 校验。

**只接受 Chromium 检查。** 用户反馈发生在实际 Safari Web App。验收覆盖该应用、工具输出展开、更早分页及历史子 Agent 报告，而非只看测试浏览器或 HTTP 状态。

## 影响

普通 JSON 容器在支持的引擎和 realm 之间保持可移植；自定义类、伪造原型及有损值仍被拒绝。引擎文本格式回归测试在修复前复现故障。只读顺序内容核对覆盖全部 327 对原始／v2 文件，保留 7994 条助手消息、8454 次工具调用与 8483 条工具结果。实际桌面验收另行证明回答和结果可读。临时本机诊断不包含随产品发布的遥测，检查后移除。
