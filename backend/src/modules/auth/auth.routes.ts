import { Router } from 'express';

export const authRouter = Router();

authRouter.post('/signup', (_req, res) => {
  res.status(501).json({ message: 'TODO: 회원가입 구현' });
});

authRouter.post('/login', (_req, res) => {
  res.status(501).json({ message: 'TODO: 로그인 구현' });
});

authRouter.post('/logout', (_req, res) => {
  res.status(501).json({ message: 'TODO: 로그아웃 구현' });
});
