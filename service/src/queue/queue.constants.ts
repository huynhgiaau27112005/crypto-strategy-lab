// Queue names shared between the API (producer) and the worker (consumer).
// One place owns these strings so a typo can't silently create a second,
// disconnected queue.
export const SEARCH_QUEUE = 'search';
export const NEWS_CRAWL_QUEUE = 'news-crawl';
export const AI_GENERATE_QUEUE = 'ai-generate';
