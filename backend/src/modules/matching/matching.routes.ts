import { Router } from 'express';

export const matchingRouter = Router();

matchingRouter.post('/queue', (_req, res) => {
  res.status(501).json({ message: 'TODO: 매칭 대기열 입장 구현' });
});

matchingRouter.delete('/queue', (_req, res) => {
  res.status(501).json({ message: 'TODO: 매칭 대기열 이탈 구현' });
});

matchingRouter.get('/status', (_req, res) => {
  res.status(501).json({ message: 'TODO: 매칭 상태 조회 구현' });
});

matchingRouter.post('/:matchId/exchange', (_req, res) => {
  res.status(501).json({ message: 'TODO: 왁뿌볼 교환 확정 구현' });
});
