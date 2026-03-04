import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { GroupingExtension } from '../src/server.js';
import { GroupingClient } from '../src/client.js';
import { GROUPS_META_KEY } from '../src/types.js';

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

describe('Server Groups', () => {
    let mcpServer: McpServer;
    let client: Client;
    let grouping: GroupingExtension;
    let groupingClient: GroupingClient;
    let serverTransport: InMemoryTransport;
    let clientTransport: InMemoryTransport;

    beforeEach(() => {
        mcpServer = new McpServer({
            name: 'test-server',
            version: '1.0.0'
        });

        grouping = new GroupingExtension(mcpServer);

        const [ct, st] = InMemoryTransport.createLinkedPair();
        clientTransport = ct;
        serverTransport = st;

        client = new Client({
            name: 'test-client',
            version: '1.0.0'
        });

        groupingClient = new GroupingClient(client);
    });

    afterEach(async () => {
        await Promise.all([client.close(), mcpServer.close()]);
    });

    test('should register groups and list them', async () => {
        grouping.registerGroup('group1', {
            title: 'Group 1',
            description: 'First test group'
        });

        grouping.registerGroup('group2', {
            title: 'Group 2',
            description: 'Second test group'
        });

        await Promise.all([client.connect(clientTransport), mcpServer.connect(serverTransport)]);

        const result = await groupingClient.listGroups();
        expect(result.groups).toHaveLength(2);
        expect(result.groups.find(g => g.name === 'group1')).toMatchObject({
            name: 'group1',
            title: 'Group 1',
            description: 'First test group'
        });
        expect(result.groups.find(g => g.name === 'group2')).toMatchObject({
            name: 'group2',
            title: 'Group 2',
            description: 'Second test group'
        });
    });

    test('should add tools and resources to groups (mixed fashion)', async () => {
        grouping.registerGroup('mixed-group', {
            description: 'A group with different primitives'
        });

        // Add tools to the group
        mcpServer.registerTool(
            'tool1',
            {
                description: 'Test tool 1',
                _meta: {
                    [GROUPS_META_KEY]: ['mixed-group']
                }
            },
            async () => ({ content: [{ type: 'text', text: 'hi' }] })
        );

        mcpServer.registerTool('tool-no-group', { description: 'Tool with no group' }, async () => ({
            content: [{ type: 'text', text: 'hi' }]
        }));

        // TODO: add prompt grouping once SDK registerPrompt supports _meta passthrough

        // Add a resource to the same group
        mcpServer.registerResource(
            'resource1',
            'test://resource1',
            {
                description: 'Test resource 1',
                _meta: {
                    [GROUPS_META_KEY]: ['mixed-group']
                }
            },
            async () => ({ contents: [] })
        );

        mcpServer.registerResource(
            'resource-no-group',
            'test://resource-no-group',
            { description: 'Resource with no group' },
            async () => ({
                contents: []
            })
        );

        // TODO: add task-tool grouping once SDK experimental.tasks is available

        await Promise.all([client.connect(clientTransport), mcpServer.connect(serverTransport)]);

        // Verify tools
        const toolsResult = await client.listTools();
        const tool1 = toolsResult.tools.find(t => t.name === 'tool1');
        const toolNoGroup = toolsResult.tools.find(t => t.name === 'tool-no-group');

        expect(tool1?._meta?.[GROUPS_META_KEY]).toEqual(['mixed-group']);
        expect(toolNoGroup?._meta?.[GROUPS_META_KEY]).toBeUndefined();

        if (toolNoGroup?._meta) {
            expect(toolNoGroup._meta).not.toHaveProperty(GROUPS_META_KEY);
        }

        // Verify resources
        const resourcesResult = await client.listResources();
        const resource1 = resourcesResult.resources.find(r => r.name === 'resource1');
        const resourceNoGroup = resourcesResult.resources.find(r => r.name === 'resource-no-group');
        expect(resource1?._meta?.[GROUPS_META_KEY]).toEqual(['mixed-group']);
        if (resourceNoGroup?._meta) {
            expect(resourceNoGroup._meta).not.toHaveProperty(GROUPS_META_KEY);
        }
    });

    test('should add a group to another group', async () => {
        grouping.registerGroup('parent-group', {
            description: 'A parent group'
        });

        grouping.registerGroup('child-group', {
            description: 'A child group',
            _meta: {
                [GROUPS_META_KEY]: ['parent-group']
            }
        });

        await Promise.all([client.connect(clientTransport), mcpServer.connect(serverTransport)]);

        const result = await groupingClient.listGroups();
        const childGroup = result.groups.find(g => g.name === 'child-group');
        expect(childGroup?._meta?.[GROUPS_META_KEY]).toEqual(['parent-group']);
    });
});

describe('Group List Changed Notifications', () => {
    let mcpServer: McpServer;
    let client: Client;
    let grouping: GroupingExtension;
    let groupingClient: GroupingClient;

    beforeEach(() => {
        mcpServer = new McpServer({
            name: 'test-server',
            version: '1.0.0'
        });

        grouping = new GroupingExtension(mcpServer);

        client = new Client({
            name: 'test-client',
            version: '1.0.0'
        });

        groupingClient = new GroupingClient(client);
    });

    afterEach(async () => {
        await Promise.all([client.close(), mcpServer.close()]);
    });

    test('should handle group list changed notification with manual refresh', async () => {
        // Register initial group before connect (sets up capability and handlers)
        grouping.registerGroup('initial-group', {
            description: 'Initial group'
        });

        const { clientTransport } = await connectPair(mcpServer, client);
        const notificationMethods = spyOnNotifications(clientTransport);

        // Register another group post-connect — triggers listChanged notification
        grouping.registerGroup('test-group', {
            description: 'A test group'
        });

        // Wait for the notification to be delivered
        await new Promise(resolve => setTimeout(resolve, 100));

        // Should have received at least one groups/list_changed notification
        expect(notificationMethods).toContain('notifications/groups/list_changed');

        // Manually refresh groups
        const result = await groupingClient.listGroups();
        expect(result.groups).toHaveLength(2);
        expect(result.groups.find(g => g.name === 'test-group')).toBeDefined();
    });

    test('should handle group list changed notification with auto refresh', async () => {
        const notifications: string[][] = [];

        // Register initial group
        grouping.registerGroup('initial-group', {
            description: 'Initial group'
        });

        await connectPair(mcpServer, client);

        const result1 = await groupingClient.listGroups();
        expect(result1.groups).toHaveLength(1);

        // Listen for group changes and auto-refresh
        groupingClient.onGroupsChanged(async () => {
            const updated = await groupingClient.listGroups();
            notifications.push(updated.groups.map(g => g.name));
        });

        // Register another group — triggers listChanged notification
        grouping.registerGroup('test-group', {
            description: 'A test group'
        });

        // Wait for the notification callback to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Callback should have fired and auto-refreshed with 2 groups
        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toHaveLength(2);
        expect(notifications[0]).toContain('test-group');
    });
});
