// Run with:
//   npx tsx examples/client.ts
//
// This example spawns the matching stdio server by default. To point at a different stdio server:
//   npx tsx examples/client.ts --server-command <cmd> --server-args "..."

import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { GroupingClient, GROUPS_META_KEY } from '../src/index.js';
import type { Group } from '../src/index.js';

type GroupName = string;

/**
 * Parse a user-entered group list.
 *
 * Accepts either comma-separated or whitespace-separated input (or a mix of both), e.g.:
 * - `communications, work`
 * - `communications work`
 */
function parseGroupList(input: string): string[] {
    return input
        .split(/[\s,]+/)
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * Extracts group membership from a primitive's `_meta` object.
 *
 * The MCP groups proposal uses `_meta[GROUPS_META_KEY]` to store a list of group names.
 * - If `_meta` is missing or malformed, this returns `[]`.
 * - Non-string entries are ignored.
 */
function groupMembership(meta: unknown): string[] {
    if (!meta || typeof meta !== 'object') {
        return [];
    }

    const record = meta as Record<string, unknown>;

    const value = record[GROUPS_META_KEY];
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((v): v is string => typeof v === 'string');
}

/**
 * Builds a directed adjacency map from parent group -> child groups.
 *
 * In this proposal, *child* groups declare their parent group(s) via `_meta[GROUPS_META_KEY]`.
 * So we invert that relationship into a `parentToChildren` map to make traversal easier.
 */
function buildParentToChildrenMap(groups: Group[]): Map<GroupName, Set<GroupName>> {
    const map = new Map<GroupName, Set<GroupName>>();

    for (const group of groups) {
        const parents = groupMembership(group._meta);
        for (const parent of parents) {
            if (!map.has(parent)) {
                map.set(parent, new Set());
            }
            map.get(parent)!.add(group.name);
        }
    }

    return map;
}

/**
 * Returns every group name the client should consider during traversal.
 *
 * Some parent nodes may exist only as names referenced by children (i.e., appear in `_meta`)
 * even if the server doesn't explicitly return them as `Group` objects.
 */
function allKnownGroupNames(groups: Group[], parentToChildren: Map<GroupName, Set<GroupName>>): Set<GroupName> {
    const names = new Set<GroupName>();

    for (const g of groups) {
        names.add(g.name);
    }
    for (const parent of parentToChildren.keys()) {
        names.add(parent);
    }

    return names;
}

/**
 * Maximum descendant depth in *edges* found in the group graph.
 *
 * Example:
 * - A leaf group has depth 0.
 * - A parent with direct children has depth 1.
 *
 * Cycles are handled by refusing to evaluate a group already on the current path.
 */
function computeMaxDepthEdges(allGroups: Iterable<GroupName>, parentToChildren: Map<GroupName, Set<GroupName>>): number {
    const memo = new Map<GroupName, number>();

    const dfs = (node: GroupName, nodePath: Set<GroupName>): number => {
        const cached = memo.get(node);
        if (cached !== undefined) {
            return cached;
        }

        if (nodePath.has(node)) {
            return 0;
        }

        nodePath.add(node);
        const children = parentToChildren.get(node);
        let best = 0;
        if (children) {
            for (const child of children) {
                if (nodePath.has(child)) {
                    continue;
                }
                best = Math.max(best, 1 + dfs(child, nodePath));
            }
        }

        nodePath.delete(node);

        memo.set(node, best);
        return best;
    };

    let max = 0;
    for (const g of allGroups) {
        max = Math.max(max, dfs(g, new Set<GroupName>()));
    }
    return max;
}

/**
 * Expands selected groups through the group graph up to a maximum number of edges.
 *
 * This function is intentionally:
 * - **depth-limited**: `depthEdges` controls how far to traverse (in edges)
 * - **cycle-safe**: a `visited` set prevents re-processing the same group and avoids loops
 *
 * `includeSelf` controls whether the returned set contains the starting groups.
 */
function expandWithinDepth(
    selected: string[],
    parentToChildren: Map<GroupName, Set<GroupName>>,
    depthEdges: number,
    includeSelf: boolean
): Set<GroupName> {
    const out = new Set<GroupName>();
    const visited = new Set<GroupName>();

    const queue: Array<{ name: GroupName; remaining: number }> = [];

    for (const g of selected) {
        if (includeSelf) {
            out.add(g);
        }

        if (!visited.has(g)) {
            visited.add(g);
            queue.push({ name: g, remaining: depthEdges });
        }
    }

    while (queue.length > 0) {
        const { name: current, remaining } = queue.shift()!;

        if (remaining <= 0) {
            continue;
        }

        const children = parentToChildren.get(current);

        if (!children) {
            continue;
        }
        for (const child of children) {
            out.add(child);

            if (!visited.has(child)) {
                visited.add(child);
                queue.push({ name: child, remaining: remaining - 1 });
            }
        }
    }

    if (!includeSelf) {
        for (const g of selected) {
            out.delete(g);
        }
    }

    return out;
}

function formatBulletList(items: Array<{ name: string; description?: string }>): string {
    if (items.length === 0) {
        return '';
    }

    return items
        .map(i => {
            const desc = i.description ? ` — ${i.description}` : '';
            return `- ${i.name}${desc}`;
        })
        .join('\n');
}

function printHelp() {
    console.log('\nCommands:');
    console.log(' all (a)                 List all groups, tools, and resources');
    console.log(' depth (d) [n]           Show or set group display depth (1..max)');
    console.log(' groups (g/enter)        List available groups ');
    console.log(' help (h)                Show this help');
    console.log(' exit (e/quit/q)         Quit');
    console.log(' <groups...>             Filter by one or more groups (comma or space-separated)');
}

function parseArgs(argv: string[]) {
    const parsed: { serverCommand?: string; serverArgs?: string[] } = {};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--server-command' && argv[i + 1]) {
            parsed.serverCommand = argv[i + 1]!;
            i++;
            continue;
        }
        if (arg === '--server-args' && argv[i + 1]) {
            parsed.serverArgs = argv[i + 1]!.split(/\s+/).filter(Boolean);
            i++;
            continue;
        }
    }

    return parsed;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const defaultServerPath = path.resolve(__dirname, 'server.ts');
    const serverCommand = args.serverCommand ?? 'npx';
    const serverArgs = args.serverArgs ?? ['tsx', defaultServerPath];

    console.log(`Starting stdio server: ${serverCommand} ${serverArgs.join(' ')}`);

    const transport = new StdioClientTransport({
        command: serverCommand,
        args: serverArgs
    });

    const client = new Client({
        name: 'groups-example-client',
        version: '1.0.0'
    });

    const groupingClient = new GroupingClient(client);

    await client.connect(transport);

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

    // Build traversal structures
    const parentToChildren = buildParentToChildrenMap(groups);
    const allNames = allKnownGroupNames(groups, parentToChildren);
    const maxDepth = computeMaxDepthEdges(allNames, parentToChildren);
    let displayDepth = maxDepth;

    console.log(`\nFetched: ${groups.length} groups, ${tools.length} tools, ${resources.length} resources.`);
    console.log(`Available groups: ${groups.map(g => g.name).join(', ')}`);
    console.log(`Group display depth: ${displayDepth} (max: ${maxDepth})`);

    printHelp();

    // Filter primitives belonging to a set of group names
    function filterByGroups<T extends { _meta?: Record<string, unknown> }>(items: T[], groupNames: Set<GroupName>): T[] {
        return items.filter(item => {
            const membership = groupMembership(item._meta);
            return membership.some(g => groupNames.has(g));
        });
    }

    // Interactive REPL
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const prompt = () => rl.question('\nEnter a command or a list of groups to filter by: ', handleCommand);

    function handleCommand(input: string) {
        const cmd = input.trim().toLowerCase();

        if (!cmd || cmd === 'groups' || cmd === 'g') {
            console.log('\nGroups:');
            console.log(formatBulletList(groups) || '(none)');
            prompt();
            return;
        }

        if (cmd === 'exit' || cmd === 'e' || cmd === 'quit' || cmd === 'q') {
            rl.close();
            client.close();
            return;
        }

        if (cmd === 'help' || cmd === 'h') {
            printHelp();
        } else if (cmd === 'all' || cmd === 'a') {
            console.log('\nGroups:');
            console.log(formatBulletList(groups) || '(none)');
            console.log('\nTools:');
            console.log(formatBulletList(tools) || '(none)');
            console.log('\nResources:');
            console.log(formatBulletList(resources) || '(none)');
        } else if (cmd === 'd' || cmd === 'depth') {
            console.log(`Group display depth: ${displayDepth} (max: ${maxDepth}).`);
        } else if (cmd.startsWith('d ') || cmd.startsWith('depth ')) {
            const parts = cmd.split(/\s+/);
            const n = parseInt(parts[1]!, 10);
            if (isNaN(n) || n < 1 || n > maxDepth) {
                console.log(`Invalid depth. Choose 1..${maxDepth}.`);
            } else {
                displayDepth = n;
                console.log(`Group display depth set to ${displayDepth} (max: ${maxDepth}).`);
            }
        } else {
            // Try to match as group name(s)
            const requested = parseGroupList(cmd);
            const matched = requested.filter(name => groups.some(g => g.name === name));

            if (matched.length === 0) {
                console.log(`Unknown command or group: "${cmd}". Type "help".`);
            } else {
                // Expand selected groups to displayDepth, excluding the selected groups themselves from "Groups" output
                const expandedChildren = expandWithinDepth(matched, parentToChildren, displayDepth, false);
                const expandedAll = expandWithinDepth(matched, parentToChildren, displayDepth, true);

                const matchedChildGroups = groups.filter(g => expandedChildren.has(g.name));
                const matchedTools = filterByGroups(tools, expandedAll);
                const matchedResources = filterByGroups(resources, expandedAll);

                console.log('\nGroups:');
                console.log(formatBulletList(matchedChildGroups) || '(none)');
                console.log('\nTools:');
                console.log(formatBulletList(matchedTools) || '(none)');
                console.log('\nResources:');
                console.log(formatBulletList(matchedResources) || '(none)');
            }
        }

        prompt();
    }

    prompt();
}

await main();
