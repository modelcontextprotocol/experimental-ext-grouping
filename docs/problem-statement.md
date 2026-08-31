# Progressive Discovery Problem Statement

## Large tool catalogs impose measurable costs

An eager tool catalog places every active tool's name, description, and schema
in model context before the tool is needed. As the catalog grows, it imposes
three costs:

- **Cost:** Complete tool definitions consume input tokens on every model
  request where they are active.  
- **Accuracy:** Tool selection becomes harder as the number of choices and the
  overlap between them increase. Microsoft Research reports performance losses
  of up to 85% for some models in large tool spaces. Its survey of 1,470
  runnable MCP servers found one server with 256 tools and ten more with over
  100
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

## CLIs and Skills avoid the same penalty

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

MCP does not standardize an equivalent relationship between a narrow entrypoint
and later expansion into relevant primitive definitions.

## Relative benchmarks of MCP Vs CLIs actively harm MCP client support

Agent authors frequently use coding based evaluation tasks to compare CLI and
MCP equivalents where they exist, and the lack of support for effective
progressive discovery for MCP from the whole ecosystem (model providers, harness
builders and MCP itself), has reduced the ability to counter that narrative
effectively. This has systematically led to MCP features being de-prioritised,
and in some specific cases has led to partial MCP surface being exposed ex.
GitHub Copilot CLI only natively exposes a few of GitHub MCP Server’s tools \-
ones with the least overlap with the CLI \- and these decisions are made
primarily by comparing benchmark results

## Why something needs to happen in MCP

The server knows its capability catalog and semantics. The client knows the
user's task, the model's limits, local policy, and its context-management
strategy. Neither side has enough information to implement dependable discovery
alone.

MCP is the shared layer where the server can provide authoritative discovery
signals and the client can decide how to apply them. Without a protocol-level
contract, each server-client pair must recreate that integration, and behavior
will continue to vary across clients.

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
4. **Dynamic correctness:** Discovery can reflect authorization, configuration,
   and catalog changes while remaining cacheable.  
5. **Execution method agnostic:** MCP has never stipulated that tools be
   directly submitted to models, and the protocol should remain agnostic to
   client implementations \- the emergence of tool search, client initiated lazy
   loading of tools, MCP CLIs and programmatic tool calling/code mode all
   indicate that clients are still innovating in this space, and this effort
   should be an enabler of this. Ex. progressive discovery metadata could be
   used to make a graph graph from mcp primitives for an MCP CLI with nested
   subcommands \- or provide metadata for tool search.

The success criterion is simple: a user can install a broad MCP server and leave
it connected. Adding capabilities does not proportionally increase the agent's
always-loaded context, and using a new capability does not require the user to
know its server, toolset, or exact name in advance.
