// Mirrors the backend zod rules (backend/src/modules/auth/auth.routes.ts).
// The server only returns a generic VALIDATION_ERROR, so these rules exist so the
// frontend can show per-field guidance before submitting the form.

export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const USERNAME_MIN = 2;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

// Per-field message helpers (frontend owns this copy — the server does not send it).
export function validateUsername(username: string): string | null {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return `유저네임은 ${USERNAME_MIN}~${USERNAME_MAX}자여야 합니다.`;
  }
  if (!USERNAME_REGEX.test(username)) {
    return '유저네임은 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자여야 합니다.`;
  }
  return null;
}

// Boolean gate that matches the server's zod schema.
export function isValidCredential(username: string, password: string): boolean {
  return validateUsername(username) === null && validatePassword(password) === null;
}
