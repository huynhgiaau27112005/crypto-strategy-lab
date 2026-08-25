import { HealthService } from './health.service';

function makeDatabase(isHealthy: () => Promise<boolean>) {
  return { isHealthy } as any;
}

function makeCache(ping: () => Promise<void>) {
  return { ping } as any;
}

describe('HealthService', () => {
  it('liveness never touches a dependency and always reports ok', () => {
    const service = new HealthService(
      makeDatabase(() => Promise.reject(new Error('should never be called'))),
      makeCache(() => Promise.reject(new Error('should never be called'))),
    );
    const result = service.liveness();
    expect(result.status).toBe('ok');
    expect(typeof result.uptimeSeconds).toBe('number');
  });

  it('readiness is ok when both Postgres and Redis are reachable', async () => {
    const service = new HealthService(
      makeDatabase(() => Promise.resolve(true)),
      makeCache(() => Promise.resolve()),
    );
    const result = await service.readiness();
    expect(result.status).toBe('ok');
    expect(result.checks.postgres.status).toBe('ok');
    expect(result.checks.redis.status).toBe('ok');
  });

  it('readiness fails when Redis is unreachable, even though Postgres is fine', async () => {
    const service = new HealthService(
      makeDatabase(() => Promise.resolve(true)),
      makeCache(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    const result = await service.readiness();
    expect(result.status).toBe('error');
    expect(result.checks.postgres.status).toBe('ok');
    expect(result.checks.redis.status).toBe('error');
  });

  it('readiness fails when Postgres is unreachable, even though Redis is fine', async () => {
    const service = new HealthService(
      makeDatabase(() => Promise.resolve(false)),
      makeCache(() => Promise.resolve()),
    );
    const result = await service.readiness();
    expect(result.status).toBe('error');
    expect(result.checks.postgres.status).toBe('error');
  });
});
