# Agent Note：本机浏览器免启动令牌进入

Status: implemented

[English](2026-10-06-local-browser-entry.md) | 中文

## 问题

个人桌面窗口在浏览器 cookie 到期或 Safari 遗漏已保存 cookie 时停在启动令牌表单。恢复普通本机应用需要到后台服务日志里寻找凭据。

## 决策

Connection 为 loopback 地址提供不带令牌的启动 URL。根路径 GET 仅在直接 TCP 对端为 loopback、且现有 Host／Origin／Fetch-Metadata 检查接受 loopback authority 时，自动建立或续建既有签名浏览器 cookie，随后跳转到干净的根路径。转发头和远端对端提供的 loopback Host 都不能获得本机入口。API 请求和 WebSocket upgrade 继续要求 cookie 及浏览器请求检查。

非 loopback 地址保留进程令牌交换。本决策部分取代[浏览器令牌认证](2026-08-24-browser-token-authentication.zh.md)的本机会话建立，以及 [Safari 历史恢复](../bug-fix/2026-09-05-safari-agent-history-json.zh.md)的本机登录恢复；两份说明对远端认证、cookie 校验和历史读取的决策继续有效。

## 曾考虑的替代方案

**延长 cookie 有效期。** 到期时间推迟、浏览器数据被清除或 cookie 被遗漏时，仍会要求手工恢复。

**移除全部 API 认证。** 本机浏览器自动进入可以复用已有 cookie 流程，同时保留统一的 API 和 WebSocket 校验。

## 后果

本机进程无需持有启动日志即可建立浏览器会话。本地代理或隧道也是本机对端，因此不能通过不受信任的本地转发器暴露此个人应用。清除 cookie 不会阻止本机访问，打开根路径会建立新会话。服务继续绑定 loopback，不增加网络部署模式。

验证覆盖首次本机进入、到期恢复、过时启动链接、远端与跨站拒绝、前端真实组合，以及重启前后的真实源码 CLI。桌面验收覆盖打开、刷新、退出重开及读取历史会话，全程无需输入令牌。
