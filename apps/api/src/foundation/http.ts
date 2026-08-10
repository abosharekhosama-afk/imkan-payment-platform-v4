import type {FastifyReply, FastifyRequest} from 'fastify';

export type AuthContext = {
  userId: string;
  email: string;
  organizationId: string | null;
  permissions: string[];
  roles: string[];
  sessionId: string;
  /** Present when authenticated via hashed API key (Phase 5). */
  apiKeyId?: string;
  authKind?: 'session' | 'api_key';
  apiKeyEnvironment?: 'SANDBOX' | 'LIVE';
};

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export function ok<T>(request: FastifyRequest, data: T, meta?: Record<string, unknown>) {
  return {
    data,
    meta: {
      request_id: request.id,
      ...meta,
    },
  };
}

export function created<T>(reply: FastifyReply, request: FastifyRequest, data: T) {
  return reply.code(201).send(ok(request, data));
}

export function parsePaging(query: unknown): {limit: number; offset: number} {
  const q = (query || {}) as Record<string, unknown>;
  const limit = Math.min(Math.max(Number(q.limit || 20), 1), 100);
  const offset = Math.max(Number(q.offset || 0), 0);
  return {limit, offset};
}
