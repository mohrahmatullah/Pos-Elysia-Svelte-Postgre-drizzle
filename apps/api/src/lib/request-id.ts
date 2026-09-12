/** Request ID + structured request logging (PRD 31) as an Elysia plugin. */
import Elysia from 'elysia';

export const requestLogger = new Elysia({ name: 'request-logger' })
  .derive({ as: 'global' }, ({ request }) => {
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
    return { requestId, startedAt: performance.now() };
  })
  .onAfterHandle({ as: 'global' }, ({ request, requestId, startedAt, set }) => {
    const path = new URL(request.url).pathname;
    if (path === '/health') return;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        request_id: requestId,
        method: request.method,
        path,
        status: set.status ?? 200,
        duration_ms: Math.round(performance.now() - startedAt),
      }),
    );
  });
