export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function unauthorized(message = 'Authentication required', code = 'AUTHENTICATION_REQUIRED') {
  return new AppError(code, message, 401);
}

export function forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
  return new AppError(code, message, 403);
}

export function notFound(message = 'Not found', code = 'NOT_FOUND') {
  return new AppError(code, message, 404);
}

export function conflict(message: string, code = 'CONFLICT') {
  return new AppError(code, message, 409);
}
