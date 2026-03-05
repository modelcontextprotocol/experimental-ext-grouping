import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { GROUPS_META_KEY, GroupListChangedNotificationSchema, ListGroupsResultSchema, type ListGroupsResult } from './types.js';

/**
 * Client-side helper for the MCP Grouping extension.
 */
export class GroupingClient {
    private _client: Client;

    constructor(client: Client) {
        this._client = client;
    }

    /**
     * List groups from the server.
     */
    async listGroups(params?: { cursor?: string }): Promise<ListGroupsResult> {
        return this._client.request({ method: 'groups/list', params }, ListGroupsResultSchema);
    }

    /**
     * Register a handler for group list changed notifications.
     */
    onGroupsChanged(handler: () => void): void {
        this._client.setNotificationHandler(GroupListChangedNotificationSchema, handler);
    }

    /**
     * Extract group membership from a primitive's _meta field.
     */
    static getGroupMembership(meta: unknown): string[] {
        if (
            meta != null &&
            typeof meta === 'object' &&
            GROUPS_META_KEY in meta &&
            Array.isArray((meta as Record<string, unknown>)[GROUPS_META_KEY])
        ) {
            return (meta as Record<string, unknown>)[GROUPS_META_KEY] as string[];
        }
        return [];
    }
}
