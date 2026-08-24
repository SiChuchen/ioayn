# Contributing to IOAYN

## 开发环境

- Node.js 20+
- npm 10+
- Git
- 可选但推荐：Claude Code，用于插件、Hooks 和 Skill 端到端验证

初始化：

```bash
npm run setup
npm run verify
```

## 开发前阅读

1. `AGENTS.md`
2. `docs/00-project-charter.md`
3. `docs/01-methodology.md`
4. `docs/14-learning-protocol-v1.1.md`
5. `docs/12-persistent-learning-memory.md`
6. `docs/13-cognitive-atlas.md`
7. `docs/03-architecture.md`
8. `docs/10-agent-handoff.md`

## 分支与提交

建议按能力边界组织提交：

- `method:` 方法论与 Skill
- `agent:` Subagent 编排
- `mcp:` MCP Server 与工具
- `memory:` Journal、Session、Round 和知识资产
- `atlas:` Cognitive Atlas 与投影
- `schema:` 数据模型与迁移
- `provider:` 代码或运行时 Provider
- `hook:` opt-in 自动记录
- `export:` 派生视图
- `docs:` 文档
- `eval:` 评测

## Pull Request 最低要求

- 说明用户学习问题和预期行为。
- 说明影响的 protocol state、数据模型和隐私边界。
- 更新对应评测用例。
- `npm run verify` 通过。
- Schema 变更同步更新 Zod、JSON Schema、模板、示例、迁移和文档。
- MCP 写操作说明幂等性、失败行为和写入范围。
- 新 Atlas 关系说明语义、方向、confidence 和 evidence 规则。
- 新 Hook 说明何时激活、保存什么、如何退出以及敏感数据风险。
- 新工具必须说明为什么不能由现有窄工具组合完成。

## 设计审查问题

1. 该功能是否帮助用户建立有限、可验证的局部心智模型？
2. 是否会诱导 Agent 扫描整个仓库或生成全量毛线团图？
3. 新实体是否有当前切片中的上下文角色？
4. 是否把 inference 冒充 fact？
5. 是否能够绑定 revision、evidence、confidence 和 provenance？
6. 是否区分 raw journal 与 curated asset？
7. Atlas 连接是否帮助定位和关联，而不是仅表达进度？
8. 是否保持 Provider 可替换？
9. 是否增加了不必要的自动执行、隐私或外部写风险？
10. 是否有可执行的行为评测与真实项目验证计划？

## 发布前

```bash
npm run verify
```

随后在安装了 Claude Code 的环境中运行插件验证并进行一次真实仓库会话：

```bash
claude --plugin-dir /path/to/ioayn
```

确认 MCP、Skills、Subagents 和 Hooks 均可见，并完成至少一个持久化 round、恢复和 Atlas 投影。不要在未实际运行的情况下把 Claude CLI 验证记录为 passed。
