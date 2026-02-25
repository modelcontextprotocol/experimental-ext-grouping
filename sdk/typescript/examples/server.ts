/**
 * Example MCP server using the Grouping extension.
 *
 * Registers a "productivity" group hierarchy (work + communications)
 * with tools and resources assigned to child groups.
 *
 * Run: npx tsx examples/server.ts
 */
import { z } from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GroupingExtension, GROUPS_META_KEY } from '../src/index.js';

const mcpServer = new McpServer({
    name: 'groups-example-server',
    version: '1.0.0'
});

const grouping = new GroupingExtension(mcpServer);

// Helper to create _meta with group membership
function metaForGroup(groupName: string) {
    return { _meta: { [GROUPS_META_KEY]: [groupName] } };
}

// --- Parent groups ---
grouping.registerGroup('work', {
    title: 'Work Tools',
    description: 'Tools for work-related tasks.'
});

grouping.registerGroup('communications', {
    title: 'Communications',
    description: 'Tools for email and calendar.'
});

// --- Child groups (nested under parents) ---
grouping.registerGroup('spreadsheets', {
    title: 'Spreadsheets',
    description: 'Spreadsheet management tools.',
    ...metaForGroup('work')
});

grouping.registerGroup('documents', {
    title: 'Documents',
    description: 'Document management tools.',
    ...metaForGroup('work')
});

grouping.registerGroup('todos', {
    title: 'Todos',
    description: 'Task and todo management.',
    ...metaForGroup('work')
});

grouping.registerGroup('email', {
    title: 'Email',
    description: 'Email tools.',
    ...metaForGroup('communications')
});

grouping.registerGroup('calendar', {
    title: 'Calendar',
    description: 'Calendar and scheduling tools.',
    ...metaForGroup('communications')
});

// --- Tools ---
mcpServer.registerTool(
    'email_send',
    {
        description: 'Send an email',
        inputSchema: {
            to: z.string().describe('Recipient'),
            subject: z.string().describe('Subject line'),
            body: z.string().describe('Email body')
        },
        ...metaForGroup('email')
    },
    async ({ to, subject }) => ({
        content: [{ type: 'text' as const, text: `Email sent to ${to}: ${subject}` }]
    })
);

mcpServer.registerTool(
    'email_search_inbox',
    {
        description: 'Search inbox for emails',
        inputSchema: { query: z.string().describe('Search query') },
        ...metaForGroup('email')
    },
    async ({ query }) => ({
        content: [{ type: 'text' as const, text: `Search results for: ${query}` }]
    })
);

mcpServer.registerTool(
    'calendar_create_event',
    {
        description: 'Create a calendar event',
        inputSchema: {
            title: z.string().describe('Event title'),
            date: z.string().describe('Event date')
        },
        ...metaForGroup('calendar')
    },
    async ({ title, date }) => ({
        content: [{ type: 'text' as const, text: `Event created: ${title} on ${date}` }]
    })
);

mcpServer.registerTool(
    'calendar_list_upcoming',
    {
        description: 'List upcoming calendar events',
        ...metaForGroup('calendar')
    },
    async () => ({
        content: [{ type: 'text' as const, text: 'Upcoming events: [none]' }]
    })
);

mcpServer.registerTool(
    'spreadsheets_create',
    {
        description: 'Create a new spreadsheet',
        inputSchema: { name: z.string().describe('Spreadsheet name') },
        ...metaForGroup('spreadsheets')
    },
    async ({ name }) => ({
        content: [{ type: 'text' as const, text: `Created spreadsheet: ${name}` }]
    })
);

mcpServer.registerTool(
    'spreadsheets_add_row',
    {
        description: 'Add a row to a spreadsheet',
        inputSchema: {
            sheetId: z.string().describe('Sheet ID'),
            data: z.string().describe('Row data (JSON)')
        },
        ...metaForGroup('spreadsheets')
    },
    async ({ sheetId }) => ({
        content: [{ type: 'text' as const, text: `Row added to ${sheetId}` }]
    })
);

mcpServer.registerTool(
    'documents_create',
    {
        description: 'Create a new document',
        inputSchema: { title: z.string().describe('Document title') },
        ...metaForGroup('documents')
    },
    async ({ title }) => ({
        content: [{ type: 'text' as const, text: `Document created: ${title}` }]
    })
);

mcpServer.registerTool(
    'documents_summarize',
    {
        description: 'Summarize a document',
        inputSchema: { docId: z.string().describe('Document ID') },
        ...metaForGroup('documents')
    },
    async ({ docId }) => ({
        content: [{ type: 'text' as const, text: `Summary of ${docId}: ...` }]
    })
);

mcpServer.registerTool(
    'todos_add',
    {
        description: 'Add a todo item',
        inputSchema: { task: z.string().describe('Task description') },
        ...metaForGroup('todos')
    },
    async ({ task }) => ({
        content: [{ type: 'text' as const, text: `Todo added: ${task}` }]
    })
);

mcpServer.registerTool(
    'todos_complete',
    {
        description: 'Mark a todo as complete',
        inputSchema: { todoId: z.string().describe('Todo ID') },
        ...metaForGroup('todos')
    },
    async ({ todoId }) => ({
        content: [{ type: 'text' as const, text: `Completed: ${todoId}` }]
    })
);

// --- Resources ---
mcpServer.registerResource(
    'calendar_overview',
    'calendar://overview',
    {
        description: 'Overview of upcoming calendar events',
        ...metaForGroup('calendar')
    },
    async () => ({
        contents: [
            {
                uri: 'calendar://overview',
                text: 'No upcoming events.',
                mimeType: 'text/plain'
            }
        ]
    })
);

mcpServer.registerResource(
    'email_overview',
    'email://overview',
    {
        description: 'Overview of recent emails',
        ...metaForGroup('email')
    },
    async () => ({
        contents: [
            {
                uri: 'email://overview',
                text: 'Inbox is empty.',
                mimeType: 'text/plain'
            }
        ]
    })
);

mcpServer.registerResource(
    'spreadsheets_overview',
    'spreadsheets://overview',
    {
        description: 'List of spreadsheets',
        ...metaForGroup('spreadsheets')
    },
    async () => ({
        contents: [
            {
                uri: 'spreadsheets://overview',
                text: 'No spreadsheets.',
                mimeType: 'text/plain'
            }
        ]
    })
);

mcpServer.registerResource(
    'documents_overview',
    'documents://overview',
    {
        description: 'List of documents',
        ...metaForGroup('documents')
    },
    async () => ({
        contents: [
            {
                uri: 'documents://overview',
                text: 'No documents.',
                mimeType: 'text/plain'
            }
        ]
    })
);

mcpServer.registerResource(
    'todos_overview',
    'todos://overview',
    {
        description: 'List of todo items',
        ...metaForGroup('todos')
    },
    async () => ({
        contents: [
            {
                uri: 'todos://overview',
                text: 'No todos.',
                mimeType: 'text/plain'
            }
        ]
    })
);

// --- Start server ---
async function main() {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error('Groups example server running on stdio');
}

main().catch(console.error);
