import { z } from 'zod/v4';
import {
    BaseMetadataSchema,
    IconsSchema,
    AnnotationsSchema,
    PaginatedRequestSchema,
    PaginatedResultSchema,
    NotificationSchema
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Reserved _meta key for group membership on any MCP primitive.
 */
export const GROUPS_META_KEY = 'io.modelcontextprotocol/groups';

/**
 * Canonical extension identifier for grouping.
 */
export const GROUPING_EXTENSION_ID = 'io.modelcontextprotocol/grouping';

/**
 * Schema for _meta that may include group membership.
 */
export const GroupMetaSchema = z.optional(
    z.looseObject({
        [GROUPS_META_KEY]: z.array(z.string()).optional()
    })
);

/**
 * Schema for a Group — a named collection of MCP primitives.
 */
export const GroupSchema = z.object({
    ...BaseMetadataSchema.shape,
    ...IconsSchema.shape,
    description: z.string().optional(),
    annotations: AnnotationsSchema.optional(),
    _meta: GroupMetaSchema
});

/**
 * Schema for groups/list request (paginated).
 */
export const ListGroupsRequestSchema = PaginatedRequestSchema.extend({
    method: z.literal('groups/list')
});

/**
 * Schema for groups/list response.
 */
export const ListGroupsResultSchema = PaginatedResultSchema.extend({
    groups: z.array(GroupSchema)
});

/**
 * Schema for notifications/groups/list_changed.
 */
export const GroupListChangedNotificationSchema = NotificationSchema.extend({
    method: z.literal('notifications/groups/list_changed')
});

// Type aliases
export type GroupMeta = z.infer<typeof GroupMetaSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type ListGroupsRequest = z.infer<typeof ListGroupsRequestSchema>;
export type ListGroupsResult = z.infer<typeof ListGroupsResultSchema>;
export type GroupListChangedNotification = z.infer<typeof GroupListChangedNotificationSchema>;
