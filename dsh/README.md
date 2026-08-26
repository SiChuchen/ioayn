# ioayn-dsh

IOAYN v1.1 的 DeepSeek Harness（dsh）交付：**专职引导式学习 agent 模式**。选择"IOAYN 模式"后，任何学习意图（哪怕"我想了解这个项目"）都会进入有边界的学习协议：preflight → 学习者状态评估 → goal/session → 逐轮教学（认知预算 5/3/3/8）→ commit_learning_round → 认知 Atlas。journal 由 dsh 事件监听隐式捕获（marker 门控，opt-in）。

## 安装（两步）

```sh
dsh plugin --profile <name> add ioayn-dsh   # 或 github:SiChuchen/ioayn#<sha>（需 prepare 构建许可）
npx ioayn-dsh install                        # 拷贝 preset 到 $DSH_HOME/.agent-presets/ioayn/
```

重启 dsh 后模式选择器出现"IOAYN 模式"。`ioayn-dsh status` 查看两侧状态；`install --force` 覆盖更新；`uninstall` 移除。

## 信任与边界

- user preset 等同 shell 权限（dsh 官方信任模型）；安装副本的 ioayn-tools 行被改写为插件入口**绝对路径**（dsh 从 harness 内部解析裸名，profile 依赖不参与——这是 dsh 的设计）
- 插件写入范围仅目标项目 `.ioayn/`；同一工作区**不要**与 Claude Code 端并发使用（active marker 是单数）
- 包目录移动后需重跑 `ioayn-dsh install`

## 已知限制

- compact_summary 与 StopFailure 类事件不捕获（dsh 无已证实等价事件）；会话退出时 marker 由 agent/disposed 自动关闭，宿主进程长驻时以 `finish_learning_session` 兜底
- `start_learning_session` 初始 prompt 的 external id 为占位符（后续 turn 均为真实会话 id）

## 后续（P2 候选）

- 原生 compact 事件捕获；`@deepseek-ai/dsh-hooks-claude-code` 可选桥；view-atlas 的 Mermaid 投影接入 dsh web UI。

## 开发

`npm run verify`（根目录）覆盖 dsh 全链：typecheck、构建、journal/bin 测试、preset 结构/技能/工具对齐/拷贝漂移/安装演练五层检查。

verify 的拷贝漂移检查要求 preset 内 references/templates/agents 与 Claude Code 侧源文件逐字节一致，且 preset 技能树禁含 'mcp' 字样——改共享源文件时需同步两侧。
