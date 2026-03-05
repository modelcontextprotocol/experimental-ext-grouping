import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GROUPING_EXTENSION_ID, ListGroupsRequestSchema, type Group, type GroupMeta, type ListGroupsResult } from './types.js';

/**
 * Configuration for registering a group.
 */
export interface GroupConfig {
    title?: string;
    description?: string;
    icons?: Group['icons'];
    annotations?: Group['annotations'];
    _meta?: GroupMeta;
}

/**
 * A registered group with methods to update or remove it.
 */
export interface RegisteredGroup {
    title?: string;
    description?: string;
    icons?: Group['icons'];
    annotations?: Group['annotations'];
    _meta?: GroupMeta;
    enabled: boolean;
    enable(): void;
    disable(): void;
    update(updates: {
        name?: string | null;
        title?: string;
        description?: string;
        icons?: Group['icons'];
        annotations?: Group['annotations'];
        _meta?: GroupMeta;
        enabled?: boolean;
    }): void;
    remove(): void;
}

/**
 * Extension that adds group support to an McpServer.
 *
 * Registers `groups/list` request handler and capability under `extensions`.
 */
export class GroupingExtension {
    private _groups = new Map<string, RegisteredGroup>();
    private _handlersInitialized = false;
    private _mcpServer: McpServer;

    constructor(mcpServer: McpServer) {
        this._mcpServer = mcpServer;
        this._initHandlers();
    }

    private _initHandlers(): void {
        if (this._handlersInitialized) return;

        this._mcpServer.server.registerCapabilities({
            extensions: {
                [GROUPING_EXTENSION_ID]: { listChanged: true }
            }
        });

        this._mcpServer.server.setRequestHandler(ListGroupsRequestSchema, (): ListGroupsResult => {
            return {
                groups: Array.from(this._groups.entries())
                    .filter(([, g]) => g.enabled)
                    .map(
                        ([name, g]): Group => ({
                            name,
                            title: g.title,
                            description: g.description,
                            icons: g.icons,
                            annotations: g.annotations,
                            _meta: g._meta
                        })
                    )
            };
        });

        this._handlersInitialized = true;
    }

    /**
     * Register a named group.
     */
    registerGroup(name: string, config: GroupConfig = {}): RegisteredGroup {
        if (this._groups.has(name)) {
            throw new Error(`Group "${name}" is already registered`);
        }

        const { title, description, icons, annotations, _meta } = config;
        let currentName = name;

        const registered: RegisteredGroup = {
            title,
            description,
            icons,
            annotations,
            _meta,
            enabled: true,
            enable: () => registered.update({ enabled: true }),
            disable: () => registered.update({ enabled: false }),
            remove: () => registered.update({ name: null }),
            update: updates => {
                if (updates.name !== undefined && updates.name !== currentName) {
                    this._groups.delete(currentName);
                    if (updates.name) {
                        this._groups.set(updates.name, registered);
                    }
                    currentName = updates.name ?? currentName;
                }
                if (updates.title !== undefined) registered.title = updates.title;
                if (updates.description !== undefined) registered.description = updates.description;
                if (updates.icons !== undefined) registered.icons = updates.icons;
                if (updates.annotations !== undefined) registered.annotations = updates.annotations;
                if (updates._meta !== undefined) registered._meta = updates._meta;
                if (updates.enabled !== undefined) registered.enabled = updates.enabled;

                if (updates.name === null) {
                    this._groups.delete(currentName);
                }

                this.sendGroupListChanged();
            }
        };

        this._groups.set(name, registered);
        this.sendGroupListChanged();
        return registered;
    }

    /**
     * Remove a group by name.
     */
    removeGroup(name: string): void {
        if (this._groups.delete(name)) {
            this.sendGroupListChanged();
        }
    }

    /**
     * Send a notifications/groups/list_changed notification.
     */
    sendGroupListChanged(): void {
        if (this._mcpServer.isConnected()) {
            this._mcpServer.server.notification({ method: 'notifications/groups/list_changed' }).catch(() => {
                // Ignore errors when client is not listening
            });
        }
    }
}
