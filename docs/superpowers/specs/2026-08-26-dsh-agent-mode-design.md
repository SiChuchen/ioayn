# IOAYN × dsh：原生 agent 模式设计

日期：2026-08-26
状态：已与用户逐节确认
影响面：新增 `dsh/` 交付物与 `server/src` 内部重构；不改任何 schema、协议或 Claude Code 路径行为

## 1. 目标

把 IOAYN v1.1 学习协议带入 DeepSeek Harness（dsh）：用户在 dsh 模式选择器中选择"IOAYN 模式"后，得到一个以 IOAYN 方法论为行为核心的 agent——`/learn-code`、`/resume-learning`、`/view-atlas` 触发完整学习流程，18 个 MCP 状态工具以 dsh 原生工具形式提供，journal 由插件事件监听隐式捕获。

非目标：

- 不修改 deepseek-harness 上游；
- 不改 `.ioayn/` 存储 schema、v1.1 协议、Learning Slice 边界（AGENTS.md 不变量全部保留）；
- 不做 LSP/RuntimeProvider、不做 Learning Studio；
- 不处理 Claude Code 与 dsh 并发使用同一 `.ioayn/` 工作区的冲突（见 §9）。

## 2. 核心决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 分发形式 | npm 包 `ioayn-dsh`（dsh bundle：插件 + 安装命令）+ `ioayn-dsh install` 拷贝 preset 模板到 `$DSH_HOME/.agent-presets/ioayn/` | dsh 的 `profile-boot.ts` 把 `agent-presets` 行的 `roots` 覆写为仅 shipped root（FACT，profile-boot.ts:159-167），user root 靠 `includeUserRoot` 默认 true 追加（FACT，agent-presets/src/index.ts）；第三方 preset 唯一官方入口是 user preset 目录 |
| 工具暴露方式 | dsh **原生插件**（`defineTool` 注册 18 个工具），不走 MCP 桥 | 用户判断 + 共识：agent 模式应是 agent 行为本身而非"agent 调外部服务器"；原生工具获得干净工具名、目录集成、toolFilter 可用；同时进程内事件监听可拿到真实 assistant 消息 |
| journal 捕获 | 同一插件监听 dsh 原生事件，隐式捕获 | 取代协议内自报（P1）与后续原生插件（P2）；保真度不低于 Claude Code hooks 路径 |
| dsh hooks 桥 | 不使用 | 正式版 dsh 不分发 `dsh-hooks-claude-code`（FACT，本机 0.1.1-rc.2 实测）；其 Stop 载荷缺 `last_assistant_message`（FACT，源码）；且 StopFailure/PostCompact/SessionEnd 不支持 |
| 单源策略 | 状态层逻辑只在 `server/src/core/` 一处，两个消费者各自 bundle | Zod 仍是数据模型与 MCP 路径校验的单源；dsh 工具的输入 DSL 与输出 schema 是新增同步面（§5），由 verify 的参数名对齐检查兜底 |

## 3. 架构

```text
server/src/core/            ← schemas/storage/atlas/constants 工厂化重构：
   │                           createCore(workspaceRoot) 按根实例化（现为
   │                           import 时固化的模块级单例）；findWorkspace 自
   │                           scripts/capture-hook.mjs 移入；行为不变，由现有测试守护
   │                              │
   ▼                              ▼
server/src/index.ts         dsh/src/{index,tools,journal}.ts
（stdio MCP server，          （ioayn-dsh 插件）
  Claude Code 路径，            ├─ defineTool × 18（薄壳，调 core；输入为
  变成 core 的薄壳）            │   ParameterSchemaSpec DSL 手写 + 必填
                               │   output.schema/output.render）
                               ├─ 事件监听 → journal 捕获
                               │   （复用 capture-hook 的 marker 门控、
                               │    dedupe、fingerprint 语义）
                               └─ 工具内取 session cwd 定位 .ioayn
```

dsh preset（agent-plane 组合）：

| IOAYN 侧 | dsh preset 行 |
|---|---|
| AGENTS.md 不变量 + 教学行为 | `@deepseek-ai/dsh-persona`：编码 agent 基底 + IOAYN v1.1 不变量摘要 + 技能入口提示 |
| 18 个 MCP 工具 | 引用 `ioayn-dsh` 插件行（按包名，dsh optional-provider 官方模式；解析可行性验证见 §7） |
| 3 个 skills | `@deepseek-ai/dsh-skill-filesystem`（`customSkillDirs` 指向 preset 自带 `skills/`，`baseUrl` 相对解析，官方 cordis preset 同款写法）+ `@deepseek-ai/dsh-tool-skill`；用户输入 `/learn-code` 等触发 |
| 4 个 subagents | `@deepseek-ai/dsh-tool-subagent`（spawn、one-shot）；角色 persona 放 `skills/learn-code/references/agents/`，委派时作为 per-child persona 传入，`disallowedTools` 映射为 toolFilter deny |
| journal 自动捕获 | 插件事件监听（见上） |

底座：以 shipped `standard` preset 为起点，保留其 bash/pwsh、fs、todo、compaction、plan-mode 等标准行。

## 4. 仓库布局

```text
ioayn/
├── server/src/core/        # 新：schemas/storage/atlas/constants 工厂化（见 §3），findWorkspace 移入
├── server/src/index.ts     # 改：从 core import（stdio MCP server 行为不变，现有测试守护）
├── dsh/
│   ├── package.json        # name: ioayn-dsh；声明 dsh.bundle；bin: ioayn-dsh
│   ├── cordis.patch.yml    # v1 空层 []
│   ├── src/
│   │   ├── index.ts        # definePlugin：inject ['tools', …]，注册工具 + 事件监听
│   │   ├── tools.ts        # 18 个 defineTool 薄壳
│   │   └── journal.ts      # dsh 事件 → journal 捕获
│   ├── preset/
│   │   ├── preset.yml      # name: IOAYN 模式；description；order
│   │   ├── agent.cordis.yml
│   │   └── skills/         # 3 个 dsh 适配版技能（含 references/、agents/）
│   ├── bin.mjs             # install / uninstall / status
│   └── scripts/build.mjs   # esbuild：dsh/src + server/src/core → lib/（无运行时对 ioayn-mcp 的依赖）
                            # preset/ 为安装模板（纯配置与 Markdown，无需构建）
└── scripts/verify-dsh.mjs  # 并入 npm run verify
```

npm 名 `ioayn-dsh` 已确认可用（FACT，registry 404）。

## 5. 插件设计细节

### 工具注册

- 参考 `dsh-tool-goal` 的 `defineTool` + `inject: ['tools', …]` 模式（FACT，源码）；
- **输入 schema**：dsh 不接受原始 JSON Schema——参数必须用其自有 `ParameterSchemaSpec` DSL（FACT，packages/core/tools/src/schema.ts:545-566，经受限 JSON Schema 子集校验）。因此 18 个工具的输入在 `tools.ts` 手写 DSL；Zod 仍是数据模型与 MCP 路径的校验单源，verify 做参数名级对齐检查防两侧漂移（不做关键字级转换器，v1 明确不建）；
- **输出契约**：`output.schema` + `output.render` 为必填（FACT，schema.ts:489-497），18 个工具各配一份 JSON Schema 与文本渲染——这是本设计的明确工作量项，不是薄壳；
- 工具名保持原名（`commit_learning_round` 等），无 `mcp__` 前缀；
- session cwd 用于 `.ioayn/` 定位（沿 findWorkspace 向上查找逻辑，core 工厂按 cwd 实例化）；
- MCP stdout 协议约束在 dsh 路径天然不适用（进程内调用），日志走 `ctx.logger`。

### journal 事件捕获

语义与 `scripts/capture-hook.mjs` 对齐（marker 门控、5 秒 dedupe 窗口、fingerprint、round/asset 反向链接、SessionEnd 时把 marker 置 `active:false`）：

| Claude Code 事件 | dsh 事件 | 捕获内容 |
|---|---|---|
| UserPromptSubmit | `agent/pre-step`（FACT，hooks 桥同款映射，载荷含 prompt） | user prompt turn |
| Stop | `agent/turn-stopping`（FACT 事件存在；载荷仅 `{agent, turn, signal}`，assistant 文本须从 `agent.session.events` 自行折叠，具体 API 实现时确认） | agent teaching turn |
| SessionEnd | `session/disposed` / `agent/disposed`（FACT，dsh 源码有先例引用） | marker 置 inactive |
| PostCompact | compaction 经 `session/event` 可监听（FACT，compaction-basic 先例；具体事件名实现时确认） | compact_summary turn |
| StopFailure | 无明确等价（接受缺失，文档注明） | — |

## 6. Skills 适配

拷贝到 `dsh/preset/skills/` 手工维护，顶部注明来源版本（如 `synced-from: skills/learn-code@1.1.3`）：

- `${CLAUDE_SKILL_DIR}/references/...` → 相对 `references/...`（dsh 按 `resourceBase` 解析，FACT）；
- 子代理委派：Task tool 语法 → dsh `subagent` 工具调用说明（persona 全文传入 + toolFilter deny）；
- MCP 工具名引用：原名不变（原生工具）；
- 原设计新增的"每轮 append_conversation_turn"协议段**取消**（隐式捕获回归）；
- resume-learning、view-atlas 同规则机械适配。

## 7. 安装 / 更新 / 卸载

```sh
dsh plugin --profile <name> add ioayn-dsh   # npm 安装 bundle（git 安装为备选，package.json 配 prepare 自足构建）
npx ioayn-dsh install                        # 拷贝 preset 模板（agent.cordis.yml + preset.yml + skills/）→ $DSH_HOME/.agent-presets/ioayn/
```

- `install` 幂等：目标已存在时报告版本差异，`--force` 覆盖；
- `uninstall` 删 preset 目录；`status` 显示 profile 依赖与 preset 目录两侧版本；
- preset 引用的插件包（`ioayn-dsh`）解析路径 **UNKNOWN，列为实现时首个验证项**：用户 preset 的包名经 `PresetTree.import` 以 host baseUrl 解析（FACT，mount.ts:81-92），profile 的 node_modules 是否可达取决于 baseUrl 实际指向；官方 optional-provider 先例（code preset 的 disabled 行注释）只证明 host 安装流程，不构成用户 preset 解析的事实依据。fallback：bundle patch 层插入 host disabled 锚行，或 preset 行改写为指向 profile node_modules 的路径；
- 信任级别为 user（等同 shell 权限），README 明示。

## 8. 验证（并入 `npm run verify`，全部无 LLM API 调用）

1. **结构**：`agent.cordis.yml` YAML 合法、引用的 in-box 插件名存在于本机已安装 dsh 的包清单（FACT 基线：persona/skill-filesystem/tool-skill/tool-subagent 系均随产品分发，本机实测）；
2. **技能格式**：SKILL.md frontmatter 符合 dsh 规则（kebab-case name、必填 description、合法布尔 invocation 字段）；
3. **core 工具冒烟**：构建产物加载后逐工具做最小输入校验与一次完整 round commit 到临时 `.ioayn/`（不 spawn MCP stdio server）；
4. **mount 冒烟**：devDependency 引 `@deepseek-ai/dsh-agent-presets`，临时目录跑真实 preset mount（dsh 官方单测同款路径）；
5. **journal 单测**：模拟 dsh 事件序列，断言 marker 门控、dedupe、SessionEnd 关闭语义；
6. **参数名对齐**：dsh 工具输入 DSL 的参数名集合与 core Zod schema 字段名逐工具对齐（防双源漂移）。

真实学习一轮的 LLM 端到端为手动验收项，不进 verify。

## 9. 已知限制与后续

- AGENTS.md 不变量在 dsh 路径的等价表述：插件写入范围只能是目标项目 `.ioayn/`（core 边界不变，插件不写其他路径）；schema 同步义务清单纳入 dsh 消费者（Zod → JSON Schema 导出 → dsh 工具 DSL 三处）；
- 同一 `.ioayn/` 工作区禁止 Claude Code 与 dsh 并发使用（marker 单数）；README 声明；
- dsh 0.1.x rc 的插件 API 可能演进，破坏面收敛在 `dsh/src/`（一个包），verify-dsh 冒烟兜底；
- dsh 版 skills 与 Claude Code 版手工同步，靠来源版本注记 + verify 结构检查部分兜底；
- StopFailure 类事件无 dsh 等价物，journal 缺该类系统标记（接受）；
- 后续候选：`view-atlas` 的 Mermaid 投影接入 dsh web UI（未立项）。

## 10. 交付物清单

- 新包 `dsh/`（ioayn-dsh）+ 构建脚本；
- `server/src/core/` 抽取（无逻辑变更）；
- `scripts/verify-dsh.mjs` 并入 verify；
- README/CHANGELOG/RELEASE_NOTES/BUILD_INFO 按仓库流程更新。
