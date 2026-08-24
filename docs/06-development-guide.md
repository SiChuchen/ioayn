# 06 — Development Guide v1.1

## 环境

- Node.js 20+
- npm
- Git
- 可选：Claude Code，用于真实插件加载与行为评测

## 安装与验证

```bash
npm run setup
npm run verify
```

`verify` 依次执行 repository checks、TypeScript strict、bundle 和 tests。

## 服务端

```bash
cd server
npm ci
npm run typecheck
npm run build
npm run test:smoke
```

测试包含完整持久化闭环、Atlas、历史连接、resume、Hook capture 和 v1.0 migration。

## JSON Schema

Zod 是单一来源。修改 `server/src/schemas.ts` 后运行：

```bash
cd server
npx esbuild src/export-schemas.ts --bundle --platform=node --format=esm --target=node20 --outfile=/tmp/ioayn-export-schemas.mjs
node /tmp/ioayn-export-schemas.mjs ../schemas
```

不要直接修改生成的实体 Schema。

## 插件测试

```bash
claude --plugin-dir /path/to/ioayn-v1.1.0
```

检查：

```text
/mcp
/agents
/help
```

然后执行一条真实 `/ioayn:learn-code`。Hooks、Agents 与 MCP 改动后运行 `/reload-plugins`。

## 目录

```text
skills/     方法与用户工作流
agents/     隔离探索、验证、教学和知识提炼
hooks/      Claude Code 生命周期配置
scripts/    Hook 捕获和仓库验证
server/     MCP 源码、构建和测试
schemas/    生成的外部数据契约
docs/       章程、架构、ADR、路线图和交接
examples/   v1.1 示例资产
```

## 新工具规则

新增 MCP 工具前回答：

- 它是否能被现有窄工具组合？
- 输入是否有边界？
- 是否写入产品源码或任意路径？
- 是否需要用户批准？
- 是否能幂等重试？
- 是否有 schema、validation 和 smoke test？

## 发布清单

- 更新 VERSION、package versions、plugin manifest；
- 生成 dist；
- 生成 JSON Schema；
- 更新 CHANGELOG / RELEASE_NOTES / BUILD_INFO；
- `npm run verify`；
- 在有 Claude Code 的环境运行 plugin validate 和真实项目评测；
- 生成 zip 与 SHA-256。
