import type { ErrorRequestHandler } from 'express';
import multer from 'multer';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'USERNAME_ALREADY_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'MAIN_WAKPPUBALL_REQUIRED'
  | 'NO_BREAK_COUNT_LEFT'
  | 'OWNED_WAKPPUBALL_NOT_FOUND'
  | 'ALREADY_IN_QUEUE'
  | 'WAKPPUBALL_CONSUMED'
  | 'INVALID_IMAGE_FILE'
  | 'FILE_TOO_LARGE';

export class ApiError extends Error {
  statusCode: number;
  code: ErrorCode;

  constructor(statusCode: number, code: ErrorCode, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message
      }
    });
  }

  // multer rejects (e.g. LIMIT_FILE_SIZE) reach here as MulterErrors. Normalize
  // them into the common 400 shape so every upload route gets consistent
  // handling without its own inline error-translation middleware.
  if (err instanceof multer.MulterError) {
    const isTooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(400).json({
      error: {
        code: isTooLarge ? 'FILE_TOO_LARGE' : 'INVALID_IMAGE_FILE',
        message: isTooLarge ? '업로드할 수 있는 파일 크기를 초과했습니다.' : '파일 업로드에 실패했습니다.'
      }
    });
  }

  console.error(err);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다.'
    }
  });
};
