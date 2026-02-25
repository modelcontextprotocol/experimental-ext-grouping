/**
 * Example MCP client for the Grouping extension.
 *
 * Connects to the example server, lists groups and tools, and demonstrates
 * filtering tools by group membership with nested group traversal.
 *
 * Run: npx tsx examples/client.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { GroupingClient, GROUPS_META_KEY } from '../src/index.js';
import type { Group } from '../src/index.js';
import * as readline from 'node:readline';

async function main() {
    const transport = new StdioClientTransport({
        command: 'npx',
        args: ['tsx', 'examples/server.ts']
    });

    const client = new Client({
        name: 'groups-example-client',
        version: '1.0.0'
    });

    const groupingClient = new GroupingClient(client);

    await client.connect(transport);
    console.log('Connected to groups example server\n');

    // Fetch all data
    const { groups } = await groupingClient.listGroups();
    const { tools } = await client.listTools();
    const { resources } = await client.listResources();

    // Listen for group changes
    groupingClient.onGroupsChanged(async () => {
        const updated = await groupingClient.listGroups();
        console.log(
            '\n[Groups changed]',
            updated.groups.map(g => g.name)
        );
    });

    // Build parent→children adjacency map from _meta membership
    const parentToChildren = new Map<string, Set<string>>();
    for (const group of groups) {
        const parents = GroupingClient.getGroupMembership(group._meta);
        for (const parent of parents) {
            if (!parentToChildren.has(parent)) {
                parentToChildren.set(parent, new Set());
            }
            parentToChildren.get(parent)!.add(group.name);
        }
    }

    // BFS expansion: given a group name, find all descendant group names
    function expandGroup(name: string, maxDepth = 10): Set<string> {
        const visited = new Set<string>();
        const queue: [string, number][] = [[name, 0]];
        while (queue.length > 0) {
            const [current, depth] = queue.shift()!;
            if (visited.has(current) || depth > maxDepth) continue;
            visited.add(current);
            const children = parentToChildren.get(current);
            if (children) {
                for (const child of children) {
                    queue.push([child, depth + 1]);
                }
            }
        }
        return visited;
    }

    // Filter tools belonging to a set of group names
    function filterByGroups<T extends { _meta?: Record<string, unknown> }>(items: T[], groupNames: Set<string>): T[] {
        return items.filter(item => {
            const membership = GroupingClient.getGroupMembership(item._meta);
            return membership.some(g => groupNames.has(g));
        });
    }

    // Print helpers
    function printGroups(gs: Group[]) {
        for (const g of gs) {
            const parents = GroupingClient.getGroupMembership(g._meta);
            const parentStr = parents.length > 0 ? ` (in: ${parents.join(', ')})` : '';
            console.log(`  [${g.name}] ${g.title ?? g.name}${parentStr}`);
            if (g.description) console.log(`    ${g.description}`);
        }
    }

    // Interactive REPL
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('Commands:');
    console.log('  all       — show all groups, tools, resources');
    console.log('  groups    — list groups');
    console.log('  <name>    — filter tools/resources by group (with nesting)');
    console.log('  help      — show commands');
    console.log('  exit      — quit\n');

    const prompt = () => rl.question('> ', handleCommand);

    function handleCommand(input: string) {
        const cmd = input.trim().toLowerCase();

        if (cmd === 'exit' || cmd === 'quit') {
            rl.close();
            client.close();
            return;
        }

        if (cmd === 'help') {
            console.log('  all, groups, <group-name>, help, exit');
        } else if (cmd === 'all') {
            console.log('\n--- Groups ---');
            printGroups(groups);
            console.log(`\n--- Tools (${tools.length}) ---`);
            for (const t of tools) {
                const membership = GroupingClient.getGroupMembership(t._meta);
                console.log(`  ${t.name}${membership.length > 0 ? ` [${membership.join(', ')}]` : ''}`);
            }
            console.log(`\n--- Resources (${resources.length}) ---`);
            for (const r of resources) {
                const membership = GroupingClient.getGroupMembership(r._meta);
                console.log(`  ${r.name}${membership.length > 0 ? ` [${membership.join(', ')}]` : ''}`);
            }
        } else if (cmd === 'groups') {
            console.log('\n--- Groups ---');
            printGroups(groups);
        } else {
            // Try to match as a group name
            const matchedGroup = groups.find(g => g.name === cmd || g.title?.toLowerCase() === cmd);
            if (matchedGroup) {
                const expanded = expandGroup(matchedGroup.name);
                const matchedTools = filterByGroups(tools, expanded);
                const matchedResources = filterByGroups(resources, expanded);

                console.log(`\nGroup: ${matchedGroup.title ?? matchedGroup.name} (expanded: ${[...expanded].join(', ')})`);
                console.log(`  Tools (${matchedTools.length}):`);
                for (const t of matchedTools) {
                    console.log(`    ${t.name} — ${t.description}`);
                }
                console.log(`  Resources (${matchedResources.length}):`);
                for (const r of matchedResources) {
                    console.log(`    ${r.name} — ${r.description}`);
                }
            } else {
                console.log(`Unknown command or group: "${cmd}". Type "help".`);
            }
        }

        console.log();
        prompt();
    }

    prompt();
}

main().catch(console.error);
