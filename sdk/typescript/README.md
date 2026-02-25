# MCP Grouping Extension — TypeScript SDK

Organize MCP tools, resources, and other primitives into named groups. This package implements the [Grouping Extension specification](../../specification/draft/grouping.mdx) as an add-on for the
[`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).

> **Status:** Experimental. The capability is registered under `experimental["io.modelcontextprotocol/grouping"]` until the SDK ships the `extensions` field on `ServerCapabilities`.

## Install

```bash
npm install @anthropic/ext-grouping
```

Peer dependency: `@modelcontextprotocol/sdk` >= 1.27.

## Quick start — Server

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GroupingExtension, GROUPS_META_KEY } from '@anthropic/ext-grouping';
import { z } from 'zod/v4';

const mcpServer = new McpServer({ name: 'my-server', version: '1.0.0' });
const grouping = new GroupingExtension(mcpServer);

// Register groups
grouping.registerGroup('email', {
    title: 'Email Tools',
    description: 'Tools for email workflows.'
});

// Assign tools to groups via _meta
mcpServer.registerTool(
    'send_email',
    {
        description: 'Send an email',
        inputSchema: { to: z.string(), body: z.string() },
        _meta: { [GROUPS_META_KEY]: ['email'] }
    },
    async ({ to, body }) => ({
        content: [{ type: 'text', text: `Sent to ${to}` }]
    })
);

// Assign resources to groups via _meta
mcpServer.registerResource(
    'inbox',
    'email://inbox',
    {
        description: 'Current inbox',
        _meta: { [GROUPS_META_KEY]: ['email'] }
    },
    async () => ({
        contents: [{ uri: 'email://inbox', text: 'No messages.', mimeType: 'text/plain' }]
    })
);

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
```

## Quick start — Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { GroupingClient, GROUPS_META_KEY } from '@anthropic/ext-grouping';

const client = new Client({ name: 'my-client', version: '1.0.0' });
await client.connect(transport);

const groupingClient = new GroupingClient(client);

// List groups
const { groups } = await groupingClient.listGroups();

// Filter tools by group
const { tools } = await client.listTools();
const emailTools = tools.filter(t => {
    const membership = GroupingClient.getGroupMembership(t._meta);
    return membership.includes('email');
});

// Listen for group changes
groupingClient.onGroupsChanged(async () => {
    const updated = await groupingClient.listGroups();
    console.log('Groups updated:', updated.groups);
});
```

## Nested groups

Groups can belong to other groups via the same `_meta` key:

```typescript
grouping.registerGroup('productivity', {
    title: 'Productivity Suite'
});

grouping.registerGroup('email', {
    title: 'Email Tools',
    _meta: { [GROUPS_META_KEY]: ['productivity'] }
});

grouping.registerGroup('calendar', {
    title: 'Calendar Tools',
    _meta: { [GROUPS_META_KEY]: ['productivity'] }
});
```

A client can then expand a parent group into all its descendants:

```typescript
const { groups } = await groupingClient.listGroups();

// Build parent → children map
const children = new Map<string, string[]>();
for (const g of groups) {
    for (const parent of GroupingClient.getGroupMembership(g._meta)) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent)!.push(g.name);
    }
}

// BFS to collect all descendant group names
function expand(name: string): Set<string> {
    const visited = new Set<string>();
    const queue = [name];
    while (queue.length) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const child of children.get(cur) ?? []) queue.push(child);
    }
    return visited;
}

const allProductivity = expand('productivity');
// Set { "productivity", "email", "calendar" }
```

## API reference

### `GroupingExtension` (server)

```typescript
import { GroupingExtension } from '@anthropic/ext-grouping';

const grouping = new GroupingExtension(mcpServer);
```

| Method                         | Description                                                       |
| ------------------------------ | ----------------------------------------------------------------- |
| `registerGroup(name, config?)` | Register a group. Returns a `RegisteredGroup` handle.             |
| `removeGroup(name)`            | Remove a group by name.                                           |
| `sendGroupListChanged()`       | Manually send a `notifications/groups/list_changed` notification. |

**`RegisteredGroup`** handle returned by `registerGroup`:

| Property / Method                                       | Description                                         |
| ------------------------------------------------------- | --------------------------------------------------- |
| `title`, `description`, `icons`, `annotations`, `_meta` | Group metadata (read/write).                        |
| `enabled`                                               | Whether the group appears in `groups/list` results. |
| `enable()` / `disable()`                                | Toggle visibility.                                  |
| `update(updates)`                                       | Batch-update fields (including rename via `name`).  |
| `remove()`                                              | Remove the group.                                   |

### `GroupingClient` (client)

```typescript
import { GroupingClient } from '@anthropic/ext-grouping';

const groupingClient = new GroupingClient(client);
```

| Method                                    | Description                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `listGroups(params?)`                     | Send `groups/list` request. Accepts `{ cursor?: string }` for pagination.                                   |
| `onGroupsChanged(handler)`                | Register a callback for `notifications/groups/list_changed`.                                                |
| `GroupingClient.getGroupMembership(meta)` | Static utility — extracts the `string[]` of group names from a primitive's `_meta`. Returns `[]` if absent. |

### Constants and types

| Export                               | Description                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `GROUPS_META_KEY`                    | `"io.modelcontextprotocol/groups"` — the reserved `_meta` key for group membership. |
| `GROUPING_EXTENSION_ID`              | `"io.modelcontextprotocol/grouping"` — the canonical extension identifier.          |
| `GroupSchema`                        | Zod schema for a `Group` object.                                                    |
| `ListGroupsRequestSchema`            | Zod schema for the `groups/list` request.                                           |
| `ListGroupsResultSchema`             | Zod schema for the `groups/list` response.                                          |
| `GroupListChangedNotificationSchema` | Zod schema for `notifications/groups/list_changed`.                                 |
| `Group`, `ListGroupsResult`, …       | TypeScript type aliases inferred from the above schemas.                            |

## Capability registration

The extension registers its capability at:

```json
{
    "experimental": {
        "io.modelcontextprotocol/grouping": {
            "listChanged": true
        }
    }
}
```

When the MCP SDK adds the `extensions` field to `ServerCapabilities`, this will move to `capabilities.extensions["io.modelcontextprotocol/grouping"]`.

## Running the examples

```bash
cd sdk/typescript
npm install

# Run the example server (stdio)
npx tsx examples/server.ts

# Run the interactive example client (spawns the server automatically)
npx tsx examples/client.ts
```

## Development

```bash
npm install
npm run build       # Compile TypeScript
npm test            # Run tests (vitest)
npm run test:watch  # Watch mode
```
