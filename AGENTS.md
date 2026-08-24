# IOAYN Agent Development Guide v1.1

本文件是继续开发 IOAYN 的 Agent 的最高层约束。修改前必须阅读：

1. `docs/00-project-charter.md`
2. `docs/01-methodology.md`
3. `docs/14-learning-protocol-v1.1.md`
4. `docs/12-persistent-learning-memory.md`
5. `docs/13-cognitive-atlas.md`
6. `docs/03-architecture.md`
7. `docs/10-agent-handoff.md`

## 项目使命

IOAYN 要让 Agent 围绕有限学习目标，从输入、输出、状态和生产消费关系出发，带领用户形成可验证、可恢复、可连接的代码心智模型，而不是生成更长的仓库总结。

## 不可破坏的 v1.1 不变量

1. **目标优先**：不默认从 `main`、目录树或全仓库总结开始。
2. **层级明确**：所有学习轮次和 checkpoint 标记 L0–L5。
3. **契约优先**：任何新实体必须有当前切片中的角色；名称本身不是知识。
4. **I/O 主线**：描述生产者、输入、转换、状态、副作用、输出和消费者。
5. **认知预算**：默认每轮不超过 5 个新实体、3 个文件、3 个概念、8 个可视节点。
6. **可保留未知**：区分 blocking、non_blocking、deferred。
7. **认知类型显式**：区分 FACT、INFERENCE、UNKNOWN、CONFLICT 和 confidence。
8. **证据与 revision**：长期结论必须可回到当前或历史代码版本。
9. **轮次必须提交**：完成教学后调用 `commit_learning_round`；失败必须显式暴露。
10. **原始交流不等于事实**：Journal 是过程，LearningAsset 才是经过提炼的认知结果。
11. **Atlas 不是进度条**：它用于定位、连接、refine、冲突和认知断点。
12. **禁止毛线团图**：默认投影最多 12 节点，代码实体选择性进入 Atlas。
13. **隐私 opt-in**：只有活跃 LearningSession 才允许 Hooks 捕获交流。
14. **结构化状态权威**：Markdown、Mermaid、CodeTour 和未来 UI 都是派生视图。
15. **Provider 可替换**：核心不能依赖某个索引器、IDE、模型或追踪器。

## 当前实现边界

v1.1.0 已实现：

- 3 个 Skills、4 个 Subagents、插件 Hooks、本地 stdio MCP；
- JSON 存储与 v1.0 迁移；
- Session、Journal、Round、LearningAsset、Atlas；
- bounded Atlas projections；
- Git freshness、校验、自动 Hook 捕获与 smoke tests。

尚未实现：

- LSP/Tree-sitter/GitNexus 等 CodeProvider；
- Perfetto/Chrome/AppMap 等 RuntimeProvider；
- 交互式 Learning Studio；
- 多用户同步与权限。

## 修改流程

1. 写明用户学习问题，而不是技术功能名称。
2. 标注影响的方法论不变量。
3. 判断变更属于 Skill、Agent、Hook、MCP、Schema、Provider、Exporter 或 UI。
4. 行为变化先修改 `skills/learn-code/evals/cases.json`。
5. Schema 变化先设计迁移和 backward compatibility。
6. 实现最小可验证变更。
7. 运行 `npm run verify`。
8. 更新文档、CHANGELOG、RELEASE_NOTES、BUILD_INFO。
9. 检查隐私、revision、Atlas 密度和故障降级。

## 代码规范

- Node.js >= 20，TypeScript strict。
- MCP stdout 只能承载协议；日志写 stderr。
- 产品源码不得被 MCP 写入。
- 项目持久化只允许 `.ioayn/`。
- 任意路径写入、shell 拼接和无边界工具禁止。
- Hook 脚本必须在 marker 未激活时零副作用退出。
- Round commit 必须幂等，失败保留 transaction journal。
- 新工具应窄、确定、可验证；禁止 `analyze_entire_repository`。
- Zod 是 Schema 单一来源；运行 `server/src/export-schemas.ts` 生成 JSON Schema。

## 需要 ADR 的变更

- 核心实体、关系或状态机改变；
- JSON → SQLite/PostgreSQL/图数据库；
- 原始交流默认共享；
- Atlas 默认引入大量代码节点；
- 网络 MCP、认证或远程同步；
- 自动执行用户代码、网络写或动态插桩；
- UI 成为主状态来源。

## 交付说明模板

```text
目标用户问题：
影响的 IOAYN 原则：
数据/协议变更：
隐私与安全影响：
迁移策略：
修改文件：
新增评测：
执行验证：
已知限制：
下一步：
```
