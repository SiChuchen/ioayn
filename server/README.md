# IOAYN MCP Server v1.1

本地 stdio MCP Server，用于在目标仓库 `.ioayn/` 下保存学习目标、切片、证据、未知项、会话、轮次、可复用知识资产和 Cognitive Atlas，并将这些资产绑定到当前 Git revision。

普通插件使用直接运行已构建的 `dist/index.js`，无需安装依赖。

## 开发

```bash
npm ci
npm run typecheck
npm run build
npm run test:smoke
```

测试覆盖：

- Goal → Session → Slice → Round → LearningAsset → Atlas 闭环；
- 两轮之间的概念与历史连接；
- 会话恢复和 Journal 查询；
- opt-in Hook capture；
- v1.0 → v1.1 migration；
- workspace 引用校验。

## 环境变量

- `IOAYN_PROJECT_DIR`：被学习仓库根目录。插件通过 `${CLAUDE_PROJECT_DIR}` 注入。

## v1.1 关键工具

- `preflight_learning`
- `init_workspace`
- `migrate_workspace`
- `start_learning_session`
- `resume_learning_session`
- `commit_learning_round`
- `resume_learning_context`
- `build_atlas_projection`
- `find_historical_connections`
- `validate_workspace`
- `freshness_report`

## 安全与可靠性属性

- 不监听网络端口；
- 不提供任意目标写入路径；
- 所有 ID 经过安全字符限制；
- 写入限制在目标项目 `.ioayn/`；
- JSON 文件通过临时文件 + rename 原子替换；
- round commit 使用稳定 ID 和事务记录，支持安全重试；
- Git 命令使用固定参数数组，不进行 shell 字符串拼接；
- stdout 仅用于 MCP 协议，日志写入 stderr；
- personal journal/session/round/checkpoint/runtime 默认 gitignored；
- raw dialogue 不会自动升级为 verified LearningAsset。

## 设计限制

当前存储以文件 JSON/JSONL 为主，适合本地单用户原型和可审计资产。高并发、多用户和服务端同步应在后续版本通过 Storage Adapter 迁移到事务数据库，而不是继续扩展文件锁语义。
