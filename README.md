# Primitive Grouping Interest Group

MCP Contributor Discord Channel: [#primitive-grouping-ig](https://discord.com/channels/1358869848138059966/1425903819186770064)
More info on how to join the Discord server [here](https://modelcontextprotocol.io/community/communication#discord)

> ⚠️ **Experimental** — This repository is an incubation space for the Primitive Grouping Interest Group. Contents are exploratory and do not represent official MCP specifications or recommendations.

## Mission

This Interest Group explores how MCP Primitives (Tools, Resources, Prompts, Tasks) might be organized, beyond the flat lists that are maintained by the protocol, and how such organization might benefit both MCP servers and clients.

## Scope

### In Scope

- **Requirements gathering:** Documenting use cases and constraints
- **Pattern exploration:** Testing and evaluating various approaches
- **Proof of concepts:** Maintaining a shared repo of reference implementations and experimental findings

### Out of Scope

- **Approving spec changes:** This IG does not have authority to approve protocol changes; recommendations flow through the SEP process
- **Implementation mandates:** We can document patterns but not require specific client or server behavior

## Problem Statement

Flat lists of MCP primitives can be long and cumbersome to work with for several reasons. Many such problems are within the scope of this group, but some are not.

**Within Scope**

- **Context overload** — When loaded into the context of an LLM, a primitive list can overwhelm the model and lead to confusion and poor selection
- **Inefficient operations** — Long lists in the context consume many tokens which increases processing cost and response latency.
- **Poor developer experience** — Lack of organizational tools for primitives makes them harder to manage and maintain.

**Beyond Scope**

- **Organization for Security** — Organizing and disclosing primitives to clients based on their privilege level is an important problem but beyond this group's mandate.
- **Organizing MCP Servers** — MCP registry and MCP-and-Skills groups are evaluating how different servers should be organized to improve client experience.

See the [Problem Statement](docs/problem-statement.md) for full details.

## Goals

1. **Documenting Requirements and Experiences** — The goal of this group is to document diverse requirements for different clients, servers, and gateways that implement these extensions. We will **not** try to find consensus early on, but aim to document the trade-offs based on feedback from real-world experience.
2. **Reference Extensions** — While many possible organization mechanisms are emerging—and it might be too early to select "one" canonical pattern—different servers are implementing similar features, but the lack of standardization limits clients capability to leverage them effectively. This group will support reference extensions of varied organization strategies e.g., grouping, tool-search, code-mode.
3. **Evangelizing Standards** — The group will invite feedback from developers and maintainers of large MCP servers and clients to migrate away from specific implementations towards standardized extensions.

## Organization Strategies

See [Approaches](docs/approaches.md) for detailed descriptions of each strategy, including prior art, examples, and discussion links.

## IG Principles

1. **Document Discussions**: The IG aims to document the trade-offs and discussions, rather than dictate one specific implementation. Prefer GitHub Discussions on the IG repository rather than prolonged Discord threads. Meeting notes from synchronous IG calls will also be uploaded on the GitHub Discussion for future documentation.
2. **Experimental Extensions**: The repository will be useful to house experimental extensions for different approaches. Extensions SHOULD support at least Python and TypeScript implementations and include (1) end-to-end working demonstrations and (2) detailed instructions for how others can integrate with them.
3. **Feedback From Deployments**: The IG will solicit deployment experiences and feedback from users of extensions to prioritize feature development and changes.

## Repository Contents

| Document | Description |
| :--- | :--- |
| [Problem Statement](docs/problem-statement.md) | Current limitations and gaps |
| [Use Cases](docs/use-cases.md) | Key use cases driving this work |
| [Approaches](docs/approaches.md) | Approaches being explored (not mutually exclusive) |
| [Open Questions](docs/open-questions.md) | Unresolved questions with community input |
| [Experimental Findings](docs/experimental-findings.md) | Results from implementations and testing |
| [Related Work](docs/related-work.md) | SEPs, implementations, and external resources |
| [Contributing](CONTRIBUTING.md) | How to participate |


## Facilitators

| Role | Name        | Organization                                               | GitHub                                         |
| :--- |:------------|:-----------------------------------------------------------|:-----------------------------------------------|
| Facilitator | Tapan Chugh | CS PhD student at University of Washington                 | [@chughtapan](https://github.com/chughtapan) |
| Facilitator | Sam Morrow  | Senior Software Engineer at GitHub                         | [@SamMorrowDrums](https://github.com/SamMorrowDrums)     |
| Maintainer | Cliff Hall  | Futurescale / MCP Maintainer                               | [@cliffhall](https://github.com/cliffhall)     |

## Lifecycle

**Current Status: Active Exploration**

### Graduation Criteria (IG → WG)

This IG may propose becoming a Working Group if:

- Clear consensus emerges on an approach requiring sustained spec work
- Cross-cutting coordination requires formal authority delegation
- At least two Core Maintainers sponsor WG formation

### Retirement Criteria

- Problem space resolved (conventions established, absorbed into other WGs)
- Insufficient participation to maintain momentum
- Community consensus that grouping doesn't belong in MCP protocol scope

## Work Tracking

| Item                               | Status | Champion         | Notes                                                             |
|:-----------------------------------| :--- |:-----------------|:------------------------------------------------------------------|
| Requirements alignment             | In Progress | All facilitators | Review approaches, identify common requirements and gaps          |
| Experimental findings repo section | Proposed | TBD              | Dedicated repo section for implementations and evaluation results |
| MCP Grouping Convention v0.1       | Proposed | TBD              | Documented pattern (not spec) for grouping of primitives          |

## Success Criteria

- **Short-term:** Documented consensus on requirements and evaluation of existing approaches
- **Medium-term:** Clear recommendation (convention vs. protocol extension vs. both)
- **Long-term:** Interoperable grouping convention across MCP servers and clients

