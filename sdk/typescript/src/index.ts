export {
    GROUPS_META_KEY,
    GROUPING_EXTENSION_ID,
    GroupMetaSchema,
    GroupSchema,
    ListGroupsRequestSchema,
    ListGroupsResultSchema,
    GroupListChangedNotificationSchema,
    type GroupMeta,
    type Group,
    type ListGroupsRequest,
    type ListGroupsResult,
    type GroupListChangedNotification
} from './types.js';

export { GroupingExtension, type GroupConfig, type RegisteredGroup } from './server.js';

export { GroupingClient } from './client.js';
