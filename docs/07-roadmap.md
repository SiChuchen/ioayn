# 07 — Roadmap

## 已完成：v1.0 基础

- IOAYN 方法论；
- Goal / Slice / Evidence / Unknown；
- Skill、Subagents、本地 MCP；
- revision 与 freshness。

## 已完成：v1.1 持续记忆与 Cognitive Atlas

- PERSISTENT / DEGRADED preflight；
- L0–L5；
- contextual roles；
- typed claims；
- LearningSession / Journal / Round / Asset；
- opt-in Hooks；
- recoverable round commit；
- Atlas hierarchy、concept links、bounded projections；
- resume 与 migration。

## v1.1.x — 真实项目稳定化

- 在 WVSS 同一切片上复测完整 MCP + Hooks；
- 中断会话后 resume；
- 修改源码后 freshness；
- 更严格的行为 eval runner；
- commit transaction repair tool；
- Journal 脱敏和导出控制；
- Atlas connection suggestion precision。

退出标准：至少 3 个真实项目、每个 3 条切片，工具链无静默退化。

## v1.2 — 最小 CodeProvider

只实现学习所需的局部能力：

- find symbol；
- references；
- local callers/callees；
- source ranges；
- Git diff → affected assets。

优先 LSP，Tree-sitter fallback。禁止先做全仓库大图。

## v1.3 — RuntimeProvider

- focused test discovery；
- Web/Chrome network and UI anchors；
- Android adb/logcat/Perfetto；
- Linux perf/ftrace/eBPF；
- runtime trace 与 LearningSlice 对齐；
- evidence 脱敏。

## v1.4 — Learning Compiler

从结构化资产生成：

- CodeTour；
- 局部 Mermaid；
- contract cards；
- 预测题；
- 失败路径课程；
- 多切片横向归纳。

## v2.0 — Learning Studio

- 交互式 Cognitive Atlas；
- 源码联动；
- Journal / Asset / Evidence 三栏；
- 认知断点；
- revision diff；
- 私有与共享视图。

UI 不得把力导向全仓库图作为默认首页。

## 团队与研究方向

- 评审过的共享资产；
- 专家修正与 supersede；
- 多用户权限；
- 自适应 checkpoint；
- 心智模型错误诊断；
- 延迟回忆和变更迁移研究。
