import { Router } from 'express';

export const wakppuballsRouter = Router();

wakppuballsRouter.get('/me/main', (_req, res) => {
  res.status(501).json({ message: 'TODO: 대표 왁뿌볼 조회 구현' });
});

wakppuballsRouter.post('/', (_req, res) => {
  res.status(501).json({ message: 'TODO: 왁뿌볼 생성/저장 구현' });
});

wakppuballsRouter.post('/:ownedId/break', (_req, res) => {
  res.status(501).json({ message: 'TODO: 왁뿌볼 뿌시기 카운트 차감 구현' });
});

wakppuballsRouter.post('/me/main/session-end', (_req, res) => {
  res.status(501).json({ message: 'TODO: 대표 왁뿌볼 상호작용 종료 처리 구현' });
});
