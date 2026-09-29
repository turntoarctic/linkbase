import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppDeps, AppState } from './types';
import { errorHandler, notFoundHandler } from './middleware/error';
import { requestLogger } from './middleware/request-log';
import { staticHandler } from './middleware/static';
import { rateLimit } from './middleware/rate-limit';
import { authRoutes } from './routes/auth';
import { usersRoutes } from './routes/users';
import { workspaceRoutes } from './routes/workspaces';
import { pageRoutes } from './routes/pages';
import { docRoutes } from './routes/doc';
import { blobRoutes } from './routes/blobs';
import { tagRoutes } from './routes/tags';
import { searchRoutes } from './routes/search';
import { healthRoutes } from './routes/health';

/**
 * Hono 实例组装（07 §2）：中间件按序 + 全部路由。
 * deps 显式注入（无 DI 容器），测试用 createApp(deps) 直接构造。
 */
export function createApp(deps: AppDeps): Hono<AppState> {
  const app = new Hono<AppState>();

  app.onError(errorHandler(deps));
  app.notFound(notFoundHandler);

  app.use(requestLogger(deps));
  app.use(secureHeaders());
  // MVP 同源部署：CORS 白名单 = 同源 + FRONTEND_URL（07 §3），先不开
  app.use('*', staticHandler(deps));

  if (deps.env.rateLimitEnabled) {
    app.use('/api/*', rateLimit(deps, { name: 'global', limit: 100, windowSeconds: 15 * 60 }));
  }

  app.route('/api', healthRoutes(deps));
  app.route('/api/auth', authRoutes(deps));
  app.route('/api/users', usersRoutes(deps));
  app.route('/api/workspaces', workspaceRoutes(deps));
  app.route('/api/workspaces', pageRoutes(deps));
  app.route('/api/workspaces', docRoutes(deps));
  app.route('/api', blobRoutes(deps));
  app.route('/api/workspaces', tagRoutes(deps));
  app.route('/api/workspaces', searchRoutes(deps));

  return app;
}
