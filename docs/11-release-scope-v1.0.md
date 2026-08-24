# 11 — Historical Release Scope: v1.0.0

## Release 名称

**IOAYN v1.0.0 — Foundational Release**

## 版本目的

建立正式品牌、方法论、插件骨架、核心状态模型和可运行 MCP 闭环，为后续 Agent 开发提供稳定基础。

## Included

- IOAYN 正式命名与术语；
- `/ioayn:learn-code`；
- 三个 Subagent；
- stdio MCP；
- `.ioayn/` JSON 存储；
- Goal/Slice/Evidence/Unknown；
- Git snapshot/freshness；
- workspace validation；
- Schema、模板和样例；
- 方法、架构、开发、评测、安全和 Agent handoff 文档；
- 构建与 smoke test；
- 可直接加载的构建产物。

## Not Included

- 自动仓库全量索引；
- 正式 Provider API 实现；
- 浏览器/Android/Linux 动态采集；
- Learning Studio；
- CodeTour/Mermaid Exporter；
- 多用户；
- 自动课程生成；
- 自动实践修改；
- Marketplace 发布包。

## Compatibility

- Node.js >= 20；
- Claude Code 插件目录加载；
- MCP TypeScript SDK v1；
- JSON Schema draft 2020-12。

## Known limitations

- 这是从 v1.0 包保留的历史范围记录；v1.1 构建环境未重新执行或独立验证当时的 Claude Code CLI 结果；
- 尚未完成真实大型项目端到端用户评测；
- freshness 以 commit 为粒度；
- v1 Schema 未来需要 migration 机制。

## Release acceptance

- TypeScript typecheck；
- MCP bundle build；
- MCP client smoke test；
- JSON/branding repository checks；
- zip SHA-256。
