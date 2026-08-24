# ADR 0002 — Use a local stdio MCP server in v1

Status: Accepted

## Context

IOAYN 需要访问当前本地仓库并持久化状态，但不需要网络服务。

## Decision

v1 使用 Claude Code 启动的本地 stdio MCP Server，写入限制在目标仓库 `.ioayn/`。

## Consequences

- 部署简单、无监听端口；
- 生命周期跟随客户端；
- 远程、多用户和长期任务留待后续；
- stdout 必须只传输协议消息。
