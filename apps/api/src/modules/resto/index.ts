/** POS Resto module (Fase 2-4): table management + order flow + kitchen display.
 * Registered as ONE plugin so app.ts stays clean; each concern keeps its own
 * routes file (tables / orders / kitchen) for easy onboarding of new developers. */
import Elysia from 'elysia';
import { tableRoutes } from './routes/tables.routes';
import { orderRoutes } from './routes/orders.routes';
import { kitchenRoutes } from './routes/kitchen.routes';

export const restoRoutes = new Elysia({ name: 'resto' }).use(tableRoutes).use(orderRoutes).use(kitchenRoutes);
