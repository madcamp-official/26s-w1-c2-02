import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './modules/auth/auth.routes.js';
import { collectionRouter } from './modules/collection/collection.routes.js';
import { matchingRouter } from './modules/matching/matching.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { wakppuballsRouter } from './modules/wakppuballs/wakppuballs.routes.js';
import { errorHandler } from './common/api-error.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const frontendDistPath = join(currentDir, '../../frontend/dist');
const frontendIndexPath = join(frontendDistPath, 'index.html');

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/wakppuballs', wakppuballsRouter);
  app.use('/api/collection', collectionRouter);
  app.use('/api/matching', matchingRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'API 경로를 찾을 수 없습니다.'
      }
    });
  });

  if (existsSync(frontendIndexPath)) {
    app.use(express.static(frontendDistPath));
    app.get('*', (_req, res) => {
      res.sendFile(frontendIndexPath);
    });
  }

  app.use(errorHandler);

  return app;
}
