import cors from 'cors';
import express from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { collectionRouter } from './modules/collection/collection.routes.js';
import { matchingRouter } from './modules/matching/matching.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { wakppuballsRouter } from './modules/wakppuballs/wakppuballs.routes.js';

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

  return app;
}
