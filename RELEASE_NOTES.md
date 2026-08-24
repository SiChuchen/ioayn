# IOAYN v1.1.3 — 教师索引与全流程加固

发布日期：2026-08-17

v1.1.3 来自第二个完整学习目标（插件开发，3 轮）的实测与学习者中场反馈，回答一个问题：**教师为什么要每次现场探索？**

## 核心新能力：教师侧索引

`build_project_index` / `get_project_index`：一次性扫描包清单（自动识别 `dsh.bundle`/`dsh.profile`）、文档标题、架构笔记清单，存于 `.ioayn/runtime` 并锚定 git 修订。教师定位锚点与标本从"每轮现场 rg"变为 O(1) 查表。

配套的原则重述：**防毛线团不变量保护的是学习者的视野，不是教师的知识**——索引永不向学习者渲染。

## 其余加固

1. **resume 响应 compact 化**：会话/目标/轮次只回身份与状态，长教学内容截断，资产只回 id/标题/状态（全文按需 `get_learning_asset`）。
2. **migrate_workspace 幂等自愈**：清理旧模板描述、为全部既有资产回填 `SHARES_CONCEPT_WITH` 边，并报告修复量——v1.1.2 的两项改进不再只对新数据生效。
3. **状态机自动化**：commit 自动推进 `goal.current_level` 至最高已提交层级；`close_goal` 将所属切片置 `completed`。
4. **journal 归属回填**：commit 时为无归属的对话回合回填 `round_id`——初始提问与 checkpoint 答案从此自动携带轮次溯源。
5. **教学法（来自学习者中场反馈）**：比喻必须内联真实名锚点并渐进交接；流程图箭头必须标注传递内容；动手轮先给完整真实标本再填空；schema/值混淆用"空白表格/填表人"装置；同一混淆两次修复失败即换装置。

验证：typecheck / build / smoke（新增索引、紧凑恢复、Atlas 自愈、journal 回填、目标层级推进、切片完成六组断言）/ hook capture / migration / fixtures / repository checks 全部通过。

---

# IOAYN v1.1.2 — 上下文经济与 Atlas 认知网络

发布日期：2026-08-16

v1.1.2 来自首次完整学习会话的复盘数据（29 条 journal、44 节点/44 边 Atlas、5 轮 5 资产）：五个轮次的持久化开销约 25–30K tokens，且最有价值的跨轮知识连接只以隐式方式存在。本版本解决三件事：

1. **响应瘦身（约省一半持久化 token）**：`commit_learning_round` 与 `save_slice` 不再完整回显输入，只返回 id、计数、checkpoint 状态与 Atlas 更新；幂等 replay 同样返回紧凑形态。
2. **Atlas 自动节点去噪**：concept 与系统区域节点不再携带模板描述（label 即名称）；ASCII 名称的 id 本就可读（如 `concept-agent-loop`），非 ASCII 名称保持确定性 hash（id 字符集按 schema 仅限 ASCII）。
3. **自动 SHARES_CONCEPT_WITH 边**：提交的知识资产与早期资产共享至少一个概念时，自动创建显式的资产↔资产边并标注共享概念（幂等、双向去重）——跨轮认知连接从"隐式存在、靠人发现"升级为"显式图边、可查询"。实测中「一条真相」概念串联三轮资产的连接，今后会自动成为图上的一条边。

验证：typecheck / build / smoke（新增 compact 形态、描述无模板、自动共享边三组断言）/ hook capture / migration / fixtures / repository checks 全部通过。

---

# IOAYN v1.1.1 — 基于 dsh 实机测试的协议加固

发布日期：2026-08-16

v1.1.1 的全部变更来自一次完整的实机学习测试：以 DeepSeek Harness（dsh）仓库为目标，插件、Hooks 与 MCP Server 全链路连接，由真实学习者全程走查并即时反馈。本版本回答三个产品级问题：

1. **学习者是谁**——决策者/架构者。人的认知区是 L1–L3（边界、职责链、契约与设计理由）；L4/L5 属 AI 可代劳区，标记为 `deferred` + `futureTopic: ai-delegable` 而不是继续下钻。
2. **方向盘在谁手里**——agent 是老师，人是学生。survey 目标开场宣布主线，每轮结束由老师提出唯一下一站；学习者持有否决与改道权。首次接触者不再被要求在陌生疆域中做选择题。
3. **图怎么画**——用学习者的语言：功能名作主标签，真实包名只作括号注释；L1 最多 5 个粗粒度框，随轮次下降逐步精细化。

新增：

1. 学习者状态评估阶段（回访者看 Atlas 定位 + 记忆探针；零存量最多 3 个大白话校准问题）；
2. 会话生命周期闭环（SessionEnd 自动挂起捕获、`finish_learning_session` 显式关闭、`close_goal` 关闭目标）；
3. `reset_workspace`（需 `confirm: "RESET"`，不可逆）与 `preflight_learning.knowledge_summary`；
4. 子代理派发不可用时的降级路径；
5. 7 个新评测 case（校准、回访桥接、架构级教学、agent 主导、图表语言、会话隐私、agent 主导恢复）。

修复：

- `view-atlas` SKILL frontmatter YAML 解析失败（未加引号的 `: `）导致元数据被静默丢弃；
- Windows 下 esbuild banner 单引号被 cmd.exe 拆参导致构建失败；
- 缺少本地 marketplace 清单导致无法 `claude plugin install`。

验证：

- TypeScript strict typecheck、MCP bundle build、JSON Schema 生成：通过；
- 完整持久化与 Atlas smoke test（含 `close_goal`/`knowledge_summary`/`reset_workspace` 新断言）：通过；
- Hook capture、v1.0 → v1.1 migration、模板与 synthetic sample 校验：通过；
- `claude plugin validate` 与全链路 MCP 实机连接：本版在真实环境（dsh 仓库）完成。

---

# IOAYN v1.1.0 — Persistent Learning Memory & Cognitive Atlas

发布日期：2026-07-21

v1.1.0 基于第一次真实 C 项目测试完成，重点修复了四类问题：

- 新函数只有名字、没有角色；
- Agent 默认从过细层级开始；
- MCP 未连接时静默退化为普通问答；
- 学习对话、认知结果和历史连接不能持续积累。

本版本新增：

1. L0–L5 抽象层级和 checkpoint 难度约束；
2. 强制上下文角色：输入、动作、输出/副作用；
3. FACT / INFERENCE / UNKNOWN / CONFLICT 与 confidence；
4. 每轮认知预算；
5. opt-in Learning Journal 自动捕获；
6. 可复用 LearningAsset；
7. `commit_learning_round`；
8. IOAYN Cognitive Atlas 与五类 bounded projections；
9. 历史学习连接与会话恢复；
10. v1.0 workspace 迁移；
11. 可直接复用的 `LearningAsset.body_markdown` 与原始 turn provenance；
12. pause/complete 后的 session 自动发现与重新激活；
13. `.ioayn/` knowledge-only commit 不误报 stale 的 source-aware freshness；
14. round commit 幂等 replay、Hook duplicate suppression 与 Round/Asset 自动关联。

验证：

- TypeScript strict typecheck：通过；
- MCP bundle build：通过；
- 完整持久化与 Atlas smoke test：通过；
- Hook capture test：通过；
- v1.0 → v1.1 migration test：通过；
- round 幂等 replay、session resume、source freshness：通过；
- clean npm install 与 portable lockfile：通过；
- repository consistency checks：通过；
- 模板与 synthetic sample Schema/引用校验：通过；
- Claude Code 实机插件加载：当前构建环境未安装 Claude Code，需在用户环境运行 `claude plugin validate` 和真实项目第二轮 P0。

当前 Atlas 是结构化 JSON + Mermaid 投影，不是交互式 Web/IDE 地图。专用 Learning Studio 仍属于后续版本。
