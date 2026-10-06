# Use Cases
[Problem Statement](problem-statement.md) |
Use Cases |
[Approaches](approaches.md) |
[Open Questions](open-questions.md) |
[Experimental Findings](experimental-findings.md) |
[Related Work](related-work.md) |
[Contributing](../CONTRIBUTING.md) 



## Use-Cases from Previous Discussions

[Use Cases for Primitive Grouping Public Discussion #1772](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1772)

Use-Cases Curated from Discussion #1567 (Each coninued link below refers to a specific comment within #1567)

### Server Governance 

A use case of grouping we're strugling with is governance. Agent toolkits and frameworks are starting to add governance layers over MCP such as "this agent should not perform DDL but can do DML". Since the only primitive the MCP spec provides today is the individual tools, this causes the frameworks to take hard dependencies upon individual tools. That hard dependency breaks the ability for MCP server owners to evolve tool shapes over time. Since MCP is fundamentally a dynamic protocol, we are seeing this as a significant anti-pattern...[continued](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1567#discussioncomment-14895158)

### Agent<->Server Interaction

Building a prompt and resource library service for a large organization governed by groups. While this is currently possible, it's unwieldy to manage. You want humans to only see prompts relevant to them. You want a concept of global prompts and role / team specific prompts. With group hierarchy, you can also do this to a broader level for levels of an organization...[continued](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1567#discussioncomment-14929142)

### Context Overflow and User-Context Filtering
First, I want to emphasize that we share the same fundamental goal: solving the Context Overflow Problem. Where we may differ is in the approach and scope of the solution.

Regarding your question about "user-centric filtering" and which users I'm referring to: In the MCP context, the primary "user" making actual requests to MCP servers is the LLM (the MCP client). When I say "user-centric filtering," I'm referring to filtering mechanisms that align with the LLM's needs and constraints—such as security requirements, cost considerations, performance characteristics, and other domain-oriented concerns. This is distinct from developer-centric organization (like grouping primitives by technical categories), which serves different purposes...[continued](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1567#discussioncomment-15184260)

### Groups for Composition and Abstraction
I've been exploring a different angle: composition. What if higher-level skills compose lower-level ones?...[continued](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1567#discussioncomment-15294141)

### Groups for Tool Aggregation/Namespace Definition for Enterprise Gateways

This approach effectively creates a manual 'namespace' that keeps the system prompt lean and significantly improves the model's reasoning reliability. It’s a practical validation of why the 'Grouping' logic discussed here is essential for enterprise-scale MCP implementations...[continued](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1567#discussioncomment-15764478)
