# Approaches Being Explored
[Problem Statement](problem-statement.md) |
[Use Cases](use-cases.md) |
Approaches |
[Open Questions](open-questions.md) |
[Experimental Findings](experimental-findings.md) |
[Related Work](related-work.md) |
[Contributing](../CONTRIBUTING.md)

This document lists different primitive organization strategies. Many are specific to MCP tools, while primitive grouping applies to Prompts, Tasks, Resources, etc., as well.

## Primitive Grouping
[Discussion](https://github.com/modelcontextprotocol/experimental-ext-grouping/discussions/2)

Large MCP servers e.g, Github, Azure, Workspaces, etc., organize primitives into semantic groups. Clients select the groups to use for a particular request / scenario, and servers only list primitives corresponding to those.

Currently, even though some servers and gateways implement grouping, they do so in an ad-hoc manner, which prevents clients from engaging with them meaningfully. For all of these, users must manually configure groups in the server configuration, except for GitHub MCP where LLM agents can optionally use special tools to enable / disable groups.

**Examples:**

- Servers Grouping Primitives:
  1. Github MCP Server – [ToolSets](https://github.com/github/github-mcp-server?tab=readme-ov-file#tools)
  2. Azure Dev Ops – [Domains](https://github.com/github/github-mcp-server?tab=readme-ov-file#tools)
  3. Workspace MCP – [Services](https://github.com/taylorwilsdon/google_workspace_mcp?tab=readme-ov-file#-available-tools)
- Gateways / Middleware:
  1. MCPJungle – [Groups](https://github.com/mcpjungle/MCPJungle?tab=readme-ov-file#tool-groups)
- Clients
  1. ??

**References:**

1. [SEP-2084: Primitive Groups](https://github.com/chughtapan/modelcontextprotocol/blob/e15be3979999a3fdf64a61681558358d4c8c958c/docs/community/seps/2084-primitive-groups.mdx): Rejected by [core maintainers](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2204) to avoid locking into one approach too early
2. [SEP-2084: Primitive Groups - Alternative drafts](https://docs.google.com/document/d/1e7CkEz_8HEC3EARIDZ8Zkl1s3i_u7Oe2cxS36FphEkA/edit?tab=t.0#heading=h.pumr9ld3el7i): Alternative specifications for primitive grouping discussed in #primitive-group-wg.
3. [SEP-993: Namespaces](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/993): Inserts a namespace parameter prior to primitive list methods, e.g., `<namespace>/tools/list` as a method for grouping. Also rejected by core maintainers with less clear feedback.
## Tool Fusion (mcp-fusion)
[Discussion](https://github.com/modelcontextprotocol/experimental-ext-grouping/discussions/3)

Instead of including many individual tools with similar schemas in the prompt, fusion creates a "grouped" tool which uses a discriminator field to specify the "opcode" and annotates what parameters are needed for each op.

**References:**

1. [mcp-fusion](https://github.com/vinkius-labs/mcp-fusion) – Reference implementation of this technique in Typescript.

## Tool Search
[Discussion](https://github.com/modelcontextprotocol/experimental-ext-grouping/discussions/4)

Clients like Claude Code enable "lazy" tool loading — the system prompt includes stubs for each tool, while detailed schemas and docs are added into the context using a common "ToolSearch" tool provided by the client.

**Examples:**

- Clients:
  1. Claude / Claude Code – API [reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)

## Code Mode
[Discussion](https://github.com/modelcontextprotocol/experimental-ext-grouping/discussions/5)

Instead of calling tools individually, copying data fields across turns, etc., clients treat MCP tools as library functions and write scripts which can execute complex chains of tools in a single turn. Requires structuredOutputs setup correctly.

**Examples:**

- Clients:
  1. Claude – API [reference](https://platform.claude.com/cookbook/tool-use-programmatic-tool-calling-ptc)
  2. Cloudflare Workers – [announcement](https://blog.cloudflare.com/code-mode/)
