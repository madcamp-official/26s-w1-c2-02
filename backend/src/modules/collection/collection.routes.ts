import { Router } from 'express';

export const collectionRouter = Router();

collectionRouter.get('/', (_req, res) => {
  res.status(501).json({ message: 'TODO: 컬렉션 목록 조회 구현' });
});

collectionRouter.post('/:ownedId/select-main', (_req, res) => {
  res.status(501).json({ message: 'TODO: 대표 왁뿌볼 선택 구현' });
});
