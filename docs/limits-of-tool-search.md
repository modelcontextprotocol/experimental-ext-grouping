# The Limits of Tool Search

## Background: native tool calling

Before native tool calling, applications described tools in prompts, parsed
calls from model-generated text, and supplied results through custom conventions.
Native tool calling gives definitions, calls, and results dedicated API
representations. The model selects a tool and generates its arguments; the
application executes it and returns the result.

The following exchange illustrates the mechanics; field names and schema syntax
are simplified, since provider formats differ ([OpenAI tool-calling
flow](https://developers.openai.com/api/docs/guides/function-calling#the-tool-calling-flow),
[Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)):

```text
Application → Model API
  tools: [{
    name: "get_weather",
    description: "Get the current weather for a location.",
    parameters: { location: string }
  }]
  user: "What's the weather in Paris?"

Model API → Application
  tool_call: {
    id: "call_1",
    name: "get_weather",
    arguments: { location: "Paris" }
  }

Application executes get_weather("Paris").

Application → Model API
  tool_result: { call_id: "call_1", output: "18°C, sunny" }

Model API → Application
  assistant: "It's 18°C and sunny in Paris."
```

The application remains responsible for authorization, application-level
validation, and execution. Native tool calling standardizes the interaction and
provides several advantages:

- **A stable interface:** Providers can train and optimize tool use around a
  consistent representation ([Claude tool
  definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)).
- **Schema constraints:** Supported APIs can constrain generated arguments to
  the declared schema ([OpenAI strict
  mode](https://developers.openai.com/api/docs/guides/function-calling#strict-mode)).
- **Selection controls:** Supported APIs let applications restrict the available
  tools or require particular tool choices.
- **Structured orchestration:** Call identifiers correlate results, and supported
  models can request multiple independent calls in one turn ([OpenAI parallel
  calls](https://developers.openai.com/api/docs/guides/function-calling#parallel-function-calling)).

Progressive discovery should preserve these benefits. Finding a tool is only
part of the problem: its definition must also enter the native interface or risk
losing the above benefits.

## Tool search is hard to do right

MCP gives clients `tools/list` and `tools/call`, but it does not give them a
standard way to search across tool catalogs or introduce a search result into a
model's native tool interface. A client that wants progressive discovery must
therefore decide where tool search will run.

Doing this well means preserving both native tool calling and efficient prompt
caching. The server and proxy approaches below hide individual tools behind a
generic executor. Client-side registration preserves native calls, but changing
the top-level tool list can invalidate cached context. Provider-hosted search
integrates lookup and loading, but requires a provider-visible catalog.
Mid-conversation definitions offer another path where supported.

### Server-provided tool search

An MCP server can hide its real catalog behind two generic tools:

```
search_tools({"query":"failed build logs"})
→ get_build_logs(build_id), list_build_steps(build_id)

execute_tool({"name":"get_build_logs","arguments":{"build_id":"build-123"}})
```

`get_build_logs` never becomes a native tool. Its schema is data returned by
`search_tools`, while the actual native call is the weakly typed `execute_tool`.
The model provider can validate only the generic executor's schema, not the
arguments of the discovered tool. 

MCP likewise defines definitions returned by `tools/list` separately from
content returned by `tools/call` ([MCP
tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

The pattern also repeats per server. Separate GitHub, build, and logging servers
produce three search tools and three executors. The model must choose which
catalog to search before it knows where the failure occurred. Semantic overlap
of search tools and execute tools also makes this pattern unlikely to scale well
if implemented per server.

### Proxy-provided tool search

A proxy can collapse those server-local pairs into one global pair:

```
search_tools({"query":"why deployment deploy-42 failed"})
→ build.get_build_logs, logging.list_service_errors

execute_tool({
  "name":"build.get_build_logs",
  "arguments":{"build_id":"build-123"}
})
```

Search can now span servers, but the proxy must own every downstream connection,
credential, and MCP feature. It also becomes a new availability and trust
boundary. As with server-provided search, the discovered functions remain data
behind `execute_tool`; the provider sees only the generic executor rather than
the individual tools and their schemas.

### Client-provided tool search

A client can index every configured server, expose one search tool, and add its
matches to the next model request:

```py
first = model.generate(
    prompt="Why did build build-123 fail?",
    tools=[search_tools],
)

matches = tool_index.search(first.tool_call.arguments["query"])

second = model.generate(
    history=[first, matches],
    tools=[search_tools, *matches],
)
```

This preserves native function calls for the matches, but requires another model
request and can invalidate cached context by changing the top-level tool list.
The client must also manage indexing, provider-specific registration, and
conversation state. Mid-conversation registration, discussed below, can avoid
rewriting that tool prefix.

### Provider-hosted tool search

Provider-hosted search requires the searchable catalog to be available to the
provider before the lookup. Deferral controls which definitions enter model
context; it does not remove that catalog requirement.

A model provider can make deferral part of its tool-calling API. In OpenAI's
Responses API, `defer_loading: true` keeps a function out of the model's initial
context while leaving its namespace visible:

```py
response = client.responses.create(
    model="gpt-5.6",
    input="Why did build build-123 fail?",
    tools=[
        {
            "type": "namespace",
            "name": "cloud_build",
            "description": "Inspect builds, steps, logs, and artifacts.",
            "tools": [{
                "type": "function",
                "name": "get_build_logs",
                "defer_loading": True,
                "parameters": {
                    "type": "object",
                    "properties": {"build_id": {"type": "string"}},
                    "required": ["build_id"],
                },
            }],
        },
        {"type": "tool_search"},
    ],
)
```

If selected, the API inserts `get_build_logs` as a native callable tool. This
preserves per-tool schema enforcement, native selection, typed calls, and
provider cache optimizations. OpenAI supports hosted and client-executed search
on `gpt-5.4` and later; Anthropic uses its own regex or BM25 search tools and
`tool_reference` blocks ([OpenAI tool
search](https://developers.openai.com/api/docs/guides/tools-tool-search),
[Claude tool
search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)).

Loading tools preserves the earlier cached prefix; rewriting earlier tool
definitions may not. For example, editing the loaded tool set in an existing
OpenAI `tool_search_output` breaks caching from that point forward ([OpenAI
tool-search caching](https://developers.openai.com/api/docs/guides/tools-tool-search#understand-what-gets-loaded)).
This is distinct from appending new definitions later in the conversation.

### Native tool search has limited support

Support depends on the model, API, and hosting platform. The table below covers
selected APIs, checked against provider documentation on **September 28, 2026**.
It distinguishes native deferred discovery from gateway-managed search;
“not documented” means no equivalent was found in the reviewed documentation,
not proof that support is impossible.

| API or platform | Deferred tool search | Scope and limitations |
| :---- | :---- | :---- |
| OpenAI Responses API | Native | GPT-5.4 and later; hosted and client-executed search. ([OpenAI](https://developers.openai.com/api/docs/guides/tools-tool-search)) |
| Azure OpenAI Responses API | Native | GPT-5.4 and later on a supported deployment; hosted and client-executed search. ([Microsoft](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/tool-search)) |
| Claude API / Claude Platform on AWS | Native | Regex and BM25 on supported models; Claude Platform on AWS uses the same search API. ([Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)) |
| Claude on Google Cloud / Vertex AI | Native | Available on supported models; client configuration is separate from API availability. ([Anthropic](https://platform.claude.com/docs/en/build-with-claude/overview#tool-infrastructure)) |
| Claude on Amazon Bedrock | Native, API-dependent | Available through `InvokeModel` / `InvokeModelWithResponseStream`, not `Converse`. ([AWS](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-tool-use.html#tool-search-tool)) |
| Claude on Microsoft Foundry | Native | Listed as available; the current hosting restrictions no longer exclude tool search on Azure-hosted deployments. ([Availability](https://platform.claude.com/docs/en/build-with-claude/overview#tool-infrastructure), [hosting restrictions](https://platform.claude.com/docs/en/build-with-claude/claude-in-microsoft-foundry#additional-features-not-supported-when-hosted-on-azure)) |
| OpenRouter | Gateway-managed (beta) | Regex search across models/providers through Responses and Messages APIs; not Chat Completions or BM25. ([OpenRouter](https://openrouter.ai/docs/guides/features/server-tools/tool-search)) |
| Gemini API | Not documented | Function-calling documentation describes supplied tool definitions, without a deferred-search mechanism. ([Google](https://ai.google.dev/gemini-api/docs/function-calling)) |
| Kimi API | Not documented | Tool-calling documentation supplies definitions in `tools`. ([Kimi](https://platform.kimi.ai/docs/guide/use-kimi-api-to-complete-tool-calls)) |
| Z.AI API (GLM) | Not documented | Function-calling documentation describes ordinary tool declarations. ([Z.AI](https://docs.z.ai/guides/capabilities/function-calling)) |
| DeepSeek API | Not documented | Tool-calling and Responses guides do not document deferred search. ([Tool calls](https://api-docs.deepseek.com/guides/tool_calls/), [Responses](https://api-docs.deepseek.com/guides/responses_api/)) |
| Hugging Face Inference Providers | Not documented | The shared function-calling interface does not document deferred discovery. ([Hugging Face](https://huggingface.co/docs/inference-providers/guides/function-calling)) |

API availability does not guarantee reliable discovery or identical caching
behavior. Clients must integrate the mechanisms their chosen platform supports.

### Mid-conversation definitions separate discovery from registration

Instead of rewriting the top-level tool list, a client can append definitions
where they become relevant, registering discovered tools for native calling
while preserving earlier cached context.

OpenAI's Responses API supports this with an
[`additional_tools`](https://developers.openai.com/api/docs/guides/tools-tool-search#add-tools-at-a-specific-point-in-the-input)
input item:

```json
{
  "type": "additional_tools",
  "role": "developer",
  "tools": [
    {
      "type": "function",
      "name": "ledger.create_adjustment",
      "description": "Post a compensating credit for an order.",
      "parameters": {
        "type": "object",
        "properties": {
          "order_id": {"type": "string"}
        },
        "required": ["order_id"],
        "additionalProperties": false
      }
    }
  ]
}
```

The tool becomes callable after this item, without rewriting the earlier prefix:

```
[ stable tools ][ system ][ conversation ] | [ additional_tools ][ continuation ]
<-------- existing cached prefix --------> | ^ append point
```

Claude also supports [inline tool
definitions](https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages#define-tools-in-a-message-beta)
in beta on supported models, including `defer_loading`. Preserving its cached
prefix requires at least one non-deferred tool in the top-level list before the
first inline definition. Registration and search compatibility remain
provider-specific: adding definitions does not by itself establish support for
expanding a hosted search catalog.

The provider handles native registration, while the client can activate tools
through any discovery mechanism it considers appropriate.

## Even well-integrated tool search has limitations

Tool search reduces the cost of loading an eager catalog, but adds discovery
work even when native calling and caching work well. The model must recognize
that it needs another capability, formulate a query, and inspect the results
before using a deferred tool. Incorrect or incomplete results can require
further lookups.

### The model must know when to search

A model must decide to search before it can inspect the deferred tools. Without
some description of the hidden catalog, it may assume the capability is absent,
answer directly, or reach for a familiar fallback such as an API or script.
Microsoft's troubleshooting guide explicitly identifies cases where a model
never calls `tool_search` because it does not know that more tools are available
([Microsoft Foundry Tool
Search](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/tool-search)).

It is like asking the model to solve a puzzle while showing it only some of the
pieces: it must infer which missing pieces to ask for.

Clients compensate by eagerly exposing a smaller catalog. Anthropic recommends
listing tool categories in the system prompt. Claude Code goes further: it
withholds full schemas but lists deferred tool names upfront in system-reminder
messages, giving the model concrete names it can load. Its documentation
describes this as a “summary of available tools” ([Claude Tool
Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool),
[Claude Code Tool
Search](https://code.claude.com/docs/en/agent-sdk/tool-search)). This reduces
tool blindness, but does not eliminate the eager catalog; it replaces full
schemas with a lighter-weight index that still consumes context and must remain
synchronized.

All progressive discovery mechanisms, including Skills and CLI help, must expose
enough information for the agent to know what to explore. Their summaries trade
context cost against the risk of hiding relevant capabilities.

### Finding a workflow may require repeated searches

The first lookup is not guaranteed to find the right tool. Search operates over
tool names, descriptions, and arguments, so results depend on the model using
vocabulary that matches that metadata. The following simplified commerce-agent
trace illustrates a possible failure case, not an inevitable sequence:

```
User: Refund the duplicate charge on order 123 and email the customer.

Assistant -> tool_search
  {"query": "refund duplicate charge order"}
Tool Search -> Assistant
  [orders.cancel_order(...)]                 # Wrong semantic match

Assistant -> tool_search
  {"query": "post compensating ledger credit"}
Tool Search -> Assistant
  [ledger.create_adjustment(...)]

Assistant -> ledger.create_adjustment
  {"order_id": "123", "reason": "duplicate_charge"}

Assistant -> tool_search
  {"query": "email customer about refund"}
Tool Search -> Assistant
  [messaging.send_transactional_email(...)]

Assistant -> messaging.send_transactional_email
  {"order_id": "123", "template": "refund_confirmation"}
```

In this example, two business operations incur three lookups. The first adds an
irrelevant schema; the useful tool appears only after the model infers the
catalog's accounting vocabulary. An empty result would also leave uncertainty
about whether the capability is absent or described differently.

Each lookup adds query generation, retrieval, and result inspection, even if
these happen within one user-visible turn. Search can return several tools at
once, and some implementations already search namespaces or groups; a separate
lookup per tool is not required. The cost depends on what each discovery reveals
and how well it matches the task.

A task-oriented group can expose related tools and guidance together, reducing
the need to infer and search for each capability separately. It still needs to
be discoverable and its tools made callable.

## We can learn a lot from Skills and CLIs

Skills and CLIs organize capabilities into meaningful groups. A Skill can bundle
instructions, reference material, scripts, and related capabilities around a
task. CLIs expose command groups and subcommands: for example, `gh pr --help`
reveals related pull-request operations such as `list`, `view`, and `checks`
([GitHub CLI](https://cli.github.com/manual/gh_pr)).

The useful distinction is the unit of discovery. Provider-authored groups can
supply relationships and guidance that individual tool schemas leave the model
to infer. Clients can search or browse those groups, then expand the relevant
primitives. This structure can complement tool search rather than replace it:

```
Flat Tool Search                    Skill Search

search "refund charge"              search "refund request"
  -> ledger.create_adjustment         -> refund-processing
search "refund policy"                   ├── refund workflow
  -> policy.get_refund_rules              ├── refund policy
search "email customer"                  ├── ledger tools
  -> messaging.send_email                 └── messaging tools
```

### One entry point can disclose a complete workflow

A Skill initially exposes only metadata describing what it does and when to use
it:

```
---
name: refund-processing
description: Resolve duplicate charges and notify customers. Use for refund requests.
---
```

When selected, its `SKILL.md` can explain the workflow, identify the relevant
tools, and point to policy documents or executable scripts. Additional resources
load only if the task needs them. Anthropic describes this as three levels of
progressive disclosure: metadata at startup, instructions when triggered, and
resources or code on demand ([Anthropic Agent
Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)).

The difference matters for retrieval. A user is likely to ask for a “refund,”
which directly matches the `refund-processing` Skill. They are less likely to
ask for a “compensating ledger adjustment,” which is the action exposed by the
underlying tool. The model still has to recognize the Skill from its metadata,
so Skills do not eliminate blindness, but they let discovery operate on the task
the user expressed instead of actions the model has not planned yet.

A Skill can make that plan explicit by listing the exact tool names. However, a
name in `SKILL.md` is not a callable schema. If the client uses Tool Search to
activate deferred tools, loading the Skill alone still leaves another lookup:

```
Assistant -> load Skill "refund-processing"
Skill -> Assistant
  Workflow: adjust the ledger, then notify the customer.
  Tools: ledger.create_adjustment, messaging.send_transactional_email

Assistant -> ToolSearch
  {"query": "select:ledger.create_adjustment,messaging.send_transactional_email"}
ToolSearch -> Assistant
  [two callable schemas]
```

Naming the required tools can make discovery more targeted and allow batching,
but this example still adds a second lookup step. Without a way for Skill
activation to load those schemas directly, structured discovery remains layered
on top of Tool Search rather than replacing it.

### Example: activating tools via Skills-like grouping

A [prototype](https://gist.github.com/sambhav/f6a8b867bd734e10cc4123978efaf65b)
uses Anthropic's `tool_reference` blocks to activate a Skill's deferred tools
together:

```
Assistant -> load_skill
  {"skill": "travel"}

Client -> Assistant
  instructions: "Plan flights, lodging, and weather checks together."
  tool_reference: search_flights
  tool_reference: find_hotels
  tool_reference: get_weather

Provider -> Model
  Expands all three schemas inline at the same point in the conversation.
```

This extends the Skill container from a package of files to a discoverable group
of capabilities. The example activates tools; an MCP equivalent could group
related tools, resources, and prompts with shared metadata and guidance on when
and how to use them.

One grouped activation can replace several searches while preserving the cached
prefix. This prototype still requires upfront tool declarations, a client-owned
Skill-to-tool mapping, and provider-specific references. Grouping improves the
discovery unit; it does not remove the registration requirements.
