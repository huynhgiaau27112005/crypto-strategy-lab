// Shared by every queue-facing call that must not hang an HTTP request
// forever. QueueModule's Redis connection uses maxRetriesPerRequest: null
// (a BullMQ Worker requirement), which means an ioredis command issued
// while Redis is unreachable never rejects on its own — it just sits in
// the offline command queue waiting for a reconnect. Racing against a
// short timeout turns "Redis is down" into a fast, explicit failure
// instead of a request that never resolves.
export function withTimeout<T>(promise: Promise<T>, ms = 2000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Queue operation timed out after ${ms}ms (is Redis reachable?)`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
