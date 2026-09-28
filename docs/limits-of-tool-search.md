# The Limits of Tool Search

Flat tool search is a useful baseline for progressive discovery. Provider-authored
groups can offer better starting points: Skills bundle instructions and resources
around tasks, while CLIs organize commands into groups and subcommands. Clients
can discover or search these groups before expanding individual primitives.

This document examines where flat tool search falls short and how that structure
can improve discovery, while retaining tradeoffs in tool activation and caching.

# How native tool calling works

In the early days of LLM applications, tools were a very manual process built on
text. An application described functions in the prompt, asked the model to emit
a particular string or JSON shape, parsed that text, executed the requested
operation, and pasted the result into another prompt. Native tool calling moves
that convention into the model API. Tools are supplied through a dedicated
request field, and tool calls and results are represented as typed items rather
than ordinary assistant text.

## Before native function calling

A common pattern was to describe the available functions and invent an output
format in the prompt:

```
You can call get_weather(location: string).

When current weather is required, respond with only this JSON:
{"tool":"get_weather","arguments":{"location":"city name"}}
Otherwise, answer the user normally.
```

The application then had to distinguish a call from ordinary text, extract the
payload, validate it, dispatch it, and describe the result to the model using
another application-specific convention:

```py
response = model.generate(system_prompt, user_prompt)

try:
    request = json.loads(response.text)
    result = tools[request["tool"]](**request["arguments"])
except (json.JSONDecodeError, KeyError, TypeError):
    # Decide whether this was ordinary text or a malformed tool call,
    # then implement an application-specific repair or retry policy.
    raise ValueError("Malformed tool call")

final = model.generate(
    system_prompt,
    user_prompt,
    response.text,
    f"Tool result: {result}",
)
```

This worked, but the prompt syntax, parser, validation behavior, error recovery,
and result format belonged to the application. Models could wrap the JSON in
Markdown, mix it with prose, omit required fields, or produce a shape the parser
did not recognize. Every framework solved the same orchestration problem
differently.

## Provider-native function calling

Modern model APIs make tools part of the request contract. For example, the
current [OpenAI Responses API function-calling
guide](https://developers.openai.com/api/docs/guides/function-calling#function-tool-example)
shows an application declaring functions through the `tools` field, receiving
typed calls, and returning results using their `call_id`:

```py
import json
from openai import OpenAI

client = OpenAI()

tools = [{
    "type": "function",
    "name": "get_weather",
    "description": "Get the current weather for a location.",
    "parameters": {
        "type": "object",
        "properties": {
            "location": {"type": "string"},
        },
        "required": ["location"],
        "additionalProperties": False,
    },
    "strict": True,
}]

conversation = [{
    "role": "user",
    "content": "What is the weather in Paris?",
}]

response = client.responses.create(
    model="gpt-5.6",
    input=conversation,
    tools=tools,
)
conversation += response.output

for item in response.output:
    if item.type == "function_call" and item.name == "get_weather":
        arguments = json.loads(item.arguments)
        result = get_weather(arguments["location"])
        conversation.append({
            "type": "function_call_output",
            "call_id": item.call_id,
            "output": json.dumps(result),
        })

response = client.responses.create(
    model="gpt-5.6",
    input=conversation,
    tools=tools,
)
print(response.output_text)
```

The application still executes `get_weather`; the API standardizes how the model
sees its schema, requests the call, and receives the result. This example uses
the current OpenAI Python SDK and Responses API rather than an illustrative wire
format.  
Providers use different field names and response envelopes, but OpenAI,
Anthropic, and Gemini expose the same basic model/application boundary.

The basic loop is consistent across major model providers:

1. The application sends the user request together with tool definitions. A
   definition normally contains a name, a description, and a JSON Schema for its
   arguments.  
2. The model either responds normally or emits a structured tool call containing
   the selected tool and its arguments.  
3. The application authorizes the operation, validates any application-level
   constraints, and executes it. The model does not execute client-defined tools
   itself.  
4. The application returns the result, correlated with the original call, to the
   model.  
5. The model uses that result to answer the user or request additional tools.  
   

OpenAI documents this as a five-step application/model conversation, including
returning outputs against a `call_id`; Google's Gemini documentation describes
the same declaration, model call, application execution, and result loop
([OpenAI function
calling](https://developers.openai.com/api/docs/guides/function-calling#the-tool-calling-flow),
[Gemini function
calling](https://ai.google.dev/gemini-api/docs/function-calling)).  
Native tool calling provides several advantages over an application-specific
text convention:

- **A provider-defined representation:** Tool definitions, calls, and results
  have dedicated API fields and item types. The provider can construct the
  model's tool-use prompt and optimize models around a stable interface instead
  of every application inventing its own syntax. Anthropic, for example,
  documents that its API constructs a tool-use system prompt from the supplied
  definitions and configuration ([Claude tool
  definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)).  
- **Schema-constrained arguments:** Providers can constrain generated arguments
  against the declared schema. OpenAI's strict mode guarantees schema adherence
  for supported schemas rather than treating the schema as best-effort guidance
  ([OpenAI strict
  mode](https://developers.openai.com/api/docs/guides/function-calling#strict-mode)).
  This can avoid a correction loop for malformed calls, although applications
  must still enforce authorization, business rules, and other semantic
  constraints.  
- **Explicit selection controls:** APIs can let the model choose automatically,
  require a tool call, force a particular tool, or restrict selection to an
  allowed subset. These controls are easier to enforce and observe than prompt
  instructions embedded in ordinary text.  
- **Call/result correlation:** Typed call identifiers let an application attach
  each result to the request that produced it. This is especially important when
  several tools are invoked together or when an agent loop spans multiple model
  requests.  
- **Parallel calls:** On supported models, the model can request multiple
  independent functions in one turn. The application can execute them
  concurrently and return their results together, avoiding a separate model turn
  for each independent operation ([OpenAI parallel
  calls](https://developers.openai.com/api/docs/guides/function-calling#parallel-function-calling),
  [Gemini parallel
  calls](https://ai.google.dev/gemini-api/docs/function-calling)).  
- **A clear execution boundary:** The model proposes an operation; the
  application remains responsible for credentials, policy, side effects, error
  handling, and the actual execution. Tool calling adds structure without
  transferring control of the underlying system to the model provider.

This distinction matters for tool search. Search is responsible for finding a
capability, but the discovered definition must eventually enter this native
tool-calling interface if the application wants to preserve schema constraints,
selection controls, correlation, and parallel execution.

# Tool search is hard for clients to implement

MCP gives clients `tools/list` and `tools/call`, but it does not give them a
standard way to search across tool catalogs or introduce a search result into a
model's native tool interface. A client that wants progressive discovery must
therefore decide where tool search will run.

Tool search can be implemented at several layers, working from each MCP server
back toward the model API. Each placement can reduce the eager catalog, but most
move the cost or complexity somewhere else. The first three approaches also step
outside at least part of the model's native tool interface, giving up some
combination of per-tool schema enforcement, direct tool selection,
provider-managed discovery, and cache behavior.

## Server-provided tool search

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

## Proxy-provided tool search

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

## Client-provided tool search

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

Unlike the server and proxy workarounds, this can restore native function calls
for the matches. However, it costs another model turn, cannot use
provider-managed search within the same response, and can disrupt caching when
it changes the request's tool list. Every client must also implement indexing,
provider-specific registration, and conversation state.

## Model-provided tool search

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

That cache benefit applies while loading definitions that were already deferred;
**it does not make the catalog free to change**. Adding, removing, or updating
tools changes the model input, and changing OpenAI's loaded tool set explicitly
breaks the cache from that point forward ([OpenAI tool-search
caching](https://developers.openai.com/api/docs/guides/tools-tool-search#understand-what-gets-loaded)).
A server update, newly enabled MCP server, or configuration change can therefore
invalidate the cached prefix.

### Even Models that support Tool Search don’t do it everywhere

As of August 2026, OpenAI and Anthropic are the only model providers in this
review that document native deferred tool discovery. Here, “native” means that
the API can add a discovered definition to the model's callable tools; ordinary
function calling and application-defined `search_tools` wrappers do not qualify.

Support is not solely a property of the model. The same model can expose tool
search through one API surface and omit it from another:

| Model family | Common API or platform | Native deferred tool search | Current limitation |
| :---- | :---- | :---- | :---- |
| OpenAI GPT-5.4 and later, including GPT-5.6 | OpenAI Responses API | Yes | Hosted and client-executed search are supported. ([OpenAI](https://developers.openai.com/api/docs/guides/tools-tool-search)) |
| OpenAI GPT-5.4 and later | Azure OpenAI Responses API | Yes | Requires a supported Azure model deployment. ([Azure OpenAI](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/tool-search)) |
| Supported Claude models, including Fable 5, Opus 5, and Sonnet 5 | Claude API and Claude Platform on AWS | Yes | Claude provides regex and BM25 search; the AWS-hosted Claude Platform uses the same API behavior. ([Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool), [Sonnet 5 compatibility](https://platform.claude.com/docs/en/docs/about-claude/models/whats-new-sonnet-5)) |
| Supported Claude models | Google Cloud / Vertex AI | Yes, but client-dependent | Anthropic lists Tool Search as generally available on Vertex AI. However, Claude Code disables MCP Tool Search there by default; users must set `ENABLE_TOOL_SEARCH=true` on supported models. ([Anthropic platform matrix](https://platform.claude.com/docs/en/build-with-claude/overview), [Claude Code on Vertex AI](https://code.claude.com/docs/en/google-vertex-ai)) |
| Supported Claude models | Amazon Bedrock | Partial | Available through `InvokeModel`, but not Bedrock's `Converse` API. ([Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-tool-use.html)) |
| Supported Claude models | Microsoft Foundry | Partial | Available for deployments Hosted on Anthropic, but not those Hosted on Azure. ([Anthropic Foundry guide](https://platform.claude.com/docs/en/build-with-claude/claude-in-microsoft-foundry)) |
| Gemini 3.x | Gemini API and Vertex AI | Not documented | The documented interface accepts eager function declarations, without a deferred discovery primitive. ([Gemini](https://ai.google.dev/gemini-api/docs/function-calling)) |
| Kimi K3 | Kimi API | Not documented | The documented interface passes function definitions in `tools`. ([Kimi](https://platform.kimi.ai/docs/guide/use-kimi-api-to-complete-tool-calls)) |
| GLM-5.2 | Z.AI API | Not documented | The documented interface provides standard function calling. ([Z.AI](https://docs.bigmodel.cn/cn/guide/capabilities/function-calling)) |
| DeepSeek V4 Pro / V4 Flash | DeepSeek API | Not documented | The documented APIs provide standard tool calls; the Responses API does not list a deferred tool-search item. ([DeepSeek tool calls](https://api-docs.deepseek.com/guides/tool_calls/), [Responses API](https://api-docs.deepseek.com/api/create-response/)) |
| Models routed through OpenRouter or Hugging Face Inference Providers | OpenRouter and Hugging Face APIs | No portable mechanism documented | Both document normalized function calling, but not a provider-neutral equivalent to `defer_loading`. ([OpenRouter](https://openrouter.ai/docs/guides/features/tool-calling), [Hugging Face](https://huggingface.co/docs/inference-providers/guides/function-calling)) |

This table tracks API availability, not invocation reliability. Even on a
supported surface, the model can fail to call Tool Search; that bootstrap
problem is addressed in the next section.  
This is a point-in-time documentation review, not proof that an undocumented
feature cannot exist. It does show the portability problem facing clients:
request fields, supported models, cloud surfaces, search semantics, and caching
behavior all vary. A client must implement each provider-specific mechanism or
fall back to one of the less capable approaches above.

# Tool Search adds lookup latency

Eager tool calling pays the catalog cost before inference, while amortizing the
cost via prompt cache for subsequent calls. Tool Search avoids most of that
upfront schema cost, but inserts a lookup between recognizing an intent and
calling a tool. Before it can call a deferred tool, the model must:

1. Recognize that the visible tools are insufficient.  
2. Decide to search instead of answering directly or using a familiar fallback.  
3. Describe the missing capability in terms the search index can match.  
4. Inspect the returned definitions and search again if the results are wrong or
   incomplete.

This discovery loop has two compounding failure modes.

## Tool blindness creates a bootstrap problem

A model must decide to search before it can inspect the deferred tools. Without
some description of the hidden catalog, it may assume the capability is absent,
answer directly, or reach for a familiar fallback such as an API or script.
Microsoft's troubleshooting guide explicitly identifies cases where a model
never calls `tool_search` because it does not know that more tools are available
([Microsoft Foundry Tool
Search](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/tool-search)).  
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

*Note: the cost/benefit trade-off of full context versus partial context is not
limited to MCP, nor indeed even models, skills, cli help invocations or
compaction (which are all attempts to solve this for AI) \- encyclopedia
indexes, executive summaries etc. are also conceptually similar, and this
matters explicitly because **all these mechanisms are lossy** and frequently
lead to either information overload, failure to locate the available information
or incorrect conclusions. The primary argument here is not that this is a battle
that can be won with a singular solution but that for MCPs part in this, MCPs
servers, clients and models need the ability to make nuanced decisions balancing
selective withholding of information with the ability to make it available when
needed, considering cache, input and output token costs and other factors. This
likely means each party solving for their own domains, and accounting for their
known blind spots \- i.e. solving this effectively is an information asymmetry
problem at its core. For example, an MCP server may know the likely next tools,
while only the client knows the prompt.*

## Discovery may require multiple lookups

The first lookup is not guaranteed to find the right tool. Search operates over
tool names, descriptions, and arguments, so results depend on the model using
vocabulary that matches that metadata. Consider this simplified trace for a
commerce agent:

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

The task requires two business operations but incurs three lookups. The first
lookup adds an irrelevant schema to context, and the useful ledger tool appears
only after the model infers the catalog's accounting vocabulary. An empty result
would be equally ambiguous: it does not reveal whether the capability is absent
or merely described differently.  
Each lookup requires the model to generate a query, wait for retrieval, inspect
the returned schemas, and resume generation. Anthropic documents one additional
round trip for the first discovery and returns only 3–5 definitions by default.
Incorrect results require another lookup, as do multi-tool workflows when one
query does not surface every capability. These iterations may occur within one
user-visible turn, but their latency remains ([Claude Code Tool
Search](https://code.claude.com/docs/en/agent-sdk/tool-search)).  
Tool Search therefore replaces the fixed cost of an eager catalog with a
variable discovery cost. That cost depends on whether the model searches, how
well its vocabulary matches the index, and how many distinct capabilities the
task requires.

# Deferred Tool Search encourages stable tool lists

Prompt caching relies on an identical prefix across requests. Tool definitions
normally appear before the system prompt and conversation, so a change near the
front invalidates everything after it:

```
Turn N:   [ tools: A B C ] [ system ] [ conversation ........ ]
          <--------------- cached prefix -------------------->

Turn N+1: [ tools: A B C D ] [ system ] [ conversation ........ ]
                         ^ prefix diverges; downstream cache misses
```

This includes more than adding a server. Renaming a tool, improving a
description, changing a parameter schema, reordering definitions, or changing
which tools are enabled can all alter the prefix. Anthropic documents that
modifying tool definitions invalidates the tools, system, and message caches.
OpenAI similarly warns that changing an already-loaded tool set breaks the cache
from that point forward ([Claude tool
caching](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching),
[OpenAI tool-search
caching](https://developers.openai.com/api/docs/guides/tools-tool-search#understand-what-gets-loaded)).  
Deferred loading reduces the blast radius by appending a discovered definition
at the point where it is needed instead of rewriting the initial prefix. It does
not make the discovery catalog immutable. Claude Code withholds full schemas,
for example, but still sends the set of deferred tool names upfront. A
simplified representation looks like this:

```
<system-reminder>
Deferred tools available through ToolSearch:
  mcp__github__list_pull_requests
  mcp__github__get_pull_request
  mcp__github__merge_pull_request
  mcp__slack__search_messages
  mcp__slack__post_message
  ...
</system-reminder>

# Names are visible; descriptions and parameter schemas load on demand.
```

Claude Code's caching documentation says that this name set must remain stable
for the cache to remain valid. A server connecting, disconnecting, or changing
its advertised tools can therefore cause a cache miss even when none of those
tools are used. Claude Code also applies edits to its MCP configuration only
after restart ([Claude Code prompt
caching](https://code.claude.com/docs/en/prompt-caching)).

The latest MCP specification makes catalog stability an explicit server-client
contract. Every `tools/list` result includes a `ttlMs` freshness hint and a
`cacheScope` that controls whether the response may be shared across
authorization contexts.

A client may reuse that list for the TTL and re-fetch it when the result becomes
stale. The specification also recommends deterministic tool ordering explicitly
to improve model prompt-cache hit rates. A short TTL surfaces new tools quickly,
but creates more opportunities for the discovery index—and therefore the model's
cached prefix—to change. A long TTL favors cache stability, but a newly added or
updated tool may remain invisible until the client refreshes ([MCP
caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching),
[MCP
tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

This tension is particularly problematic for MCP because dynamic capabilities
are one of its strengths. A server owns its tool definitions and may add,
remove, or update them as its APIs, configuration, authorization, or external
state changes. If the client does not refresh and propagate that catalog into
the model-facing search index, the two views diverge:

```
MCP server:          [ tools: A B D ]
Client search index: [ tools: A B C ]

D is available but undiscoverable.
C is discoverable but no longer callable.
Changes to A or B may leave the model using a stale schema.
```

The protocol can communicate fresh capabilities, yet the agent still cannot use
them correctly. New tools remain invisible, removed tools produce failed calls,
and schema changes produce invalid arguments. Clients are therefore forced to
choose between freshness and cache stability: snapshot tools for the session,
honor a longer TTL, delay configuration changes until restart, or refresh
immediately and accept a cache miss. Provider-specific append-only mechanisms
reduce this tradeoff, but they are not a portable capability that an MCP server
can rely on.

# We can learn a lot from Skills

Tool Search retrieves individual definitions from a flat catalog. A Skill is a
task-shaped bundle: one discoverable entry point can expand into instructions,
reference material, scripts, and a related set of capabilities. This also makes
Skills better search targets. Skill metadata describes the user's task and when
the Skill applies; tool metadata usually describes one action the agent must
first infer is necessary to complete that task.

```
Flat Tool Search                    Skill Search

search "refund charge"              search "refund request"
  -> ledger.create_adjustment         -> refund-processing
search "refund policy"                   ├── refund workflow
  -> policy.get_refund_rules              ├── refund policy
search "email customer"                  ├── ledger tools
  -> messaging.send_email                 └── messaging tools
```

## One entry point can disclose a complete workflow

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
name in `SKILL.md` is not a callable schema. If those tools are deferred, the
agent must still load them through Tool Search before use:

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

The Skill improves recall and can batch discovery by naming every required tool,
but it still adds a second lookup step. Without a way for the Skill activation
to load those schemas directly, structured discovery remains layered on top of
Tool Search rather than replacing it.

## Clients already use Skills to load deferred tool groups

A prototype shared by Bloomberg demonstrates this pattern on Anthropic's API.
The client registers tools with `defer_loading: true` and exposes a non-deferred
`load_skill` tool. Loading a Skill returns its related tools as `tool_reference`
blocks:

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

This replaces several speculative searches with one grouped activation and
preserves the cached prefix. It is also clearly a workaround: every referenced
tool must still be declared in the provider request, the client must maintain
the Skill-to-tool mapping, and `tool_reference` is provider-specific ([deferred
tools via
Skills](https://gist.github.com/sambhav/f6a8b867bd734e10cc4123978efaf65b)).

The grouping also provides a lifecycle boundary. After the workflow is complete
or the conversation is compacted, expanded instructions and tools can be
discarded while the lightweight Skill metadata remains available for discovery.
MCP currently has no equivalent server-defined unit for activating and later
retiring a related group of tools and guidance.

# Tool definitions need the equivalent of a user message

Conversations already have an append-only mechanism for introducing new
information: add a user or developer message at the point where that information
becomes relevant. The earlier history stays unchanged and remains cacheable.
Tool definitions usually do not work this way. They are top-level request
configuration, so changing them rewrites the tool prefix for every later turn.

Tools need an equivalent conversation item: “make these schemas callable from
this point forward.” The client could discover those schemas however it chooses,
append them where they become relevant, and preserve native tool calling without
rewriting the prior context.

OpenAI's Responses API supports this with an `additional_tools` input item:

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

The tool is unavailable before this item and becomes a native callable function
after it. Because the item is appended where activation occurs, the client does
not need to rewrite the earlier tool prefix:

```
[ stable tools ][ system ][ conversation ] | [ additional_tools ][ continuation ]
<-------- existing cached prefix --------> | ^ append point
```

This preserves native schema registration **without requiring the provider to
own discovery**. The client could activate the same tool through flat search, a
Skill, a server-defined tool group, a permission change, or application-specific
logic. It can also introduce several related tools together, avoiding a separate
lookup for each schema ([OpenAI
`additional_tools`](https://developers.openai.com/api/docs/guides/tools-tool-search#add-tools-at-a-specific-point-in-the-input)).

This mechanism is currently provider-specific, but treating tool definitions as
append-only conversation state is the useful pattern. The model provider owns
typed tool registration. The client decides when to expand capabilities. An MCP
server can supply the relationships and guidance needed to expand them
coherently. Tool Search then becomes one possible discovery strategy instead of
the only path to deferred tools. For extremely large tool catalogues it seems
highly likely that agent harnesses will need to employ a range of strategies,
and MCP can/should help with this.

.MCP Server Instructions were (in hindsight) a mistake  
Another aspect to this is that MCP servers were already able to send
instructions about when and how to use their primitives, designed in the period
prior to the advent of skills and tool search. This monolithic block of per
server advice is now officially optional with server/discover (and client
implementations always had patchy support anyway). 

There are two interesting future options here:

- Encourage server authors to remove instructions and split them into more
  specific skills, that can be self-hosted via the proposed skills over MCP
  mechanism.  
- Provide an MCP native equivalent of skill metadata, that may not be directly
  attached to single primitives, and could in fact offer the same three layer
  discovery that skills are offering today, making it clear to harness
  developers when they could/should utilise tool defer loading paradigms and
  other techniques like providing indirect access to the model for large
  responses.

Allowing the MCP server/client contract to facilitate smart management of
metadata, instructions, tools, resources, etc. in a way that is easy to do
correctly, with guidance about how these can interact with current model
providers is necessary to ensure harness developers get the best out of MCP, and
do not misattribute context management problems to it, and for that to occur,
harness developers need to be given the right contract for context management.
