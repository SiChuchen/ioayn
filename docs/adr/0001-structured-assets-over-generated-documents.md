# ADR 0001 — Structured assets are authoritative

Status: Accepted

## Context

长篇 Markdown 和固定图难以支持校验、freshness、复用和个性化教学。

## Decision

Goal、Slice、Evidence 和 Unknown 使用结构化 JSON 作为权威状态。文档、图、CodeTour 和 UI 是派生视图。

## Consequences

- Schema 成为兼容性边界；
- 需要迁移机制；
- Exporter 可以多样化；
- 人工可直接审查资产。
