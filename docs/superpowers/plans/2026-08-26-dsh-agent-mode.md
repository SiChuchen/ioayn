# IOAYN dsh 原生 Agent 模式实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 IOAYN v1.1 交付为 dsh 的"IOAYN 模式"agent preset：npm 包 `ioayn-dsh`（原生插件注册 27 个工具 + 事件驱动的 journal 捕获）+ preset 模板安装命令。

**Architecture:** `server/src` 的状态层工厂化抽到 `server/src/core/`，stdio MCP server 变薄壳（Claude Code 路径行为不变）；`dsh/` 新包以 `defineTool` 原生注册工具、以 `session/event`/`agent/disposed` 监听做 journal 捕获；preset 引用 in-box 插件 + `ioayn-dsh` 包；`dsh plugin add` + `ioayn-dsh install` 两步安装。Spec：`docs/superpowers/specs/2026-08-26-dsh-agent-mode-design.md`。

**Tech Stack:** TypeScript strict / Node ≥20 ESM / esbuild bundling / Zod（数据单源）/ dsh 插件 API（`@deepseek-ai/cordis@4.0.1`、`@deepseek-ai/dsh-tools@0.0.1-rc.1`，本机 dsh 0.1.1-rc.2 已实测存在）。

## Global Constraints

- 不改 `.ioayn/` schema 与 `SCHEMA_VERSION`（"1.1"）；Zod 仍是数据模型单源；本计划不做任何数据迁移。
- 插件/hook 写入范围只能是目标项目 `.ioayn/`（AGENTS.md 不变量的 dsh 等价表述）。
- MCP 路径行为不变：`server/src/index.ts` 重构后，现有 `npm run verify`（smoke/migration/fixtures）必须原样通过。
- Claude Code 路径文件（`hooks/`、`skills/`、`agents/`、`scripts/capture-hook.mjs`）不修改。
- dsh 工具输入 DSL 仅是模型面；执行前用 core 的 zod schema 复验参数（约束的唯一执行点）。
- 每个任务完成后运行相关测试并提交；最终 `npm run verify` 必须全绿。
- 不声称运行过未实际运行的验证；真机 dsh 验收（Task 10）单独成门。
- 工具总数为 **27**（spec 早期写 18 是统计错误，spec 已随本计划勘误）。

---

### Task 1: server/src/core 迁移与 store 工厂化

**Files:**
- Move: `server/src/constants.ts` → `server/src/core/constants.ts`
- Move: `server/src/schemas.ts` → `server/src/core/schemas.ts`
- Move: `server/src/storage.ts` → `server/src/core/storage.ts`
- Move: `server/src/atlas.ts` → `server/src/core/atlas.ts`
- Create: `server/src/core/workspace.ts`
- Modify: `server/src/index.ts:53-67`（import 与 store 实例化）
- Modify: `server/src/export-schemas.ts`、`server/src/validate-fixtures.ts`（import 路径）

**Interfaces:**
- Produces: `core/workspace.ts` 导出 `findWorkspace(startDir: string): string | null` 与 `createStore(rootDir: string): WorkspaceStore`。后续 Task 4/5 依赖这两个签名。

- [ ] **Step 1: git mv 四个文件到 core/ 并修内部 import**

```bash
cd E:/codex-prj/ioayn
mkdir -p server/src/core
git mv server/src/constants.ts server/src/core/constants.ts
git mv server/src/schemas.ts server/src/core/schemas.ts
git mv server/src/storage.ts server/src/core/storage.ts
git mv server/src/atlas.ts server/src/core/atlas.ts
```

四个文件之间的相对 import（`./constants.js` 等）同级不变，无需修改。

- [ ] **Step 2: 写 core/workspace.ts**

```typescript
import { existsSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { WorkspaceStore } from "./storage.js";

/** 从 startDir 向上找最近的 .ioayn 工作区；找不到返回 null。语义与 scripts/capture-hook.mjs 的 findWorkspace 一致。 */
export function findWorkspace(startDir: string): string | null {
  let current = resolve(startDir);
  const root = parse(current).root;
  for (;;) {
    if (existsSync(join(current, ".ioayn"))) return join(current, ".ioayn");
    if (current === root) return null;
    current = dirname(current);
  }
}

/** 按根目录实例化 store（工厂化：替代 import 时固化的模块级单例）。 */
export function createStore(rootDir: string): WorkspaceStore {
  return new WorkspaceStore(resolve(rootDir));
}
```

- [ ] **Step 3: index.ts / export-schemas.ts / validate-fixtures.ts 改 import 路径**

`server/src/index.ts` 顶部四组 import 的 `"./constants.js"`、`"./schemas.js"`、`"./storage.js"`、`"./atlas.js"` 改为 `"./core/constants.js"` 等；第 66-67 行改为：

```typescript
import { createStore } from "./core/workspace.js";
const rootDir = resolve(process.env.IOAYN_PROJECT_DIR || process.cwd());
const store = createStore(rootDir);
```

`export-schemas.ts` 与 `validate-fixtures.ts` 中对 schemas/ constants 的 import 同样加 `core/` 前缀。

- [ ] **Step 4: 运行 verify 确认行为不变**

Run: `npm run verify`
Expected: 全部通过（typecheck、build、schemas、test:smoke、migration、fixtures、check:repo）。

- [ ] **Step 5: Commit**

```bash
git add server/src scripts
git commit -m "refactor(server): move state layer into core/ and factory the store"
```

---

### Task 2: 工具描述符注册表 core/tools.ts

**Files:**
- Create: `server/src/core/tools.ts`
- Modify: `server/src/index.ts`（27 处 registerTool 内联逻辑收拢为循环）

**Interfaces:**
- Produces: `interface IoaynTool { name: string; title: string; description: string; inputSchema: z.ZodType; execute(args: unknown, store: WorkspaceStore): unknown }` 与纯常量数组 `export const IOAYN_TOOLS: IoaynTool[]`（不需要 store 工厂——execute 显式收 store 参数）。Task 4 的 dsh 适配器与 Task 9 的参数对齐检查都消费这个数组（name 集合 = 下表 27 个）。

27 个工具名（转写与对齐的唯一权威清单）：`preflight_learning, init_workspace, migrate_workspace, project_snapshot, create_goal, save_slice, record_evidence, record_unknown, start_learning_session, resume_learning_session, append_conversation_turn, list_session_turns, finish_learning_session, commit_learning_round, upsert_atlas_node, link_atlas_nodes, build_atlas_projection, find_historical_connections, resume_learning_context, list_learning_assets, get_learning_asset, validate_workspace, freshness_report, close_goal, reset_workspace, build_project_index, get_project_index`。

- [ ] **Step 1: 在 core/tools.ts 定义接口与一个完整示范工具**

```typescript
import { z } from "zod";
import type { WorkspaceStore } from "./storage.js";
import { VERSION, SCHEMA_VERSION } from "./constants.js";
import type { Session } from "./schemas.js";

export interface IoaynTool {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodType;
  execute(args: unknown, store: WorkspaceStore): unknown;
}

export const IOAYN_TOOLS: IoaynTool[] = [
  {
    name: "preflight_learning",
    title: "Run IOAYN learning preflight",
    description:
      "Verify MCP persistence, workspace schema, Git revision, active session, and resumable context before a guided learning workflow starts.",
    inputSchema: z.object({}),
    execute: (_args, store) => {
      store.ensureWorkspace();
      // …原 index.ts preflight_learning handler 函数体原样搬入，"store" 即第二参数…
    },
  },
  // 其余 26 个工具同模式搬入，顺序与原 index.ts 一致
];
```

搬移规则（机械执行，不改任何逻辑/文案/校验）：
1. 每个 `server.registerTool(name, {title, description, inputSchema}, handler)` 变成一个描述符对象；handler 的参数签名 `async (input) => …` 改为 `execute: (input, store) => …`（保持 async 也行，接口返回 `unknown`）。
2. handler 内引用的模块级 `store` 全部改为第二参数 `store`；模块级辅助函数（`textResult`、`unique`、`currentRevision`、`requireCurrentWorkspace(store)`、`existingCreatedAt(store, …)`、`turnId`、`appendTurn(store, …)` 等）随迁为 core/tools.ts 内部函数，`store` 改为显式首参数。
3. 描述文案、zod schema、错误消息逐字保留。

- [ ] **Step 2: index.ts 改为薄壳适配**

删除 27 处内联 registerTool 与随迁的辅助函数，改为：

```typescript
import { IOAYN_TOOLS } from "./core/tools.js";

for (const tool of IOAYN_TOOLS) {
  server.registerTool(
    tool.name,
    { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
    async (input) => tool.execute(input, store) as never,
  );
}
```

- [ ] **Step 3: 运行 verify（smoke 套件驱动全部工具路径，是本任务的回归网）**

Run: `npm run verify`
Expected: 全绿；`server/scripts/smoke-test.mjs` 内对每个工具的调用行为与重构前一致。

- [ ] **Step 4: Commit**

```bash
git add server/src
git commit -m "refactor(server): extract 27 tool descriptors into core/tools.ts"
```

---

### Task 3: dsh 包脚手架与构建

**Files:**
- Create: `dsh/package.json`、`dsh/tsconfig.json`、`dsh/cordis.patch.yml`、`dsh/src/index.ts`、`dsh/scripts/build.mjs`、`dsh/.gitignore`
- Modify: 根 `.gitignore`（忽略 `dsh/lib/`、`dsh/node_modules/`）

**Interfaces:**
- Produces: 包 `ioayn-dsh`，入口 `lib/index.js` 导出 `name = 'ioayn-tools'`、`inject = ['tools']`、`apply(ctx)`。Task 4/5 填充 apply 内部。

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "ioayn-dsh",
  "version": "0.1.0",
  "description": "IOAYN native plugin and agent preset for the DeepSeek Harness.",
  "type": "module",
  "main": "./lib/index.js",
  "bin": { "ioayn-dsh": "./bin.mjs" },
  "files": ["lib/", "cordis.patch.yml", "preset/", "bin.mjs", "README.md"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": "^0.0.1-rc.1"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "4.0.1",
    "@deepseek-ai/dsh-tools": "0.0.1-rc.1",
    "@deepseek-ai/dsh-agent-presets": "0.0.1-rc.1",
    "esbuild": "^0.24.0",
    "typescript": "^5.6.0",
    "yaml": "^2.6.0",
    "@types/node": "^20.0.0"
  },
  "scripts": {
    "build": "node scripts/build.mjs",
    "typecheck": "tsc --noEmit"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 2: 写 tsconfig.json / cordis.patch.yml / .gitignore**

`dsh/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "../server/src/core/**/*.ts"]
}
```

`dsh/cordis.patch.yml`（v1 空层，见 spec §7）：

```yaml
# ioayn-dsh host-plane layer: intentionally empty in v0.1.0.
# The IOAYN preset's agent-plane rows (tools/journal plugin, skills) live in
# preset/agent.cordis.yml; this bundle's job is package distribution and the
# install command. P2 native-plugin extensions would land here.
[]
```

`dsh/.gitignore`：`node_modules/`、`lib/`。根 `.gitignore` 追加 `dsh/lib/`、`dsh/node_modules/`（若根文件已覆盖则跳过）。

- [ ] **Step 3: 写最小 src/index.ts 与 build.mjs**

`dsh/src/index.ts`：

```typescript
import type { Context } from '@deepseek-ai/cordis'

export const name = 'ioayn-tools'
export const inject = ['tools']

export function apply(_ctx: Context): void {
  // Task 4 registers the 27 IOAYN tools; Task 5 attaches journal listeners.
}
```

`dsh/scripts/build.mjs`：

```javascript
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'lib/index.js',
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools'],
})
```

（`@deepseek-ai/*` 标 external：宿主进程内已加载同源模块，peer 语义；core 的 zod 等打进 bundle。）

- [ ] **Step 4: 安装、构建、导入冒烟**

```bash
cd dsh && npm install && npm run build
node -e "import('./lib/index.js').then(m => { if (m.name !== 'ioayn-tools' || typeof m.apply !== 'function') throw new Error('bad plugin export'); console.log('plugin export OK') })"
```
Expected: `plugin export OK`。

- [ ] **Step 5: Commit**

```bash
git add dsh .gitignore
git commit -m "feat(dsh): scaffold ioayn-dsh plugin package with empty bundle layer"
```

---

### Task 4: dsh 原生工具注册（27 个）

**Files:**
- Create: `dsh/src/tools.ts`
- Modify: `dsh/src/index.ts`（apply 内注册工具）

**Interfaces:**
- Consumes: `IOAYN_TOOLS`（Task 2）、`findWorkspace`/`createStore`（Task 1）。
- Produces: `registerIoaynTools(ctx: Context): void`；工具名与 Task 2 清单一致；dsh 侧参数表 `IOAYN_TOOL_PARAMS: Record<string, ParameterSchemaSpec>` 供 Task 9 对齐检查消费。

- [ ] **Step 1: 写 tools.ts 的共享件与转写规则**

`dsh/src/tools.ts`：

```typescript
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import { IOAYN_TOOLS } from '../../server/src/core/tools.js'
import { findWorkspace, createStore } from '../../server/src/core/workspace.js'
import type { WorkspaceStore } from '../../server/src/core/storage.js'
```

**（转写规则——dsh DSL 仅是模型面，zod 复验兜底全部约束）**

| core zod 构造 | ParameterSchemaSpec |
|---|---|
| `z.string()`（含 `.min/.max/.pattern`，约束由 zod 复验执行） | `{ type: 'string' }` |
| 上述 + `.optional()` | 同上，**不带** `required` |
| 必填字段 | 加 `required: true` |
| `z.enum(['a','b'])` | `{ type: 'string', enum: ['a','b'] }` |
| `z.number().int()` | `{ type: 'integer' }` |
| `z.number()` | `{ type: 'number' }` |
| `z.array(z.string())` | `{ type: 'array', items: { type: 'string' } }` |
| 嵌套 `z.object({...})` | `{ type: 'object', properties: {…同规则递归…}, additionalProperties: true }` |
| `idSchema`（字符串模式） | `{ type: 'string' }` |

共享输出契约（27 个工具统一：任意对象 + JSON 文本渲染）：

```typescript
const jsonOutput = { type: 'object', additionalProperties: true } as const
const renderJson = (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
```

- [ ] **Step 2: 逐工具转写参数表（27 个全量，字段名逐字照抄 core/tools.ts）**

```typescript
export const IOAYN_TOOL_PARAMS: Record<string, ParameterSchemaSpec> = {
  preflight_learning: {},
  init_workspace: {},
  migrate_workspace: {},
  project_snapshot: {},
  create_goal: {
    id: { type: 'string' },
    title: { type: 'string', required: true },
    target: { type: 'string', required: true },
    questions: { type: 'array', items: { type: 'string' }, required: true },
    include: { type: 'array', items: { type: 'string' } },
    exclude: { type: 'array', items: { type: 'string' } },
    entryHypotheses: { type: 'array', items: { type: 'string' } },
    doneWhen: { type: 'array', items: { type: 'string' }, required: true },
    mode: { type: 'string', enum: ['guided', 'survey', 'deep_dive', 'reference'] },
    startLevel: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] },
    targetLevel: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] },
    currentLevel: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] },
  },
  // …其余 22 个工具按 Step 1 规则从 core/tools.ts 的 inputSchema 逐字转写…
}
```

转写要求：枚举值照抄 core（如 `save_slice.stage` 的 9 个阶段、`record_evidence.kind` 的 8 类、`append_conversation_turn` 的 actor/kind 枚举）；`z.enum(ABSTRACTION_LEVELS)` 等常量数组在 core/tools.ts 展开后的值逐项照抄。Task 9 的对齐检查会逐工具断言参数名集合一致，漏写/错名当场失败。

- [ ] **Step 3: 注册循环（cwd 定位 + zod 复验）**

```typescript
const storeCache = new Map<string, WorkspaceStore>()

function storeFor(cwd: string | undefined): WorkspaceStore {
  const start = cwd ?? process.cwd()
  const ioaynDir = findWorkspace(start) ?? join(start, '.ioayn') // 与 MCP 路径一致：无工作区时以 cwd 为根（init_workspace 负责创建）
  const root = dirname(ioaynDir)
  let store = storeCache.get(root)
  if (!store) { store = createStore(root); storeCache.set(root, store) }
  return store
}

export function registerIoaynTools(ctx: Context): void {
  const cwdOf = (exec: unknown): string | undefined =>
    (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd

  for (const proto of IOAYN_TOOLS) {
    const params = IOAYN_TOOL_PARAMS[proto.name]
    if (params === undefined) throw new Error(`ioayn-dsh: no ParameterSchemaSpec for tool ${proto.name}`)
    ctx.tools.register(defineTool({
      name: proto.name,
      description: proto.description,
      parameters: params,
      output: { schema: jsonOutput, render: renderJson },
      async execute(args, exec) {
        const store = storeFor(cwdOf(exec))
        const validated = proto.inputSchema.parse(args) // zod 复验：DSL 不承载的约束在此执行
        return proto.execute(validated, store) as never
      },
    }))
  }
}
```

`dsh/src/index.ts` 的 apply 改为：

```typescript
import { registerIoaynTools } from './tools.js'
export { IOAYN_TOOL_PARAMS } from './tools.js'
export { IOAYN_TOOLS } from '../../server/src/core/tools.js'
export function apply(ctx: Context): void {
  registerIoaynTools(ctx)
}
```

（两个 re-export 供 Task 5 单测与 Task 9 对齐检查从构建产物直接消费。）

- [ ] **Step 4: 构建 + 类型检查 + 最小调用冒烟**

```bash
cd dsh && npm run typecheck && npm run build
node -e "
import('./lib/index.js').then(async m => {
  const calls = []
  const ctx = { tools: { register: t => calls.push(t.name) } }
  m.apply(ctx)
  console.log(calls.length, calls.slice(0, 3).join(','))
})"
```
Expected: `27 preflight_learning,init_workspace,migrate_workspace`（或以字母序，以实际为准，总数必须 27）。

- [ ] **Step 5: Commit**

```bash
git add dsh/src
git commit -m "feat(dsh): register 27 IOAYN tools natively with zod revalidation"
```

---

### Task 5: journal 事件捕获

**Files:**
- Create: `dsh/src/journal.ts`
- Create: `dsh/scripts/journal.test.mjs`
- Modify: `dsh/src/index.ts`（apply 内挂监听）

**Interfaces:**
- Consumes: `findWorkspace`（Task 1）。
- Produces: `attachJournal(ctx: Context): void`。捕获语义与 `scripts/capture-hook.mjs` 对齐：marker 门控、5 秒 dedupe 窗口、fingerprint id、round/asset 反向链接、`agent/disposed` 时 marker 置 `active:false`。
- 已核实的事件通道（dsh 源码 FACT）：`ctx.on('session/event', (session, event))`，`event.type` 为 `'user/message'` | `'assistant/message'`；子会话经 `session.header.delegationDepth > 0` 排除；`ctx.on('agent/disposed', ({ agent }))`。compaction 事件名未在源码确认——v1 不捕获 compact_summary（spec 勘误已记）。

- [ ] **Step 1: 写 journal.ts**

```typescript
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { findWorkspace } from '../../server/src/core/workspace.js'

const DEDUPE_WINDOW_MS = 5000

interface CaptureTurn {
  schema_version: string; id: string; session_id: string; round_id?: string
  external_session_id?: string; actor: string; kind: string; content: string
  related_entities: string[]; related_assets: string[]; created_at: string
}

const textOf = (blocks: unknown): string =>
  Array.isArray(blocks)
    ? blocks.filter((b): b is { type: 'text'; text: string } =>
        typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text')
      .map(b => b.text).join('\n')
    : ''

function readJson(path: string): any {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function readJsonLines(path: string): any[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
}

function safeId(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 119)
  return normalized || `dsh-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`
}

/** 与 capture-hook.mjs 相同的写入管线：marker 门控 → dedupe → journal 追加 → 反向链接。导出以便单测直接驱动。 */
export function captureEvent(input: {
  cwd: string; actor: 'user' | 'agent'; kind: 'prompt' | 'teaching'
  content: string; externalSessionId?: string
}): 'captured' | 'no-workspace' | 'inactive' | 'empty' | 'duplicate' {
  if (!input.content) return 'empty'
  const workspace = findWorkspace(input.cwd)
  if (!workspace) return 'no-workspace'
  const markerPath = join(workspace, 'runtime', 'active-session.json')
  const marker = readJson(markerPath)
  if (!marker?.active || !marker.learning_session_id) return 'inactive'
  const sessionId = String(marker.learning_session_id)
  const sessionPath = join(workspace, 'sessions', `${sessionId}.json`)
  const session = readJson(sessionPath)
  const activeRoundId = session?.current_round_id ? String(session.current_round_id) : undefined
  let relatedEntities: string[] = []
  let relatedAssets: string[] = []
  if (activeRoundId) {
    const round = readJson(join(workspace, 'rounds', `${activeRoundId}.json`))
    if (round) {
      relatedEntities = Array.isArray(round.introduced_entities) ? round.introduced_entities.map((e: { id: string }) => e.id).filter(Boolean) : []
      if (round.learning_asset_id) relatedAssets = [String(round.learning_asset_id)]
    }
  }
  const createdAt = new Date().toISOString()
  const journalPath = join(workspace, 'journal', `${sessionId}.jsonl`)
  const duplicate = readJsonLines(journalPath).slice(-20).some(t =>
    Date.now() - Date.parse(String(t.created_at || '')) >= 0
    && Date.now() - Date.parse(String(t.created_at || '')) <= DEDUPE_WINDOW_MS
    && t.actor === input.actor && t.kind === input.kind && t.content === input.content
    && String(t.external_session_id || '') === String(input.externalSessionId || ''))
  if (duplicate) return 'duplicate'
  const fingerprint = createHash('sha256').update([input.externalSessionId, input.actor, input.kind, input.content].join('|')).digest('hex').slice(0, 16)
  const turn: CaptureTurn = {
    schema_version: '1.1',
    id: safeId(`dsh-${input.kind}-${fingerprint}-${Date.now().toString(36)}`),
    session_id: sessionId,
    ...activeRoundId ? { round_id: activeRoundId } : {},
    ...input.externalSessionId ? { external_session_id: input.externalSessionId } : {},
    actor: input.actor, kind: input.kind, content: input.content,
    related_entities: relatedEntities, related_assets: relatedAssets, created_at: createdAt,
  }
  mkdirSync(dirname(journalPath), { recursive: true })
  appendFileSync(journalPath, `${JSON.stringify(turn)}\n`, 'utf8')
  return 'captured'
}

/** agent/disposed 的 SessionEnd 语义：active marker 置 false（deferred capture）。 */
export function deferCapture(cwd: string): boolean {
  const workspace = findWorkspace(cwd)
  if (!workspace) return false
  const markerPath = join(workspace, 'runtime', 'active-session.json')
  const marker = readJson(markerPath)
  if (!marker?.active) return false
  const now = new Date().toISOString()
  atomicWrite(markerPath, { active: false, learning_session_id: marker.learning_session_id, deferred_at: now, updated_at: now })
  return true
}

export function attachJournal(ctx: Context): void {
  const sessionCwd = (session: unknown): string | undefined =>
    (session as { header?: { cwd?: string } })?.header?.cwd
  const sessionIdOf = (session: unknown): string | undefined =>
    (session as { header?: { id?: string } })?.header?.id

  ctx.on('session/event', (session: unknown, event: { type: string; data?: unknown }) => {
    const header = (session as { header?: { delegationDepth?: number } })?.header
    if (header?.delegationDepth && header.delegationDepth > 0) return // 子代理会话不入 journal
    const cwd = sessionCwd(session)
    if (!cwd) return
    if (event.type === 'user/message') {
      const data = event.data as { content?: unknown; source?: { kind?: string } } | undefined
      if (data?.source?.kind && data.source.kind !== 'human') return // 插件注入的 user 消息不记
      captureEvent({ cwd, actor: 'user', kind: 'prompt', content: textOf(data?.content), externalSessionId: sessionIdOf(session) })
    } else if (event.type === 'assistant/message') {
      const data = event.data as { content?: unknown } | undefined
      captureEvent({ cwd, actor: 'agent', kind: 'teaching', content: textOf(data?.content), externalSessionId: sessionIdOf(session) })
    }
  })

  ctx.on('agent/disposed', ({ agent }: { agent: { session?: { header?: { cwd?: string } } } }) => {
    deferCapture(agent?.session?.header?.cwd ?? process.cwd())
  })
}
```

`dsh/src/index.ts` 的 apply 追加 `attachJournal(ctx)`。

- [ ] **Step 2: 写单测 journal.test.mjs（node:test，构造临时 .ioayn）**

`dsh/scripts/journal.test.mjs`：build 后从 `./lib/index.js` 导入（journal 函数需在 index.ts re-export：`export { captureEvent, deferCapture } from './journal.js'`），用例：

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('capture is gated by active marker and dedupes', async () => {
  const m = await import('../lib/index.js')
  const project = mkdtempSync(join(tmpdir(), 'ioayn-dsh-journal-'))
  const ws = join(project, '.ioayn')
  mkdirSync(join(ws, 'runtime'), { recursive: true })
  writeFileSync(join(ws, 'runtime', 'active-session.json'), JSON.stringify({ active: true, learning_session_id: 's1' }))
  assert.equal(m.captureEvent({ cwd: project, actor: 'user', kind: 'prompt', content: '第一问' }), 'captured')
  assert.equal(m.captureEvent({ cwd: project, actor: 'user', kind: 'prompt', content: '第一问' }), 'duplicate')
  assert.equal(m.captureEvent({ cwd: project, actor: 'user', kind: 'prompt', content: '' }), 'empty')
  const line = JSON.parse(readFileSync(join(ws, 'journal', 's1.jsonl'), 'utf8').trim())
  assert.equal(line.actor, 'user'); assert.equal(line.session_id, 's1')
  assert.equal(m.deferCapture(project), true)
  assert.equal(JSON.parse(readFileSync(join(ws, 'runtime', 'active-session.json'), 'utf8')).active, false)
  assert.equal(m.captureEvent({ cwd: project, actor: 'user', kind: 'prompt', content: '第二问' }), 'inactive')
})

test('no workspace yields no-workspace', async () => {
  const m = await import('../lib/index.js')
  const empty = mkdtempSync(join(tmpdir(), 'ioayn-dsh-none-'))
  assert.equal(m.captureEvent({ cwd: empty, actor: 'agent', kind: 'teaching', content: 'x' }), 'no-workspace')
})
```

- [ ] **Step 3: 跑测试**

```bash
cd dsh && npm run build && node --test scripts/journal.test.mjs
```
Expected: 2 passing。

- [ ] **Step 4: Commit**

```bash
git add dsh/src dsh/scripts
git commit -m "feat(dsh): event-driven journal capture with marker gating and dedupe"
```

---

### Task 6: preset 组合文件

**Files:**
- Create: `dsh/preset/preset.yml`
- Create: `dsh/preset/agent.cordis.yml`

**Interfaces:**
- Produces: preset id `ioayn`（目录名，安装时生成于 `$DSH_HOME/.agent-presets/ioayn/`）；agent-plane 组合引用 in-box 插件 + `ioayn-dsh` 包名。Task 8 的 install 拷贝本目录；Task 9 校验其结构。

- [ ] **Step 1: 写 preset.yml**

```yaml
name: IOAYN 模式
description: 以 Input/Output 驱动的引导式代码学习 agent：/learn-code 进入有边界的学习切片，持久化 journal、知识资产与认知 Atlas。
order: 10
```

- [ ] **Step 2: 写 agent.cordis.yml**

以 shipped `standard` preset（`E:\codex-prj\deepseek-harness\apps\cli\config\agent-presets\standard\agent.cordis.yml`）为底座拷贝，做四处改动：

1. **persona 行替换**为 IOAYN 文案（保留 `{{model}}`/`{{cwd}}` 模板变量）：

```yaml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      You are an IOAYN learning agent powered by the {{model}} model, working in {{cwd}}.
      You are first a coding agent, and always an IOAYN v1.1 tutor when the user invokes
      /learn-code, /resume-learning, or /view-atlas: teach bounded learning slices from
      observable input/output, state, producers, consumers, and boundaries; never from
      repository-wide summaries. New entities need a contextual role (input → action →
      output or side effect). Separate FACT / INFERENCE / UNKNOWN / CONFLICT with
      confidence. Per round, respect the cognitive budget (≤5 new entities, ≤3 files,
      ≤3 concepts, ≤8 flow nodes), then call commit_learning_round; persistence failures
      must be reported explicitly. The .ioayn/ workspace is the only writable state.
```

2. **删除** `tool-goal` 行（IOAYN goal 域由自己的 27 工具承载，避免双 goal 语义）。
3. **skills 两行替换**为 preset 本地根（照抄官方 cordis preset 的 baseUrl 写法）+ 追加 ioayn 工具行：

```yaml
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    includeDefaultRoots: false
    customSkillDirs:
      - !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"

- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'

- id: ioayn-tools
  name: 'ioayn-dsh'
```

（`includeDefaultRoots: false`：IOAYN 模式的技能面只有自带 3 技能，避免用户根技能混入教学模式；标准 preset 的其余行——bash/pwsh、fs、fs-search、jobs、plan-mode、compaction、delegation、ask-user、todo、web——原样保留。）

4. **delegation 组**中 `tool-subagent`/`tool-subagent-fork` 保留 continuable 默认；`tool-subagent-codex`/`tool-subagent-claude-code` 两个 disabled 行、`tool-ralph` 行删除（IOAYN 委派只用 spawn 子代理 + persona，见 Task 7）。

- [ ] **Step 3: YAML 解析冒烟**

```bash
node -e "
import('yaml').then(async ({ parse }) => {
  const fs = await import('node:fs')
  for (const f of ['dsh/preset/agent.cordis.yml']) {
    const doc = parse(fs.readFileSync(f, 'utf8'))
    if (!Array.isArray(doc)) throw new Error(f + ' not a list')
    console.log(f, doc.length, 'rows')
  }
})" 2>/dev/null || npx -y yaml-cli dsh/preset/agent.cordis.yml >/dev/null && echo "yaml OK"
```
Expected: `rows` 数为正且命令输出 `yaml OK`（正式结构校验在 Task 9 落地）。

- [ ] **Step 4: Commit**

```bash
git add dsh/preset
git commit -m "feat(dsh): IOAYN agent preset composition over the standard base"
```

---

### Task 7: preset skills 适配

**Files:**
- Create: `dsh/preset/skills/learn-code/SKILL.md`（+ `references/` 6 个文件、`references/agents/` 4 个 persona）
- Create: `dsh/preset/skills/resume-learning/SKILL.md`
- Create: `dsh/preset/skills/view-atlas/SKILL.md`

**Interfaces:**
- Consumes: 源 `skills/learn-code/{SKILL.md,references/*.md}`、`agents/*.md`。
- Produces: dsh 技能面：用户输入 `/learn-code`、`/resume-learning`、`/view-atlas` 触发（`disable-model-invocation: true` 保留）。

- [ ] **Step 1: 拷贝骨架**

```bash
mkdir -p dsh/preset/skills
cp -r skills/learn-code dsh/preset/skills/learn-code
cp skills/resume-learning/SKILL.md dsh/preset/skills/resume-learning/SKILL.md 2>/dev/null || (mkdir -p dsh/preset/skills/resume-learning && cp skills/resume-learning/SKILL.md dsh/preset/skills/resume-learning/SKILL.md)
mkdir -p dsh/preset/skills/view-atlas && cp skills/view-atlas/SKILL.md dsh/preset/skills/view-atlas/SKILL.md
mkdir -p dsh/preset/skills/learn-code/references/agents
cp agents/slice-explorer.md agents/learning-tutor.md agents/runtime-verifier.md agents/knowledge-curator.md dsh/preset/skills/learn-code/references/agents/
rm -rf dsh/preset/skills/learn-code/evals
```

- [ ] **Step 2: 对三个 SKILL.md 施加统一转写规则**

逐条规则（对三个文件一致执行）：

1. frontmatter 顶部加同步注记行（YAML 注释）：`# synced-from: skills/learn-code@1.1.3`（各自的源路径与版本）。
2. `${CLAUDE_SKILL_DIR}/references/x.md` → `references/x.md`（dsh 按 resourceBase 解析）。
3. `$ARGUMENTS` 全部替换为固定句式：`the user's message text after the /learn-code command`（resume/view 同理用各自命令名）。
4. `Use the \`ioayn\` MCP Server` → `Use the IOAYN tools registered in this session`（27 个工具原名不变，无 mcp__ 前缀）。
5. 交叉引用 `/ioayn:learn-code` → `/learn-code`、`/ioayn:resume-learning` → `/resume-learning`。
6. SessionEnd 句（learn-code §9）：`when the learner just closes the terminal, the SessionEnd hook defers capture` → `when the learner closes the session, automatic capture defers automatically; on the next visit offer /resume-learning`。
7. **子代理委派段**（learn-code §3/§5/§6/§7 提到 slice-explorer/learning-tutor/runtime-verifier/knowledge-curator 处）统一替换为 dsh 调用说明，并在 §3 前插入一段：

```markdown
## Subagent delegation in dsh

Delegate with the `subagent` tool (provider `spawn`, one-shot). For each IOAYN role,
pass the full persona text from the matching file as the child persona and scope its
tools with a deny filter:

- slice-explorer → persona `references/agents/slice-explorer.md`, deny: write, edit
- learning-tutor → persona `references/agents/learning-tutor.md`, deny: write, edit, bash
- runtime-verifier → persona `references/agents/runtime-verifier.md`, deny: write, edit
- knowledge-curator → persona `references/agents/knowledge-curator.md`, deny: write, edit

When delegation is unavailable, fall back to bounded in-conversation exploration with
the same cognitive budgets — never skip the round.
```

（deny 列表逐角色照抄源 agents/*.md 的 `disallowedTools`。）

8. references/ 下 6 个 policy 文件与 4 个 persona 文件内容不改（只随目录走）；persona 文件的 frontmatter 保留原文档式 frontmatter（作为 persona 文本传入时 dsh 不解析它）。

- [ ] **Step 3: frontmatter 合法性自查**

三个 SKILL.md 的 frontmatter 必须满足：`name` kebab-case、`description` 非空、`disable-model-invocation: true` 保留、`argument-hint` 可留（dsh 解析为开放 YAML，未知键被忽略）。快速断言：

```bash
grep -L "disable-model-invocation: true" dsh/preset/skills/*/SKILL.md && echo "MISSING" || echo "all gated"
```
Expected: `all gated`。

- [ ] **Step 4: Commit**

```bash
git add dsh/preset/skills
git commit -m "feat(dsh): adapt IOAYN skills and subagent personas for the preset"
```

---

### Task 8: 安装命令 bin.mjs

**Files:**
- Create: `dsh/bin.mjs`
- Create: `dsh/scripts/bin.test.mjs`

**Interfaces:**
- Produces: CLI 子命令 `install [--force]`、`uninstall`、`status`。安装目标 `$DSH_HOME/.agent-presets/ioayn/`（`DSH_HOME` 环境变量优先，默认 `~/.dsh`；与 dsh `resolveDshHome` 语义一致）。

- [ ] **Step 1: 写 bin.mjs**

```javascript
#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const pkgDir = fileURLToPath(new URL('.', import.meta.url))
const presetSrc = join(pkgDir, 'preset')
const version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
function presetDst() {
  return join(dshHome(), '.agent-presets', 'ioayn')
}
function installedVersion() {
  const marker = join(presetDst(), '.ioayn-dsh-version')
  return existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null
}

const [cmd, ...rest] = process.argv.slice(2)
const force = rest.includes('--force')

if (cmd === 'install') {
  if (!existsSync(presetSrc)) throw new Error(`preset template missing: ${presetSrc}`)
  if (existsSync(presetDst()) && !force) {
    const old = installedVersion()
    console.error(`ioayn preset already installed${old ? ` (v${old})` : ''}; rerun with --force to replace (current package v${version})`)
    process.exit(1)
  }
  mkdirSync(join(dshHome(), '.agent-presets'), { recursive: true })
  rmSync(presetDst(), { recursive: true, force: true })
  cpSync(presetSrc, presetDst(), { recursive: true })
  cpSync(join(pkgDir, 'package.json'), join(presetDst(), '.ioayn-dsh-package.json'))
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(presetDst(), '.ioayn-dsh-version'), version)
  console.log(`installed IOAYN preset v${version} → ${presetDst()}`)
} else if (cmd === 'uninstall') {
  if (!existsSync(presetDst())) { console.log('ioayn preset not installed'); process.exit(0) }
  rmSync(presetDst(), { recursive: true, force: true })
  console.log(`removed ${presetDst()}`)
} else if (cmd === 'status') {
  const libOk = existsSync(join(pkgDir, 'lib', 'index.js'))
  console.log(`package: ioayn-dsh v${version} (plugin build: ${libOk ? 'present' : 'MISSING — run npm run build'})`)
  console.log(`preset: ${existsSync(presetDst()) ? `installed v${installedVersion() ?? 'unknown'}` : 'not installed'} at ${presetDst()}`)
} else {
  console.error('usage: ioayn-dsh install [--force] | uninstall | status')
  process.exit(cmd ? 1 : 0)
}
```

（顶层 `await import` 需在 ESM 顶层可用——bin.mjs 是 ESM，`await` 顶层合法；为简洁可把 `writeFileSync` 与其它 fs 导入合并声明。）

- [ ] **Step 2: 写 bin.test.mjs（DSH_HOME 指向临时目录）**

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const bin = new URL('../bin.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

test('install/uninstall lifecycle', () => {
  const home = mkdtempSync(join(tmpdir(), 'ioayn-dsh-home-'))
  const env = { ...process.env, DSH_HOME: home }
  const out = (args) => execFileSync('node', [bin, ...args], { env, encoding: 'utf8' })
  out(['install'])
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', 'agent.cordis.yml')))
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', 'skills', 'learn-code', 'SKILL.md')))
  assert.equal(out(['status']).includes('installed v'), true)
  let failed = false
  try { out(['install']) } catch { failed = true }
  assert.ok(failed, 'second install must fail without --force')
  out(['install', '--force'])
  out(['uninstall'])
  assert.equal(existsSync(join(home, '.agent-presets', 'ioayn')), false)
})
```

- [ ] **Step 3: 跑测试**

```bash
cd dsh && node --test scripts/bin.test.mjs
```
Expected: 1 passing。

- [ ] **Step 4: Commit**

```bash
git add dsh/bin.mjs dsh/scripts/bin.test.mjs
git commit -m "feat(dsh): install/uninstall/status command for the user preset directory"
```

---

### Task 9: verify-dsh 接入 npm run verify

**Files:**
- Create: `scripts/verify-dsh.mjs`
- Modify: 根 `package.json` scripts（verify 链追加）
- Modify: `scripts/verify-repository.mjs`（若其维护必需文件清单，追加 dsh 关键文件）

**Interfaces:**
- Consumes: `dsh/preset/*`、`dsh/lib/index.js`（re-export 的 `IOAYN_TOOL_PARAMS` 与 `IOAYN_TOOLS`）、`dsh/bin.mjs`、`yaml`（dsh devDep）。

- [ ] **Step 1: 写 verify-dsh.mjs（四层检查）**

```javascript
// 层1 结构：YAML 合法 + in-box 插件名存在于本机已安装 dsh + preset id 合法
// 层2 技能：frontmatter 规则（name kebab-case、description、disable-model-invocation）
// 层3 对齐：IOAYN_TOOL_PARAMS 的键集合 == core 27 工具名集合，且每个工具的参数名集合 == core zod 字段名集合
// 层4 安装演练：DSH_HOME=tmp 跑 bin install，断言产物存在
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const require = createRequire(join(root, 'dsh', 'package.json')) // yaml 依赖装在 dsh 包
const yaml = require('yaml')

// 层1
const agent = yaml.parse(readFileSync(join(root, 'dsh/preset/agent.cordis.yml'), 'utf8'))
if (!Array.isArray(agent)) throw new Error('agent.cordis.yml must be a row list')
const IN_BOX = new Set(['@deepseek-ai/dsh-persona', '@deepseek-ai/dsh-agent-instructions', '@deepseek-ai/dsh-tool-bash', '@deepseek-ai/dsh-tool-pwsh', '@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-tool-fs-search', '@deepseek-ai/dsh-tool-jobs', '@deepseek-ai/dsh-skill-filesystem', '@deepseek-ai/dsh-tool-skill', '@deepseek-ai/dsh-plan-mode', '@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-command-compact', '@deepseek-ai/dsh-compaction-tool-result-pruner', '@deepseek-ai/dsh-tool-subagent-control', '@deepseek-ai/dsh-tool-subagent', '@deepseek-ai/dsh-workflow-worker-thread', '@deepseek-ai/dsh-tool-workflow', '@deepseek-ai/dsh-tool-ask-user', '@deepseek-ai/dsh-tool-todo', '@deepseek-ai/dsh-tool-web'])
const names = new Set(agent.map(r => r?.name).filter(Boolean))
for (const name of names) {
  if (name === 'ioayn-dsh' || name === 'cordis:group' || IN_BOX.has(name)) continue
  throw new Error(`agent.cordis.yml references unknown plugin row: ${name}`)
}
if (!/^[a-z0-9][a-z0-9-]*$/.test('ioayn')) throw new Error('preset id invalid')

// 层2
for (const skill of ['learn-code', 'resume-learning', 'view-atlas']) {
  const raw = readFileSync(join(root, `dsh/preset/skills/${skill}/SKILL.md`), 'utf8')
  const fm = yaml.parse(raw.split('---')[1] ?? '')
  if (fm.name !== skill || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name ?? '')) throw new Error(`skill name invalid: ${skill}`)
  if (typeof fm.description !== 'string' || !fm.description.trim()) throw new Error(`skill description missing: ${skill}`)
  if (fm['disable-model-invocation'] !== true) throw new Error(`skill must be user-invocable only: ${skill}`)
}

// 层3：dsh 参数表与 core zod 字段名对齐（两侧都来自 dsh/lib 构建产物的 re-export）
const dshLib = await import(join(root, 'dsh/lib/index.js'))
const params = dshLib.IOAYN_TOOL_PARAMS ?? {}
const tools = dshLib.IOAYN_TOOLS ?? []
if (tools.length !== 27 || Object.keys(params).length !== 27) throw new Error(`tool count mismatch (expected 27, got core ${tools.length} / dsh ${Object.keys(params).length})`)
for (const tool of tools) {
  const spec = params[tool.name]
  if (!spec) throw new Error(`missing ParameterSchemaSpec: ${tool.name}`)
  const zodKeys = new Set(Object.keys(tool.inputSchema.shape ?? {})) // 27 个工具的 inputSchema 均为 z.object
  const dslKeys = new Set(Object.keys(spec))
  for (const k of zodKeys) if (!dslKeys.has(k)) throw new Error(`tool ${tool.name}: param "${k}" missing from dsh DSL`)
  for (const k of dslKeys) if (!zodKeys.has(k)) throw new Error(`tool ${tool.name}: dsh DSL has extra param "${k}"`)
}

// 层4
const home = mkdtempSync(join(tmpdir(), 'ioayn-verify-home-'))
execFileSync('node', [join(root, 'dsh/bin.mjs'), 'install'], { env: { ...process.env, DSH_HOME: home } })
for (const f of ['agent.cordis.yml', 'preset.yml', 'skills/learn-code/SKILL.md']) {
  if (!existsSync(join(home, '.agent-presets', 'ioayn', f))) throw new Error(`install drill missing ${f}`)
}
console.log('verify-dsh: OK')
```

- [ ] **Step 2: 接入根 package.json**

```json
"verify:dsh": "npm --prefix dsh run build && node --test dsh/scripts/journal.test.mjs dsh/scripts/bin.test.mjs && node scripts/verify-dsh.mjs",
"verify": "npm run check:repo && npm run typecheck && npm run build && npm run schemas && npm run test && npm run verify:dsh && npm run check:repo"
```

（dsh 的 typecheck 并入 verify:dsh 前置：`npm --prefix dsh run typecheck &&`。）

- [ ] **Step 3: 全量验证**

```bash
npm run verify
```
Expected: 全绿，末尾 `verify-dsh: OK`。

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-dsh.mjs package.json
git commit -m "test(dsh): verify preset structure, skill frontmatter, tool alignment, install drill"
```

---

### Task 10: 真机集成验收（手动门，不进 verify）

**Files:** 无代码；产出验收记录 `docs/superpowers/plans/2026-08-26-dsh-agent-mode-acceptance.md`

- [ ] **Step 1: 本机安装并验证解析（spec §7 的 UNKNOWN 项）**

```bash
dsh plugin --profile ioayn-test add ./dsh     # 本地包安装（等价验证 bundle 流程）
DSH_HOME=<临时目录> node dsh/bin.mjs install  # 或装到真实 DSH_HOME
dsh --profile ioayn-test --dump-config        # 确认 ioayn-dsh 层存在
```

预期：dump 出现 `# == ioayn-dsh` 层。**若 preset 内裸包名 `ioayn-dsh` 行解析失败**（spec §7 UNKNOWN），执行 fallback：`dsh/cordis.patch.yml` 从空层改为插入 host disabled 锚行 `- insert: [{ id: ioayn-tools, name: ioayn-dsh, disabled: true }]` 后重测；再失败则 preset 行改写为指向 profile node_modules 的相对路径，并把结果回填 spec。

- [ ] **Step 2: 真实会话验收清单（需要 DeepSeek API）**

`dsh --profile ioayn-test`，选"IOAYN 模式"，逐项记录：

1. 模式选择器出现 "IOAYN 模式"；
2. `/learn-code 学习 X` 触发技能注入，preflight→create_goal→start_learning_session 全链工具可调；
3. 教学一轮后 `.ioayn/journal/<session>.jsonl` 出现 user/agent 两种 turn（事件捕获真机生效）；
4. `commit_learning_round` 成功，round/asset/atlas 落盘；
5. 退出会话后 marker `active:false`（agent/disposed 生效）；
6. `/resume-learning` 恢复成功；
7. 子代理委派：learn-code 委派 slice-explorer persona 成功且子会话 journal 无污染（delegationDepth 门控生效）。

- [ ] **Step 3: 把结果（含任何 fallback 决定）写进验收记录并提交**

```bash
git add docs/superpowers/plans/2026-08-26-dsh-agent-mode-acceptance.md
git commit -m "docs(dsh): record real-machine acceptance results"
```

---

### Task 11: 文档、版本与 spec 勘误回填

**Files:**
- Modify: `README.md`（dsh 安装/使用章节）、`CHANGELOG.md`、`RELEASE_NOTES.md`、`BUILD_INFO.json`
- Modify: `docs/superpowers/specs/2026-08-26-dsh-agent-mode-design.md`（回填 Task 10 的 fallback 决定与勘误）
- Create: `dsh/README.md`（安装两步说明、user-trust 提示、并发限制声明）

- [ ] **Step 1: README/CHANGELOG/RELEASE_NOTES/BUILD_INFO 按 AGENTS.md 交付模板更新**

要点：目标用户问题（dsh 用户以 IOAYN 方式学代码）、影响的 IOAYN 原则（#9 轮次提交、#13 隐私 opt-in 在事件捕获下的等价性、#14 结构化状态权威）、修改文件清单、执行验证（npm run verify + Task 10 验收）、已知限制（并发禁用、compact_summary 不捕获、StopFailure 无等价）。

- [ ] **Step 2: dsh/README.md**

内容骨架：两步安装命令；`$DSH_HOME/.agent-presets` 信任语义（user trust = shell 权限）；同一 `.ioayn/` 禁止两端并发使用；卸载/更新；P2 后续（原生 compact 捕获、`@deepseek-ai/dsh-hooks-claude-code` 可选桥）。

- [ ] **Step 3: 最终全量验证 + 提交**

```bash
npm run verify
git add README.md CHANGELOG.md RELEASE_NOTES.md BUILD_INFO.json dsh/README.md docs
git commit -m "docs: ship IOAYN dsh agent mode (v0.1.0)"
```

---

## Self-Review 记录

- **Spec 覆盖**：§3 架构→Task 1-5；§4 布局→Task 3；§5 工具注册（DSL+输出契约+zod 复验）→Task 4；§5 journal 表→Task 5（compaction 事件名未证实，v1 不捕获，spec 勘误）；§6 skills→Task 7；§7 安装与 UNKNOWN 验证→Task 8+10；§8 验证五层→Task 5/8/9（mount 冒烟降级为 discovery/结构检查 + 真机 mount 门，spec 勘误）；§9 限制→Task 11 文档；§10 交付物→Task 11。
- **Spec 勘误**（随 Task 11 回填）：工具数 18→27；PostCompact 行改为"v1 不捕获"；mount 冒烟表述降级。
- **类型一致性**：`findWorkspace`/`createStore`/`IOAYN_TOOLS`/`IoaynTool`（execute 收 store 第二参数）/`registerIoaynTools`/`attachJournal`/`captureEvent`/`deferCapture`/`IOAYN_TOOL_PARAMS` 各任务间签名一致；27 工具名清单在 Task 2 定为唯一权威。
- **占位符**：Task 4 Step 2 的"逐字转写"指令依赖 Task 2 落成的 core/tools.ts 现场源码 + Task 9 对齐检查强制，无 TBD 步骤。
