import { Router } from 'express';

export const wakppuballsRouter = Router();

wakppuballsRouter.get('/me/main', (_req, res) => {
  res.status(501).json({ message: 'TODO: 대표 왁뿌볼 조회 구현' });
});

wakppuballsRouter.post('/', (_req, res) => {
  res.status(501).json({ message: 'TODO: 왁뿌볼 생성/저장 구현' });
});

wakppuballsRouter.patch('/:ownedId/state', (_req, res) => {
  res.status(501).json({ message: 'TODO: 왁뿌볼 인터랙션 상태 저장 구현' });
});
