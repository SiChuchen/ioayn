# 08 — Evaluation Plan v1.1

## 两类评测

1. **框架执行评测**：Skill、MCP、Hooks、Subagents 是否执行协议；
2. **学习效果评测**：用户是否更快形成可迁移的心智模型。

## 必测行为

- preflight 与模式显式；
- 首轮确认 L0–L5 起止层级；
- 新实体都有上下文角色；
- FACT / INFERENCE / UNKNOWN / CONFLICT 显式；
- unknown 分类；
- 认知预算；
- checkpoint level 一致；
- 每轮 commit；
- Atlas delta；
- 新会话 resume；
- stale revision 识别。

## v1.1 Release Gate

真实测试必须证明：

1. `.ioayn/` 产生 Session、Journal、Round、Asset、Atlas；
2. 退出并恢复后不从零开始；
3. 今天的资产能和昨天的资产建立解释明确的连接；
4. 代码改动后旧资产被标记 stale；
5. MCP 失效时用户看到 DEGRADED；
6. 地图投影 ≤12 节点且每个节点有语义。

## 用户理解指标

- 端到端路径复述准确率；
- 关键契约解释准确率；
- 变化/失败预测；
- 无关文件数量；
- 完成时间与 token；
- 一天/一周后恢复速度；
- 能否指出当前知识在系统中的位置；
- 能否解释两次学习的连接。

## P0 回归场景

WVSS engine-analysis：

```text
引擎宏观 I/O
→ Trunscan 调度
→ libsping sender / receiver
→ queue / fork 语义
```

必须回归：函数角色、宏观层级优先、explicit unknown、信息预算、checkpoint 难度、MCP 持久化和 Atlas。

## 失败判定

- 函数或节点只有名字；
- 默认进入 L4/L5；
- MCP 不可用却声称已保存；
- raw conversation 被当成 fact；
- round 没有 commit；
- Atlas 变成全仓库毛线团；
- checkpoint 超出当前 level；
- stale 资产被当作当前事实。
