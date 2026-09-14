/** Elysia app assembly (PRD 16, 18). */
import Elysia from 'elysia';
import cors from '@elysiajs/cors';
import { authRoutes } from './modules/auth/routes';
import { userRoutes } from './modules/users/routes';
import { categoryRoutes } from './modules/categories/routes';
import { productRoutes } from './modules/products/routes';
import { customerRoutes } from './modules/customers/routes';
import { inventoryRoutes } from './modules/inventory/routes';
import { saleRoutes } from './modules/sales/routes';
import { reportRoutes } from './modules/reports/routes';
import { settingsRoutes } from './modules/settings/routes';
import { auditRoutes } from './modules/audit/routes';
import { permissionRoutes } from './modules/permissions/routes';
import { roleRoutes } from './modules/roles/routes';
import { menuRoutes } from './modules/menus/routes';
import { storeRoutes } from './modules/stores/routes';
import { auth as authPlugin } from './middleware/auth';
import { requestLogger } from './lib/request-id';
import { config } from './config';
import { handleRouteError } from './lib/response';

const api = new Elysia({ prefix: '/api/v1' })
  .use(authPlugin)
  .use(authRoutes)
  .use(userRoutes)
  .use(categoryRoutes)
  .use(productRoutes)
  .use(customerRoutes)
  .use(inventoryRoutes)
  .use(saleRoutes)
  .use(reportRoutes)
  .use(settingsRoutes)
  .use(auditRoutes)
  .use(permissionRoutes)
  .use(roleRoutes)
  .use(menuRoutes)
  .use(storeRoutes);

export const app = new Elysia()
  .use(requestLogger)
  .use(cors({ origin: config.corsOrigin.split(','), credentials: true }))
  .onError(({ code, error, set }) => {
    // Map Elysia schema-validation failures to VALIDATION_ERROR (PRD 20)
    if (code === 'VALIDATION') {
      let detail = 'Validation failed';
      try {
        const parsed = JSON.parse(error.message) as { summary?: string };
        if (parsed.summary) detail = parsed.summary;
      } catch {
        /* keep default */
      }
      set.status = 400;
      return new Response(
        JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: detail } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    const resp = handleRouteError(error);
    set.status = resp.status;
    return resp;
  })
  .get('/health', () => ({ status: 'ok', time: new Date().toISOString() }))
  .use(api);

export type App = typeof app;
