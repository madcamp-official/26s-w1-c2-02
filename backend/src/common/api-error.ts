import type { ErrorRequestHandler } from 'express';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'USERNAME_ALREADY_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'LOCATION_REQUIRED'
  | 'OUTSIDE_CAMPUS_AREA'
  | 'MAIN_WAKPPUBALL_REQUIRED'
  | 'NO_BREAK_COUNT_LEFT'
  | 'OWNED_WAKPPUBALL_NOT_FOUND'
  | 'ALREADY_IN_QUEUE'
  | 'WAKPPUBALL_CONSUMED';

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

  console.error(err);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다.'
    }
  });
};
