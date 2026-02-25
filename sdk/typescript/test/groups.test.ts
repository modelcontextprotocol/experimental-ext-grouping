import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod/v4';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { GroupingExtension } from '../src/server.js';
import { GroupingClient } from '../src/client.js';
import { GROUPS_META_KEY, GROUPING_EXTENSION_ID } from '../src/types.js';

/**
 * Connect a server and client over InMemoryTransport,
 * returning the transports so tests can spy on them.
 */
async function connectPair(mcpServer: McpServer, client: Client) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), mcpServer.connect(serverTransport)]);
    return { clientTransport, serverTransport };
}

/**
 * Collect notification methods sent from server→client by spying on the
 * client-side transport's onmessage callback.
 */
function spyOnNotifications(clientTransport: InMemoryTransport): string[] {
    const methods: string[] = [];
    const originalOnMessage = clientTransport.onmessage;
    clientTransport.onmessage = (message: JSONRPCMessage, extra) => {
        if ('method' in message && !('id' in message)) {
            methods.push(message.method as string);
        }
        originalOnMessage?.call(clientTransport, message, extra);
    };
    return methods;
}

describe('Grouping Extension — e2e integration', () => {
    let mcpServer: McpServer;
    let client: Client;
    let grouping: GroupingExtension;
    let groupingClient: GroupingClient;

    beforeEach(() => {
        mcpServer = new McpServer({ name: 'test-server', version: '1.0.0' });
        grouping = new GroupingExtension(mcpServer);
        client = new Client({ name: 'test-client', version: '1.0.0' });
        groupingClient = new GroupingClient(client);
    });

    afterEach(async () => {
        await Promise.all([client.close(), mcpServer.close()]);
    });

    test('capability is advertised in experimental field after handshake', async () => {
        grouping.registerGroup('g', { title: 'G' });

        await connectPair(mcpServer, client);

        const caps = client.getServerCapabilities();
        expect(caps?.experimental).toBeDefined();
        const ext = (caps!.experimental as Record<string, unknown>)[GROUPING_EXTENSION_ID] as Record<string, unknown>;
        expect(ext).toEqual({ listChanged: true });
    });

    test('full productivity hierarchy: groups, tools, and resources round-trip', async () => {
        // Build a realistic hierarchy: work > {spreadsheets, docs}, comms > {email, calendar}
        grouping.registerGroup('work', {
            title: 'Work',
            description: 'Work tools'
        });
        grouping.registerGroup('comms', {
            title: 'Communications',
            description: 'Communication tools'
        });
        grouping.registerGroup('spreadsheets', {
            title: 'Spreadsheets',
            _meta: { [GROUPS_META_KEY]: ['work'] }
        });
        grouping.registerGroup('docs', {
            title: 'Documents',
            _meta: { [GROUPS_META_KEY]: ['work'] }
        });
        grouping.registerGroup('email', {
            title: 'Email',
            _meta: { [GROUPS_META_KEY]: ['comms'] }
        });
        grouping.registerGroup('calendar', {
            title: 'Calendar',
            _meta: { [GROUPS_META_KEY]: ['comms'] }
        });

        // Tools assigned to leaf groups
        mcpServer.registerTool(
            'create_sheet',
            {
                description: 'Create spreadsheet',
                inputSchema: { name: z.string() },
                _meta: { [GROUPS_META_KEY]: ['spreadsheets'] }
            },
            async ({ name }) => ({
                content: [{ type: 'text', text: `Created ${name}` }]
            })
        );
        mcpServer.registerTool(
            'send_email',
            {
                description: 'Send email',
                inputSchema: { to: z.string(), body: z.string() },
                _meta: { [GROUPS_META_KEY]: ['email'] }
            },
            async ({ to }) => ({
                content: [{ type: 'text', text: `Sent to ${to}` }]
            })
        );
        mcpServer.registerTool(
            'write_doc',
            {
                description: 'Write document',
                inputSchema: { title: z.string() },
                _meta: { [GROUPS_META_KEY]: ['docs'] }
            },
            async ({ title }) => ({
                content: [{ type: 'text', text: `Doc: ${title}` }]
            })
        );
        mcpServer.registerTool(
            'schedule_meeting',
            {
                description: 'Schedule meeting',
                inputSchema: { date: z.string() },
                _meta: { [GROUPS_META_KEY]: ['calendar'] }
            },
            async ({ date }) => ({
                content: [{ type: 'text', text: `Meeting on ${date}` }]
            })
        );
        // A tool in NO group
        mcpServer.registerTool('ping', { description: 'Health check' }, async () => ({ content: [{ type: 'text', text: 'pong' }] }));

        // Resources assigned to groups
        mcpServer.registerResource(
            'inbox',
            'email://inbox',
            {
                description: 'Inbox',
                _meta: { [GROUPS_META_KEY]: ['email'] }
            },
            async () => ({
                contents: [{ uri: 'email://inbox', text: 'empty', mimeType: 'text/plain' }]
            })
        );

        await connectPair(mcpServer, client);

        // ---- Verify groups ----
        const { groups } = await groupingClient.listGroups();
        expect(groups).toHaveLength(6);

        const groupNames = groups.map(g => g.name).sort();
        expect(groupNames).toEqual(['calendar', 'comms', 'docs', 'email', 'spreadsheets', 'work']);

        // Verify nesting
        for (const childName of ['spreadsheets', 'docs']) {
            const child = groups.find(g => g.name === childName)!;
            expect(child._meta?.[GROUPS_META_KEY]).toEqual(['work']);
        }
        for (const childName of ['email', 'calendar']) {
            const child = groups.find(g => g.name === childName)!;
            expect(child._meta?.[GROUPS_META_KEY]).toEqual(['comms']);
        }
        for (const rootName of ['work', 'comms']) {
            const root = groups.find(g => g.name === rootName)!;
            expect(root._meta?.[GROUPS_META_KEY]).toBeUndefined();
        }

        // ---- Verify tools carry group membership ----
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(5);

        expect(tools.find(t => t.name === 'create_sheet')!._meta?.[GROUPS_META_KEY]).toEqual(['spreadsheets']);
        expect(tools.find(t => t.name === 'send_email')!._meta?.[GROUPS_META_KEY]).toEqual(['email']);
        expect(tools.find(t => t.name === 'ping')!._meta?.[GROUPS_META_KEY]).toBeUndefined();

        // ---- Verify resources carry group membership ----
        const { resources } = await client.listResources();
        expect(resources.find(r => r.name === 'inbox')!._meta?.[GROUPS_META_KEY]).toEqual(['email']);

        // ---- Client-side filtering: expand "work" to get all descendant tools ----
        const workDescendants = new Set<string>();
        const queue = ['work'];
        while (queue.length) {
            const cur = queue.shift()!;
            if (workDescendants.has(cur)) continue;
            workDescendants.add(cur);
            for (const g of groups) {
                if (GroupingClient.getGroupMembership(g._meta).includes(cur) && !workDescendants.has(g.name)) {
                    queue.push(g.name);
                }
            }
        }
        expect(workDescendants).toEqual(new Set(['work', 'spreadsheets', 'docs']));

        const workTools = tools.filter(t => GroupingClient.getGroupMembership(t._meta).some(g => workDescendants.has(g)));
        expect(workTools.map(t => t.name).sort()).toEqual(['create_sheet', 'write_doc']);
    });

    test('tool belongs to multiple groups simultaneously', async () => {
        grouping.registerGroup('email', { title: 'Email' });
        grouping.registerGroup('docs', { title: 'Documents' });

        mcpServer.registerTool(
            'spell_check',
            {
                description: 'Spell check text',
                inputSchema: { text: z.string() },
                _meta: { [GROUPS_META_KEY]: ['email', 'docs'] }
            },
            async ({ text }) => ({
                content: [{ type: 'text', text: `Checked: ${text}` }]
            })
        );

        await connectPair(mcpServer, client);

        const { tools } = await client.listTools();
        const sc = tools.find(t => t.name === 'spell_check')!;
        expect(sc._meta?.[GROUPS_META_KEY]).toEqual(['email', 'docs']);

        for (const groupName of ['email', 'docs']) {
            const filtered = tools.filter(t => GroupingClient.getGroupMembership(t._meta).includes(groupName));
            expect(filtered.map(t => t.name)).toContain('spell_check');
        }
    });

    test('listGroups returns empty when no groups registered', async () => {
        await connectPair(mcpServer, client);
        const { groups } = await groupingClient.listGroups();
        expect(groups).toHaveLength(0);
    });

    test('registerGroup rejects duplicate names', async () => {
        grouping.registerGroup('alpha', { title: 'Alpha' });
        expect(() => grouping.registerGroup('alpha', { title: 'Alpha again' })).toThrow('Group "alpha" is already registered');
    });

    test('groups added and removed post-connect, only groups/list_changed fires', async () => {
        const { clientTransport } = await connectPair(mcpServer, client);
        const notificationMethods = spyOnNotifications(clientTransport);

        // Add two groups
        const handle = grouping.registerGroup('a', { title: 'A' });
        grouping.registerGroup('b', { title: 'B' });
        await new Promise(r => setTimeout(r, 50));

        let result = await groupingClient.listGroups();
        expect(result.groups.map(g => g.name).sort()).toEqual(['a', 'b']);

        // Remove via handle.remove()
        handle.remove();
        await new Promise(r => setTimeout(r, 50));

        result = await groupingClient.listGroups();
        expect(result.groups.map(g => g.name)).toEqual(['b']);

        // Remove via removeGroup()
        grouping.removeGroup('b');
        await new Promise(r => setTimeout(r, 50));

        result = await groupingClient.listGroups();
        expect(result.groups).toHaveLength(0);

        // Every notification was groups/list_changed — never tools or resources
        expect(notificationMethods.length).toBeGreaterThanOrEqual(3);
        for (const method of notificationMethods) {
            expect(method).toBe('notifications/groups/list_changed');
        }
    });

    test("changing primitive group membership fires the primitive's list_changed (not groups)", async () => {
        grouping.registerGroup('alpha', { title: 'Alpha' });
        grouping.registerGroup('beta', { title: 'Beta' });

        const toolHandle = mcpServer.registerTool(
            'my_tool',
            {
                description: 'A tool',
                _meta: { [GROUPS_META_KEY]: ['alpha'] }
            },
            async () => ({ content: [{ type: 'text', text: 'ok' }] })
        );

        const resHandle = mcpServer.registerResource(
            'my_res',
            'test://resource',
            {
                description: 'A resource',
                _meta: { [GROUPS_META_KEY]: ['alpha'] }
            },
            async () => ({
                contents: [{ uri: 'test://resource', text: 'data', mimeType: 'text/plain' }]
            })
        );

        const { clientTransport } = await connectPair(mcpServer, client);

        // Verify initial membership
        let { tools } = await client.listTools();
        expect(tools.find(t => t.name === 'my_tool')!._meta?.[GROUPS_META_KEY]).toEqual(['alpha']);
        let { resources } = await client.listResources();
        expect(resources.find(r => r.name === 'my_res')!._meta?.[GROUPS_META_KEY]).toEqual(['alpha']);

        // Start spying AFTER connect so we only capture post-handshake notifications
        const notificationMethods = spyOnNotifications(clientTransport);

        // Change tool's group membership
        toolHandle.update({
            _meta: { [GROUPS_META_KEY]: ['beta'] }
        });
        await new Promise(r => setTimeout(r, 50));

        ({ tools } = await client.listTools());
        expect(tools.find(t => t.name === 'my_tool')!._meta?.[GROUPS_META_KEY]).toEqual(['beta']);

        // Change resource's group membership
        resHandle.update({
            metadata: { _meta: { [GROUPS_META_KEY]: ['beta'] } }
        });
        await new Promise(r => setTimeout(r, 50));

        ({ resources } = await client.listResources());
        expect(resources.find(r => r.name === 'my_res')!._meta?.[GROUPS_META_KEY]).toEqual(['beta']);

        // Only primitive-specific notifications fired, never groups/list_changed
        expect(notificationMethods).toContain('notifications/tools/list_changed');
        expect(notificationMethods).toContain('notifications/resources/list_changed');
        expect(notificationMethods).not.toContain('notifications/groups/list_changed');
    });

    test('RegisteredGroup handle: rename, update fields, disable/enable', async () => {
        const handle = grouping.registerGroup('orig', {
            title: 'Original',
            description: 'Before'
        });

        const { clientTransport } = await connectPair(mcpServer, client);

        let result = await groupingClient.listGroups();
        expect(result.groups[0]).toMatchObject({
            name: 'orig',
            title: 'Original',
            description: 'Before'
        });

        const notificationMethods = spyOnNotifications(clientTransport);

        // Rename + mutate fields
        handle.update({
            name: 'renamed',
            title: 'Renamed',
            description: 'After'
        });

        result = await groupingClient.listGroups();
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]).toMatchObject({
            name: 'renamed',
            title: 'Renamed',
            description: 'After'
        });
        expect(result.groups.find(g => g.name === 'orig')).toBeUndefined();

        // Disable — group disappears from listing
        handle.disable();
        result = await groupingClient.listGroups();
        expect(result.groups).toHaveLength(0);

        // Re-enable — reappears with its data intact
        handle.enable();
        result = await groupingClient.listGroups();
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].title).toBe('Renamed');

        // Every mutation sent groups/list_changed
        await new Promise(r => setTimeout(r, 50));
        expect(notificationMethods.length).toBeGreaterThanOrEqual(3);
        for (const method of notificationMethods) {
            expect(method).toBe('notifications/groups/list_changed');
        }
    });

    test('three-level nesting: client can traverse and collect all tools', async () => {
        // root > mid > leaf
        grouping.registerGroup('root', { title: 'Root' });
        grouping.registerGroup('mid', {
            title: 'Mid',
            _meta: { [GROUPS_META_KEY]: ['root'] }
        });
        grouping.registerGroup('leaf', {
            title: 'Leaf',
            _meta: { [GROUPS_META_KEY]: ['mid'] }
        });

        mcpServer.registerTool(
            'root_tool',
            {
                description: 'In root',
                _meta: { [GROUPS_META_KEY]: ['root'] }
            },
            async () => ({ content: [{ type: 'text', text: 'r' }] })
        );
        mcpServer.registerTool(
            'mid_tool',
            {
                description: 'In mid',
                _meta: { [GROUPS_META_KEY]: ['mid'] }
            },
            async () => ({ content: [{ type: 'text', text: 'm' }] })
        );
        mcpServer.registerTool(
            'leaf_tool',
            {
                description: 'In leaf',
                _meta: { [GROUPS_META_KEY]: ['leaf'] }
            },
            async () => ({ content: [{ type: 'text', text: 'l' }] })
        );

        await connectPair(mcpServer, client);

        const { groups } = await groupingClient.listGroups();
        const { tools } = await client.listTools();

        // BFS from root collects all 3 levels
        const expanded = new Set<string>();
        const queue = ['root'];
        while (queue.length) {
            const cur = queue.shift()!;
            if (expanded.has(cur)) continue;
            expanded.add(cur);
            for (const g of groups) {
                if (GroupingClient.getGroupMembership(g._meta).includes(cur)) {
                    queue.push(g.name);
                }
            }
        }
        expect(expanded).toEqual(new Set(['root', 'mid', 'leaf']));

        const rootTreeTools = tools
            .filter(t => GroupingClient.getGroupMembership(t._meta).some(g => expanded.has(g)))
            .map(t => t.name)
            .sort();
        expect(rootTreeTools).toEqual(['leaf_tool', 'mid_tool', 'root_tool']);

        // Expand from "mid" only gets mid + leaf
        const midExpanded = new Set<string>();
        const mq = ['mid'];
        while (mq.length) {
            const cur = mq.shift()!;
            if (midExpanded.has(cur)) continue;
            midExpanded.add(cur);
            for (const g of groups) {
                if (GroupingClient.getGroupMembership(g._meta).includes(cur)) {
                    mq.push(g.name);
                }
            }
        }
        const midTreeTools = tools
            .filter(t => GroupingClient.getGroupMembership(t._meta).some(g => midExpanded.has(g)))
            .map(t => t.name)
            .sort();
        expect(midTreeTools).toEqual(['leaf_tool', 'mid_tool']);
    });
});
