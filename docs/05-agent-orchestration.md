# 05 — Agent Orchestration v1.1

## 主循环

```text
preflight
→ migrate / init
→ resume or create goal
→ start session
→ explorer
→ save slice
→ tutor
→ optional verifier
→ curator
→ commit round
→ show Atlas delta
→ wait for next choice
```

## Preflight

Skill 必须先尝试 `preflight_learning`：

- 成功：显示 `PERSISTENT`；
- MCP 不可用：显示 `DEGRADED`，明确不能持久化；
- schema 旧：先迁移；
- 有 session：先恢复上下文，不从零分析。

## Explorer 契约

Explorer 接收目标、范围、层级和已有资产，返回：

- 最佳 anchor；
- 5–12 节点分析路径；
- 适合下一教学轮次的 ≤5 个实体；
- 每个实体的上下文角色；
- claim / unknown / confidence；
- source evidence 与验证建议。

## Tutor 契约

Tutor 每轮只解决一个主要问题。用户侧必须看到：

- 当前 level；
- ≤8 节点小型路径；
- 新实体角色表；
- typed claims；
- ≤2 个主要源码位置；
- level-aware checkpoint；
- 下一步选择。

## Verifier 契约

只验证一个 bounded claim。优先已有聚焦测试和本地 fixture。需要生产、提权、外部写、昂贵或长时间执行时回到主 Agent 请求批准。

## Curator 契约

将本轮对话和证据提炼为：

- 一个带 `bodyMarkdown` 可复用教学正文的 LearningAsset；
- system-area path；
- 概念；
- 需要进入 Atlas 的少量锚点；
- 与历史资产的关系；
- 当前认知断点。

Curator 不逐字复制整段对话，而是保留能够独立阅读的核心教学解释，并通过 `source_turn_refs` 回到原始交流；不把所有函数加入地图。

## Round commit

主 Agent 必须把教学、checkpoint 和 curator 结果交给 `commit_learning_round`。工具成功后才能说“本轮已保存”。

## Atlas delta

每轮结束说明：

- 新增了哪个知识节点；
- 它位于哪个 system area；
- 与前面哪个资产连接；
- 共享什么概念；
- 哪条链仍未连接；
- 推荐的下一条路径。

## 失败恢复

- MCP 不可用：降级但不伪造持久化；
- commit 失败：保留 transaction journal，明确报告；
- 运行与静态冲突：生成 CONFLICT claim；
- 代码 revision 变化：标记 stale，不自动删除历史资产；
- checkpoint 错误：用证据修复模型，再让用户重建路径。
