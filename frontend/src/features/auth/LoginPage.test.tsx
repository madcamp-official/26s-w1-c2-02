import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../shared/api/http';
import { renderWithRouter } from '../../test/renderWithRouter';
import { LoginPage } from './LoginPage';
import * as authApi from './authApi';

const { signInSpy } = vi.hoisted(() => ({ signInSpy: vi.fn() }));

vi.mock('./authApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./authApi')>();
  return { ...actual, login: vi.fn(), signup: vi.fn() };
});
// Keep credential validation real; only stub the auth context.
vi.mock('../../shared/auth/AuthContext', () => ({
  useAuth: () => ({ status: 'unauthenticated', user: null, signIn: signInSpy, signOut: vi.fn() })
}));

const login = vi.mocked(authApi.login);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage — validation and submit', () => {
  it('client validation: too-short username blocks the request and shows a field error', async () => {
    renderWithRouter(<LoginPage />);
    await userEvent.type(screen.getByLabelText('유저네임'), 'a');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText(/유저네임은 2~20자여야 합니다/)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('invalid credentials: 401 maps to a friendly message', async () => {
    login.mockRejectedValue(new ApiError('INVALID_CREDENTIALS', '유저네임 또는 비밀번호가 일치하지 않습니다.'));
    renderWithRouter(<LoginPage />);
    await userEvent.type(screen.getByLabelText('유저네임'), 'dohyun');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText('아이디 또는 비밀번호가 올바르지 않습니다.')).toBeInTheDocument();
  });

  it('success: valid login calls signIn with the token and user', async () => {
    login.mockResolvedValue({ user: { id: '1', username: 'dohyun' }, accessToken: 'mock-access-token-1' });
    renderWithRouter(<LoginPage />);
    await userEvent.type(screen.getByLabelText('유저네임'), 'dohyun');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    await vi.waitFor(() => {
      expect(signInSpy).toHaveBeenCalledWith('mock-access-token-1', { id: '1', username: 'dohyun' });
    });
  });
});
