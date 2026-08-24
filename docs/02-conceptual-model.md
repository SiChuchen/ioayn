# 02 — Conceptual Model

IOAYN v1.1 由五层概念组成。

## 1. Goal Layer

`LearningGoal` 定义问题、范围、完成条件和 L0–L5 起止层级。

## 2. Slice Layer

`LearningSlice` 保存一个有限问题的 I/O 主线：Anchor、Boundary、Participants、Flow、State、Failures、Evidence、Unknowns。

## 3. Conversation Layer

`LearningSession` 和 `ConversationTurn` 保存认知形成过程：用户提问、Agent 教学、checkpoint、回答、工具观察和 compact summary。

这层是原始过程，不直接等于项目事实。

## 4. Knowledge Asset Layer

`LearningRound` 是一次教学的结构化提交；`LearningAsset` 是从交流中提炼出的可复用认知结果，既保存结构化 I/O/claim/role，也保存可独立阅读的 Markdown 教学正文和原始 turn provenance。

```text
Journal turns
→ Round claims / evidence / checkpoint
→ LearningAsset
```

## 5. Cognitive Atlas Layer

Atlas 将知识资产放回项目结构：

```text
System Area
├── Learning Slice
├── Learning Asset
├── Concept
└── selected Code Entity
```

关系包括 PART_OF、REFINES、CONNECTS_TO、EXPLAINS、CONTRADICTS、SUPERSEDES 等。

## 认知状态

Atlas 节点不使用单一“已学习”布尔值，而描述：

- Model：observed / modeled / verified / revised；
- Connection：isolated / connected；
- Freshness：current / stale / unknown；
- Unknowns：open / clear。

## Authority

权威顺序：

```text
当前源码 + 运行观察
> 聚焦测试
> 当前静态路径
> 项目文档与注释
> 生成 Wiki / 生成图
> 旧 revision 资料
```

Journal 记录“我们怎么想到”，LearningAsset 记录“目前可复用的认知是什么”。
