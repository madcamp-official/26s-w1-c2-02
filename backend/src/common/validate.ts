import type { Request } from 'express';
import type { ZodSchema } from 'zod';
import { ApiError } from './api-error.js';

export function validateBody<T>(schema: ZodSchema<T>, req: Request): T {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '요청값이 올바르지 않습니다.');
  }

  return result.data;
}
