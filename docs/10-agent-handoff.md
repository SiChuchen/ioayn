# 10 — Agent Handoff v1.1

## 一句话状态

IOAYN 已从一次性引导方法升级为可保存交流、提炼知识、跨会话连接并显示认知位置的本地插件框架；下一步是用真实项目验证完整工具链，而不是继续增加文档或全局图。

## 已完成

- 3 Skills、4 Subagents、Hooks、stdio MCP；
- L0–L5 与 contextual role protocol；
- typed claims / confidence / unknown；
- Session、Journal、Round、LearningAsset；
- Atlas、system area、concept、history connection；
- bounded Mermaid projections；
- resume、freshness、validation、v1.0 migration；
- Zod → JSON Schema；
- MCP/Hook/migration smoke tests。

## 最高优先级

### P0 — WVSS 完整复测

复用“存活探测 I/O 路径”，验证：

1. preflight；
2. active session + Hooks；
3. 每个函数角色；
4. round commit；
5. `.ioayn/assets` 与 Atlas；
6. 退出/恢复；
7. 修改源码后的 freshness。

### P1 — Tool reliability

- transaction repair / replay；
- duplicate Hook turn detection；
- round index and checkpoint consistency；
- Atlas orphan detection；
- knowledge asset revision/supersede workflow。

### P2 — CodeProvider

先做 symbol/reference/local call path，不做全仓库可视图。

## 已知限制

- 自动 Hooks 只能保存 Claude Code 提供的最终 assistant message，不包含模型内部思考；
- JSON 多文件 round commit 是 recoverable/idempotent，不是数据库 ACID；
- Atlas 当前无交互式 UI；
- system-area 和 concept 连接仍由 Agent/curator 提议；
- commit-level freshness 粗于 symbol-level invalidation；
- 本构建环境没有 Claude Code，未执行实机 plugin validate。

## 修改前必读

`AGENTS.md`、docs 00/01/03/04/12/13/14/15/16。

## 禁止事项

- 先开发大型前端再验证数据模型；
- 把所有函数自动加入 Atlas；
- 自动提交 Journal；
- 用生成 Wiki 代替 evidence；
- 无迁移地修改 schema；
- 以“内容更多”作为成功指标。
