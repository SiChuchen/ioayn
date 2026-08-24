# External References

实现和发布前，应核对当前官方资料：

- Claude Code Plugins: https://code.claude.com/docs/en/plugins
- Claude Code Plugins Reference: https://code.claude.com/docs/en/plugins-reference
- Claude Code Skills: https://code.claude.com/docs/en/skills
- Claude Code Subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code Hooks: https://code.claude.com/docs/en/hooks
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Model Context Protocol: https://modelcontextprotocol.io/
- MCP TypeScript SDK: https://ts.sdk.modelcontextprotocol.io/

## v1.1 implementation assumptions to re-check

- plugin directory conventions for `skills/`, `agents/`, `hooks/` and `.mcp.json`;
- hook event names and payload fields used by `capture-hook.mjs`;
- plugin root and project directory environment substitution;
- local stdio MCP startup behavior;
- Claude Code plugin validator and `--plugin-dir` development flow.

External APIs and configuration may change. The repository's bundled server can be tested independently, but Claude Code integration claims must be verified against the installed CLI version rather than inferred from historical documentation.
