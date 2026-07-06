import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../shared/api/http';
import { useAuth } from '../../shared/auth/AuthContext';
import { validatePassword, validateUsername } from '../../shared/validation/credentials';
import { login, signup } from './authApi';

type Mode = 'login' | 'signup';

// The server only returns a generic VALIDATION_ERROR, so friendly copy lives here.
function messageForError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return '아이디 또는 비밀번호가 올바르지 않습니다.';
      case 'USERNAME_ALREADY_EXISTS':
        return '이미 사용 중인 유저네임입니다.';
      case 'VALIDATION_ERROR':
        return '입력값을 다시 확인해 주세요.';
      default:
        return error.message;
    }
  }
  return '요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirect back to where the guard sent us from, else the main screen.
  const redirectTo = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    if (usernameError || passwordError) {
      setFieldErrors({ username: usernameError ?? undefined, password: passwordError ?? undefined });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      const request = mode === 'login' ? login : signup;
      const { accessToken, user } = await request({ username, password });
      signIn(accessToken, user);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFormError(messageForError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page">
      <h1>{mode === 'login' ? '로그인' : '회원가입'}</h1>

      <form className="panel" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="username">유저네임</label>
          <input
            id="username"
            name="username"
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
          {fieldErrors.username && <p role="alert">{fieldErrors.username}</p>}
        </div>

        <div>
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
          {fieldErrors.password && <p role="alert">{fieldErrors.password}</p>}
        </div>

        {formError && <p role="alert">{formError}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}
        </button>
      </form>

      <p>
        {mode === 'login' ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
        <button type="button" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? '회원가입' : '로그인'}
        </button>
      </p>
    </section>
  );
}
