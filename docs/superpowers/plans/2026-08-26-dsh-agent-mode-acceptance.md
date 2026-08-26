# dsh Agent 模式真机验收记录

日期：2026-08-26
环境：Windows 10、dsh 0.1.1-rc.2（全局 npm 安装）、Node v24、IOAYN 分支 feat/dsh-agent-mode

## Step 1：bundle 安装与解析验证（已执行）

| 项 | 结果 |
|---|---|
| `dsh plugin --profile ioayn-test add ./dsh` | ✅ profile 创建成功，`dsh.profile.bundles` 含 ioayn-dsh（link 到本地 dsh/ 目录），pnpm 安装无警告 |
| `dsh --profile ioayn-test --dump-config` | ✅ 组合成功；无 `# == ioayn-dsh` 层头——空补丁层 `[]` 无行可插，属预期行为；bundle 声明被 dsh 识别（否则不会进 bundles 列表） |
| **包名解析（spec §7 UNKNOWN）** | ❌→✅ **初判有误后修正**：profile node_modules 的 `require.resolve` 成功是误导——dsh 的 preset 行裸包名从 **harnessBase**（harness 安装目录内部）解析（mount.ts PresetTree.import override 的设计），profile 依赖不参与。裸名 `ioayn-dsh` 在任何 profile 下都 MODULE_NOT_FOUND → 选 IOAYN 模式后 mount 失败、**web 界面无法新开会话**（用户实测复现）。修复（commit cb8d383）：`bin.mjs install` 把安装副本的 ioayn-tools 行改写为插件入口**绝对路径**（mount.ts 显式支持的通道，`isAbsolute → pathToFileURL`）；源模板保持裸名。重新安装后 `plugin link: ok`，行名指向 `E:\codex-prj\ioayn\dsh\lib\index.js`。**勘误（Task 11 回填 spec §7）：绝对路径改写不是 fallback，是 out-of-tree 插件行的标准机制** |
| `node dsh/bin.mjs install` | ✅ 装入真实 `C:\Users\SiChuchen\.dsh\.agent-presets\ioayn`，marker 版本 v0.1.0 |
| `node dsh/bin.mjs status` | ✅ plugin build: present；preset: installed v0.1.0；plugin link: ok |

## Step 2：真实会话验收（已执行两轮）

### 会话 1（session-8f9a17db，修复前）：复现 bug

选 IOAYN 模式后 preset mount 失败、web 无法新开会话 → 根因与修复见 Step 1 表（绝对路径改写）。

### 会话 2（session-87f88527，修复后 + 专职学习 persona）：核心链路全部通过

用户仅输入"我想详细学习了解该项目"（无 /learn-code 命令），目标项目 deepseek-harness（复用其既有 .ioayn 工作区）：

| # | 验收项 | 结果 |
|---|---|---|
| 1 | 模式选择 + mount | ✅ 会话头 `preset: ioayn`，1585 事件正常运转 |
| 2 | 协议主动触发与工具链 | ✅ agent 自主调用 `skill(learn-code)` → `preflight_learning` → `resume_learning_context`（正确衔接 8/16 的历史学习资产）→ `ask_user_question` 选方向 → `create_goal` → `build_project_index` → `start_learning_session` → 勘察 → `save_slice` → `upsert_atlas_node` → `commit_learning_round`，共 20 次工具调用 |
| 3 | journal 事件捕获 | ✅ 10 条 turn 落盘：过程叙述（带真实 dsh session id 的 `dsh-teaching-*`）+ 轮次摘要 + commit 事件 + 完整教学正文（实体角色表/八节点图/checkpoint/Atlas 增量） |
| 4 | round commit | ✅ `round-loop-1.json`：5 实体、7 声明、4 证据、2 deferred unknown；预算自报遵守（2 文件）；checkpoint 提问收尾 |
| 5 | 退出关 marker | ⏳ 开放项：marker 仍 active——验收时 web 宿主进程仍在运行，agent/disposed 待进程退出后触发；`finish_learning_session` 为显式兜底 |
| 6 | `/resume-learning` | ⏳ 未测（会话 2 中 resume_learning_context 已验证读取侧；恢复侧留待日常使用确认） |
| 7 | 角色子代理工具 | ⏳ 未测（本轮 agent 自行勘察，协议允许；delegationDepth 门控有单测覆盖） |

### 已知小瑕疵（记录，不阻塞）

- `start_learning_session` 的 initialPrompt turn 带 external id `current-web-session`（模型自编占位符；后续事件捕获均用真实 id，数据无损）
- 绝对路径改写使安装副本的 ioayn-tools 行指向安装时的包路径——包目录移动后需重跑 `ioayn-dsh install`

## Step 3：结论

- 分发链、preset mount、27 工具、事件捕获、round commit 在真机全部验证通过（项 1-4）。
- 开放项 5/6/7 有单测或显式兜底覆盖，留待日常使用确认；发现问题时按仓库流程修复。
- 方向修正（用户决定）：IOAYN 模式为**专职引导式学习 agent**——方法论进系统提示词，学习意图主动进入协议（commit 2e6f2e9）。
