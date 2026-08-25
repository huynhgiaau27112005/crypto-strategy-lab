// Injection token for the raw ioredis client. Only CacheService is allowed
// to depend on this token — every other module talks to Redis through
// CacheService, never through this client directly (task-17 requirement:
// one place owns cache access).
export const REDIS_CLIENT = 'REDIS_CLIENT';
