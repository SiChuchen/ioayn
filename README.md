# IOAYN — Input/Output Is All You Need

> **English overview** — IOAYN is a Claude Code plugin + local MCP server for **guided, persistent codebase learning**. Instead of starting from `main`, directory trees, or whole-repo summaries, each learning session is built around one bounded question: observable inputs and outputs, producers and consumers, boundaries and contracts. The agent is the teacher (learner-state calibration, agent-led progression, checkpoints); the learner is the decision-maker (architect persona: human cognitive zone L1–L3, deeper detail delegated to AI on demand). Every round is persisted as reusable knowledge assets, and a bounded **Cognitive Atlas** links concepts across sessions. A teacher-side project index makes anchor location an O(1) lookup. [Install](#快速使用) · [Docs](docs/) · MIT.

> **中文** — 从可观察输入与输出出发，沿真实信息流逐层理解复杂代码库，并把每次学习沉淀为可复用的认知资产。

IOAYN 是一套面向 AI Coding Agent 的代码学习方法论、Claude Code 插件和本地 MCP 框架。它不要求用户从 `main`、目录树或全仓库图开始，也不把“生成更多文档”当作理解代码。

一次 IOAYN 学习围绕一个有限问题建立：

```text
学习目标与抽象层级
→ 可观察入口
→ 输入 / 输出 / 状态 / 副作用
→ 生产者 / 转换者 / 消费者
→ 有边界的纵向学习切片
→ 事实 / 推断 / 未知 / 冲突
→ 源码与运行证据
→ 用户 checkpoint
→ 可复用知识资产
→ Cognitive Atlas 定位与历史连接
```

## v1.1.0 的核心变化

v1.1.0 将 IOAYN 从“方法论 + 基础持久化”升级为**持续学习记忆与项目认知地图**：

- MCP 预检与 `PERSISTENT / DEGRADED` 模式协议；
- L0–L5 抽象层级控制；
- 所有新函数/结构体/线程/队列必须附带上下文角色；
- `FACT / INFERENCE / UNKNOWN / CONFLICT` 与 confidence；
- 每轮实体、文件、概念和可视节点认知预算；
- `LearningSession`、`ConversationTurn`、`LearningRound`、`LearningAsset`；
- opt-in Claude Code Hooks 自动保存用户提示和 Agent 最终教学内容；
- `commit_learning_round` 可恢复、幂等的轮次提交；
- IOAYN Cognitive Atlas：系统区域、学习切片、知识资产、概念和选择性代码锚点；
- `location / connections / history / concept / gaps` 五种小型地图投影；
- 会话恢复、历史知识连接和 v1.0 → v1.1 迁移。

## 这个目录的两种身份

1. **可直接加载的 Claude Code 插件**：包含 Skills、Subagents、Hooks 与本地 stdio MCP Server。
2. **可继续开发的正式项目仓库**：包含 TypeScript 源码、生成式 JSON Schema、评测、示例、ADR、路线图和 Agent 交接文档。

## 快速使用

### 环境

- Node.js 20+
- 支持插件、Hooks 与 MCP 的新版 Claude Code
- 建议在 Git 仓库根目录启动

仓库自带已构建的 `server/dist/index.js`，普通使用无需安装 npm 依赖或构建。

### 方式一：从 GitHub 市场安装（公开，推荐）

```bash
claude plugin marketplace add SiChuchen/ioayn
claude plugin install ioayn@ioayn
```

更新：`claude plugin update ioayn@ioayn`。

### 方式二：本地开发安装

```bash
git clone https://github.com/SiChuchen/ioayn && cd ioayn
claude plugin marketplace add "$(pwd)"
claude plugin install ioayn@ioayn
```

本仓库迭代后执行 `claude plugin update ioayn@ioayn` 生效。

### 方式三：临时加载（不安装）

```bash
cd /path/to/target-project
claude --plugin-dir /path/to/ioayn
```

进入 Claude Code 后检查：

```text
/mcp
/agents
/help
```

应看到：

- `/ioayn:learn-code`
- `/ioayn:resume-learning`
- `/ioayn:view-atlas`
- MCP Server `ioayn`
- `slice-explorer`
- `runtime-verifier`
- `learning-tutor`
- `knowledge-curator`

开始学习：

```text
/ioayn:learn-code 理解任务从提交到执行器运行的完整输入输出路径
```

局部学习同样适用：

```text
/ioayn:learn-code 只理解 SchedulingContext 在当前调度路径中的生产者、消费者和字段作用
/ioayn:learn-code 追踪这个超时错误如何产生、转换并返回给调用方
/ioayn:learn-code 理解一次 Binder 请求从客户端到 System Service 的路径
/ioayn:learn-code 理解这个 ioctl 的输入如何到达驱动回调
```

恢复：

```text
/ioayn:resume-learning
```

查看认知地图：

```text
/ioayn:view-atlas atlas-asset-trunscan-live-probe
```

## 学习模式与自动记录

Skill 首先尝试调用 `preflight_learning`：

- MCP 正常时显示 `PERSISTENT`，对话、轮次、知识资产和 Atlas 可恢复；
- MCP 不可用时必须显示 `DEGRADED`，不得声称已经保存。

`start_learning_session` 是明确的 opt-in 开关。它执行后，插件 Hooks 才会自动捕获：

- 后续用户提示；
- Agent 每轮最终回复；
- compact summary；
- session lifecycle 和失败事件。

原始对话不会自动成为事实。每轮仍需通过 `commit_learning_round` 提炼为带可复用 Markdown 教学正文、来源 turn、证据、confidence 和 revision 的 `LearningAsset`。Hook 会把最终教学回复关联回对应 Round 与 Asset，便于从知识资产追溯原始交流。

## DeepSeek Harness (dsh)

IOAYN 现已作为 DeepSeek Harness（dsh）的原生插件交付（包 `ioayn-dsh`）：27 个学习工具以进程内原生工具形式注册，不走 MCP 桥。选择"IOAYN 模式"后，得到一个**专职引导式学习 agent**——任何学习意图（哪怕"我想了解这个项目"）都会主动进入有边界的学习协议，纯编码任务建议切换通用模式。journal 由 dsh 事件监听隐式捕获（marker 门控，opt-in），学习记忆与认知 Atlas 和 Claude Code 端同源同 schema。

安装两步：

```bash
dsh plugin --profile <name> add ioayn-dsh
npx ioayn-dsh install
```

详见 [`dsh/README.md`](dsh/README.md)（信任模型、已知限制与开发验证说明）。

## `.ioayn/` 目录

```text
.ioayn/
├── manifest.json
├── .gitignore
├── goals/                 # 可共享：学习目标
├── slices/                # 可共享：学习切片
├── evidence/              # 可共享：证据
├── unknowns/              # 可共享：未知项
├── assets/                # 可共享：复用知识资产
├── atlas/
│   ├── nodes/             # 可共享：认知地图节点
│   └── edges/             # 可共享：认知地图关系
├── sessions/              # 默认 gitignored：个人会话
├── rounds/                # 默认 gitignored：个人轮次历史
├── journal/               # 默认 gitignored：原始交流记录
├── checkpoints/           # 默认 gitignored
└── runtime/               # 默认 gitignored：事务、Trace、临时文件
```

项目知识与个人交流历史被明确分层：

- `assets/` 与 `atlas/` 保存可复用的项目认知；
- `journal/`、`sessions/`、`rounds/` 默认不提交，避免泄露用户交流和临时推断。

## Cognitive Atlas 的作用

Atlas 不是完成百分比，也不是全仓库调用图。它回答：

- 刚学的内容位于整个项目哪一部分；
- 它的上游、下游和所属系统区域是什么；
- 它与昨天或前一轮学习共享什么概念；
- 新知识如何 refine、connect、contradict 或 supersede 旧知识；
- 当前认知链在哪里断开。

地图默认只显示系统区域、学习切片、知识资产和概念。代码实体只有在 `map: true` 时才进入 Atlas，防止再次形成毛线团。

## 主要 MCP 工具

### 启动与版本

- `preflight_learning`
- `init_workspace`
- `migrate_workspace`
- `project_snapshot`

### 学习与证据

- `create_goal`
- `save_slice`
- `record_evidence`
- `record_unknown`

### 持续学习记忆

- `start_learning_session`
- `resume_learning_session`
- `append_conversation_turn`
- `list_session_turns`
- `finish_learning_session`
- `commit_learning_round`
- `resume_learning_context`

### Cognitive Atlas

- `upsert_atlas_node`
- `link_atlas_nodes`
- `build_atlas_projection`
- `find_historical_connections`

### 管理

- `list_learning_assets`
- `get_learning_asset`
- `close_goal`
- `reset_workspace`（需要 `confirm: "RESET"`，不可逆）
- `validate_workspace`
- `freshness_report`

### 教师侧索引（Agent 专用，不展示给学习者）

- `build_project_index`（扫描包清单/文档标题/架构笔记，随 git 修订刷新）
- `get_project_index`（O(1) 定位锚点与标本；过期即重建）

## 开发与验证

```bash
git clone https://github.com/SiChuchen/ioayn && cd ioayn
npm run setup
npm run verify
```

`verify` 依次执行：仓库一致性检查 → TypeScript strict 检查 → MCP 构建 → JSON Schema 生成 → 端到端 smoke 测试（含教师索引、紧凑响应、Atlas 自愈、journal 回填等断言）→ dsh 阶段（dsh typecheck、构建、journal/bin 单测，以及 preset 结构/技能/工具对齐/拷贝漂移/安装演练五层检查）→ 再次仓库检查。CI 在每次 push/PR 时自动运行同一套命令。

改 `SKILL.md` 可在当前会话热加载；改 Hooks、Agents 或 MCP 后执行 `claude plugin update ioayn@ioayn` 并重启会话。

`test:smoke` 包含：

- 完整 Goal → Session → Slice → Round → Asset → Atlas 闭环；
- 历史概念连接；
- 会话恢复；
- Hook 自动交流记录；
- v1.0 → v1.1 迁移；
- workspace 引用校验；
- Zod 对模板与完整 synthetic sample 的 Schema/引用校验。

## 推荐文档阅读顺序

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/00-project-charter.md`](docs/00-project-charter.md)
3. [`docs/01-methodology.md`](docs/01-methodology.md)
4. [`docs/14-learning-protocol-v1.1.md`](docs/14-learning-protocol-v1.1.md)
5. [`docs/12-persistent-learning-memory.md`](docs/12-persistent-learning-memory.md)
6. [`docs/13-cognitive-atlas.md`](docs/13-cognitive-atlas.md)
7. [`docs/03-architecture.md`](docs/03-architecture.md)
8. [`docs/04-data-model.md`](docs/04-data-model.md)
9. [`docs/05-agent-orchestration.md`](docs/05-agent-orchestration.md)
10. [`docs/15-p0-real-project-findings.md`](docs/15-p0-real-project-findings.md)
11. [`docs/07-roadmap.md`](docs/07-roadmap.md)
12. [`docs/10-agent-handoff.md`](docs/10-agent-handoff.md)
13. [`docs/16-release-scope-v1.1.md`](docs/16-release-scope-v1.1.md)
14. [`docs/17-v1.1-validation-report.md`](docs/17-v1.1-validation-report.md)

## v1.1.0 明确不包含

- 专用 Web/IDE 交互式 Atlas UI；当前提供结构化 JSON 与 Mermaid 投影；
- 通用 AST/LSP/SCIP 全语言索引；
- 自动浏览器功能探索；
- GitNexus、OpenDeepWiki、CodeQL、Joern、Perfetto 等正式 Provider Adapter；
- 自动动态插桩；
- 多用户同步、权限和服务端数据库；
- 自动判断“用户已经掌握”的评分模型；
- 自动修改产品源码的练习模式。

## 核心架构原则

> Skill 固定方法，Subagent 隔离认知工作，Hooks 保存 opt-in 原始学习过程，MCP 提供确定性持久化与 Atlas，结构化资产保存可复用知识；文档和图只是有边界的派生视图。

## License

MIT，详见 [`LICENSE`](LICENSE)。
