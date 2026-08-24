# ADR 0003 — JSON storage before a database

Status: Accepted

## Context

早期最重要的是验证方法和 Schema，而不是大规模查询性能。

## Decision

v1 使用 JSON 文件目录存储，不引入 SQLite、PostgreSQL 或图数据库。

## Consequences

- 易审查、diff 和版本控制；
- 并发和复杂查询能力有限；
- 状态增长后可迁移，但迁移必须保持 Schema 语义。
