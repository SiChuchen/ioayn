# 03 — Architecture v1.1

## 总体结构

```text
User
  │ /ioayn:learn-code
  ▼
Skill Orchestrator
  ├── slice-explorer
  ├── runtime-verifier
  ├── learning-tutor
  └── knowledge-curator
  │
  ├──────── Claude Code Hooks ────────┐
  │      user/assistant/session events │
  ▼                                   ▼
IOAYN MCP                         Learning Journal
  │
  ├── Goal / Slice / Evidence / Unknown
  ├── Session / Round / LearningAsset
  ├── Atlas nodes / edges / projections
  ├── Git freshness / validation / migration
  └── recoverable transaction journal
  │
  ▼
target/.ioayn/
```

## 责任边界

### Skills

- `learn-code`：完整方法和轮次协议；
- `resume-learning`：恢复历史认知；
- `view-atlas`：查询小型地图投影。

### Subagents

- `slice-explorer`：隔离搜索噪声；
- `runtime-verifier`：验证一个 claim；
- `learning-tutor`：生成一个层级一致的教学轮次；
- `knowledge-curator`：提炼资产和历史连接。

### Hooks

Hooks 只在 `start_learning_session` 激活 marker 后记录交流。它们不分析代码、不修改产品源码，也不将原始对话自动提升为事实。

### MCP

MCP 是确定性状态层：

- schema validation；
- atomic file write；
- session marker；
- round batch commit；
- Atlas graph operations；
- revision / freshness；
- migration。

## 服务端源码

```text
server/src/
├── constants.ts
├── schemas.ts
├── storage.ts
├── atlas.ts
├── export-schemas.ts
├── validate-fixtures.ts
└── index.ts
```

- `schemas.ts` 是数据模型单一来源；
- `storage.ts` 限定 `.ioayn/`、原子写、Git 与事务日志；
- `atlas.ts` 负责层级、概念和 bounded projection；
- `index.ts` 注册 MCP 工具与工作流；
- `validate-fixtures.ts` 用 Zod 校验模板与完整 synthetic workspace。

## Round commit

`commit_learning_round` 采用：

1. 全输入预验证；
2. transaction journal 标记 `prepared`；
3. 使用稳定 ID 幂等 upsert；
4. 保存 evidence、unknown、asset、Atlas、round；
5. 更新 slice/session/manifest；
6. 标记 `committed`；
7. 失败保留 `failed` journal。

JSON 多文件不宣称 ACID，但可以检测、重试和修复。

## Atlas 投影

完整 Atlas 是存储结构，不直接作为 UI。查询必须选择 `location / connections / history / concept / gaps`，并限制深度和节点数量。

## Provider 目标架构

后续扩展采用窄接口：

```text
CodeProvider
RuntimeProvider
DocumentationProvider
TraceProvider
Exporter
KnowledgeStore
```

核心 LearningAsset 和 Atlas 不依赖具体 Provider。
