# IOAYN repository instructions

本仓库同时是 Claude Code 插件和 IOAYN 正式开发目录。

开发前先阅读：

1. `AGENTS.md`
2. `docs/00-project-charter.md`
3. `docs/01-methodology.md`
4. `docs/14-learning-protocol-v1.1.md`
5. `docs/12-persistent-learning-memory.md`
6. `docs/13-cognitive-atlas.md`
7. `docs/03-architecture.md`
8. `docs/10-agent-handoff.md`

核心约束：

- 不把 IOAYN 做成全仓库总结器或全局毛线团图工具。
- 所有学习能力都必须服务于有边界、可验证、逐步教学的 Learning Slice。
- 新实体必须有当前切片中的 input → action → output/side effect 角色。
- 重要结论必须区分 FACT、INFERENCE、UNKNOWN、CONFLICT 与 confidence。
- Raw Learning Journal 不能自动视为 verified knowledge。
- Cognitive Atlas 表达认知定位和连接，不表达简单完成百分比。
- Atlas 投影必须有 focus、depth 和 node budget；代码实体默认不入图。
- Persistent 模式下每轮必须通过 `commit_learning_round` 保存；失败必须显式报告。
- Schema 改动同步更新服务端 Zod、JSON Schema、模板、示例、迁移、评测和文档。
- MCP 写入范围只能是目标项目 `.ioayn/`。
- Hooks 必须 opt-in，且个人会话数据默认 gitignored。
- 修改后执行 `npm run verify`。
- 未经用户明确要求，不运行破坏性、生产、提权、昂贵或外部写操作。
- 不得声称执行了实际未运行的 Claude Code CLI 或真实项目验证。
