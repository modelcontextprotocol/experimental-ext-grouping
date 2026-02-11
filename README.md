# Primitive Grouping Interest Group

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

Flat lists of MCP primitives can be long and cumbersome to work with.  

- **Context overload** — When loaded into the context of an LLM, a primitive list can overwhelm the model and lead to confusion and poor selection
- **Costly operation** - Long lists can consume many tokens, leading to higher costs for users.
- **Poor developer experience** — Lack of organizational tools for primitives makes them harder to manage and maintain

See [problem-statement.md](docs/problem-statement.md) for full details.

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
| Maintainer | Cliff Hall  | Futurescale / MCP Maintainer                               | [@cliffhall](https://github.com/cliffhall)     |
| Facilitator | Sam Morrow  | Senior Software Engineer at GitHub                         | [@SamMorrowDrums](https://github.com/SamMorrowDrums)     |

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

