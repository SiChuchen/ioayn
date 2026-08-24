# 04 — Data Model v1.1

## Schema 版本

- Plugin：`1.1.0`
- Workspace Schema：`1.1`
- v1.0 资产通过 `migrate_workspace` 备份后升级。

Zod 定义位于 `server/src/schemas.ts`，JSON Schema 由 `server/src/export-schemas.ts` 生成。

## 核心实体

### LearningGoal

包含 target、questions、scope、done_when、mode 和：

```text
abstraction.start_level
abstraction.target_level
abstraction.current_level
```

### LearningSlice

新增：

- `abstraction_level`
- `introduced_entities`
- `round_refs`
- `atlas_node_id`
- level-aware checkpoint

### Evidence

新增：

- `claim_type`
- `round_id`
- `basis_refs`

### LearningSession

表示一次可恢复的学习过程：goal/slice、current round、current level、capture 状态、外部 Claude session id 和 revision。

### ConversationTurn

表示 user / agent / tool / system 的 prompt、teaching、checkpoint、answer、tool observation、compact summary 或 lifecycle event。

### LearningRound

一次教学提交，包含：

- active question 与 level；
- introduced entities；
- typed claims；
- evidence / unknown refs；
- checkpoint；
- learning asset；
- Atlas delta；
- next actions。

### LearningAsset

长期复用的认知单元，包含可直接阅读的 `body_markdown` 教学正文、`source_turn_refs`、system area、I/O contract、key entities、concepts、claims、evidence、unknowns 和 provenance。原始 Agent 回复保存在 Journal；资产正文是经过整理、能够独立复用的版本。

### AtlasNode / AtlasEdge

节点类型：system_area、learning_slice、learning_asset、concept、code_entity、data_object、state、boundary、external_system。

代码实体不默认进入地图。

## ID 规则

```regex
^[a-z0-9][a-z0-9_-]{0,119}$
```

非 ASCII 名称使用稳定 hash fallback，避免同一中文概念生成不同节点。

## 共享与个人数据

默认可共享：goals、slices、evidence、unknowns、assets、atlas。

默认 gitignored：sessions、rounds、journal、checkpoints、runtime。

## 变更要求

Schema 修改必须同步：

1. Zod；
2. generated JSON Schema；
3. tool input；
4. templates/examples；
5. migration；
6. validation；
7. tests；
8. docs and CHANGELOG。
