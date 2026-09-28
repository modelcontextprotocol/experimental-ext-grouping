# Progressive Discovery Problem Statement

This statement considers progressive discovery of tools, prompts, and resources.
Tools provide the primary motivating examples and quantitative evidence.

## Large tool catalogs impose measurable costs

An eager tool catalog places every active tool's name, description, and schema
in model context before the tool is needed. As the catalog grows, it imposes
three costs:

- **Cost:** Complete tool definitions consume input tokens on every model
  request where they are active.  
- **Accuracy:** Tool selection becomes harder as the number of choices and the
  overlap between them increase. The [LongFuncEval
  benchmark](https://arxiv.org/abs/2505.10570v1) reports performance degradation of
  up to 85% for some evaluated models as tool-catalog context length and the
  position of the relevant tool vary. Microsoft Research's survey of 1,470
  runnable MCP servers found one server with 256 tools and ten more with over 100
  ([survey](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/)).
  The peer-reviewed [MetaTool
  benchmark](https://proceedings.iclr.cc/paper_files/paper/2024/hash/bc12914d66b41b6bfc2d3a5decdb498b-Abstract-Conference.html)
  likewise found that most of eight evaluated models struggled to decide whether
  to use a tool and which tool to select.  
- **Latency:** Larger inputs increase transfer and model-prefill work across
  planning, tool calls, and follow-up turns. Prompt caching can reduce this
  cost, but availability and invalidation behavior vary across providers, and
  caching does not remove tool-selection interference.

Exact thresholds vary by model and task. MCP is model-independent, so servers
cannot assume that every client can usefully accommodate the same catalog size.
The practical requirement is to keep the *active* catalog small without making
the broader catalog unreachable.

## Server management becomes developer overhead

A consequence of the accuracy, cost, and latency drawbacks is that developers
cannot freely install MCP servers as they need them and leave those servers
available. In an eager-loading client, every active server consumes part of the
agent's tool and context budget, so installation becomes an ongoing curation
decision rather than a one-time way to add a capability.

Consider the request: "Find production databases without recent backups, open
remediation tickets, and notify the owning teams." A partitioned deployment may
require database administration, monitoring, issue tracking, and messaging
servers. The developer must either load all four domains up front or reconfigure
the agent as the workflow crosses between them. A disabled server is cheap, but
the agent generally cannot discover a capability on a server it does not know it
should activate.

This prevents broad platforms from offering a broad entrypoint. A single
prebuilt MCP Toolbox surface for Cloud SQL for PostgreSQL contains [50 tool
definitions](https://github.com/googleapis/mcp-toolbox/blob/418f302f1c47d53a4f63f5bc629dc9fac0d5bcd2/internal/prebuiltconfigs/tools/cloud-sql-postgres.yaml).
At platform scale, the `gcloud` CLI supports [more than 8,000
commands](https://cloud.google.com/cli). A flat Google Cloud MCP catalog is not
practical, but requiring developers to select many product-specific servers
multiplies the configurations they must maintain across every harness and gives
up the simplicity of installing, authenticating, governing, and operating one
platform integration.

A simpler entrypoint is easier for developers to adopt and use successfully. For
example, a developer could install one Google Cloud MCP server, leave it
connected, and retain access to the platform without placing the entire platform
catalog in model context.

## CLIs and Skills illustrate progressive discovery

CLIs and Skills separate the small entrypoint required for discovery from the
larger body of information required for execution:

- **CLI:** An executable name and, if needed, a short description expand into
  `--help`, subcommand help, and finally execution.  
- **Skill:** A name and description expand into the full `SKILL.md`, then
  referenced files or scripts.

An agent does not need all 8,000 `gcloud` command descriptions in context. It
needs to know that `gcloud` exists, then can inspect `gcloud --help`, `gcloud
sql --help`, and one command's help as needed.

Agent Skills formalize this loading pattern: clients initially expose only each
Skill's name and description, load the full `SKILL.md` when it is activated, and
load supporting files during execution ([Agent Skills
overview](https://agentskills.io/home)). Adding many Skills therefore adds a
small discovery index rather than many full instruction sets.

These examples illustrate how discovery information can be loaded incrementally.
Execution interfaces, argument validation, and authorization are separate
considerations; progressive discovery should accommodate different client
execution strategies.

MCP does not standardize an equivalent relationship between a narrow entrypoint
and later expansion into relevant primitive definitions.

## Catalog costs can limit the capabilities clients expose

Catalog size can influence which capabilities clients expose by default. For
example, GitHub Copilot CLI [reduced its default GitHub MCP tool set to conserve
context-window space](https://github.com/github/copilot-cli/blob/main/changelog.md#00350---2025-10-23),
noting that the model could use the GitHub CLI for omitted tools when available.

This illustrates a practical consequence of eager loading: clients may restrict
the default capability surface to manage context costs. Progressive discovery
could allow clients to expose broader catalogs while loading detailed
definitions only when needed.

## Why something needs to happen in MCP

Progressive discovery commonly builds on information supplied by the providers
of the primitives being discovered. CLI authors organize commands and provide
help text; Skill authors supply descriptions, instructions, and references that
consumers load progressively. The consumer controls discovery, but the provider
supplies information about what is available and how to use it.

MCP servers already provide primitive names, descriptions, and schemas. Clients
can use these definitions to implement discovery, but relationships, entrypoints,
and task-oriented guidance may not be explicit in individual definitions.
Servers can supply that broader context, while clients contribute knowledge of
the user's task, model limits, and local policy.

A shared discovery contract would let servers communicate this information
consistently across clients, while leaving clients free to choose how they
search, select, and present primitives.

MCP should therefore enable an optional progressive-discovery contract with
these properties:

1. **Bounded entrypoint:** A server can summarize a large capability space
   without the harness placing every primitive definition in model context. MCPs
   bundled in plugins or “connectors” should be capable of exposing their full
   surface, currently the lack of user configuration capabilities frequently
   prevents this.  
2. **Selective expansion:** A client can resolve an intent or reference into
   relevant tools, prompts, or resources.  
3. **Server-provided semantics:** Servers can communicate relationships,
   entrypoints, and task-oriented guidance without prescribing the client's
   search or prompt implementation.  
4. **Dynamic correctness:** Discovery can reflect changes in authorization,
   configuration, and the capability catalog. Any new discovery surface should
   preserve existing authorization and cache-scope semantics.
5. **Prompt-cache efficiency:** Progressive discovery should allow clients to
   preserve stable prompt prefixes where possible, while incorporating newly
   discovered capabilities and updated definitions.
6. **Execution method agnostic:** MCP has never stipulated that tools be
   directly submitted to models, and the protocol should remain agnostic to
   client implementations \- the emergence of tool search, client initiated lazy
   loading of tools, MCP CLIs and programmatic tool calling/code mode all
   indicate that clients are still innovating in this space, and this effort
   should be an enabler of this.

The success criterion is simple: a user can install a broad MCP server and leave
it connected. Adding capabilities does not proportionally increase the agent's
always-loaded context, and using a new capability does not require the user to
know its server, toolset, or exact name in advance.

Approaches should be evaluated on initial context size, total token usage,
end-to-end latency, and task completion across representative catalog sizes and
workflows. Evaluation should account for discovery overhead and failures to find
relevant primitives.

## Non-goals

- **Disambiguation of primitive naming:** For example, two servers may both
  expose a tool named `search`, and a client may distinguish them as
  `github_search` and `slack_search`. Defining naming conventions or how
  server-authored guidance refers to those renamed tools is outside the scope
  of this effort.
