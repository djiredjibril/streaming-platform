import * as grpc from '@grpc/grpc-js';
import { describe, expect, it, vi } from 'vitest';
import { buildGatewayServer } from '../../src/http/server.js';
import type { IdentityServiceClient, AuthResponse, RegisterRequest } from '../../src/grpc/generated/identity.js';
import { logger } from '../../src/infra/logger.js';

function fakeIdentityClient(
  handler: (request: RegisterRequest) => { error?: grpc.ServiceError; response?: AuthResponse },
): IdentityServiceClient {
  return {
    register: (request: RegisterRequest, callback: (error: grpc.ServiceError | null, response?: AuthResponse) => void) => {
      const { error, response } = handler(request);
      callback(error ?? null, response);
    },
  } as unknown as IdentityServiceClient;
}

function serviceError(code: grpc.status, message: string): grpc.ServiceError {
  return Object.assign(new Error(message), { code, details: message, metadata: new grpc.Metadata() });
}

describe('POST /auth/register', () => {
  it('returns 400 without calling Identity when the body is malformed', async () => {
    const register = vi.fn();
    const app = buildGatewayServer({
      identityClient: { register } as unknown as IdentityServiceClient,
      logger,
    });

    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com' } });

    expect(res.statusCode).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });

  it('returns 200 with the account payload on success', async () => {
    const identityClient = fakeIdentityClient(() => ({
      response: {
        accessToken: '',
        refreshToken: '',
        expiresIn: 0,
        account: { id: 'acc_1', email: 'jane@example.com', accountType: 1, status: 'PENDING_VERIFICATION' },
      },
    }));
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      accessToken: '',
      refreshToken: '',
      account: { id: 'acc_1', status: 'PENDING_VERIFICATION' },
    });
  });

  it('maps ALREADY_EXISTS to 409', async () => {
    const identityClient = fakeIdentityClient(() => ({
      error: serviceError(grpc.status.ALREADY_EXISTS, 'An account with this email already exists'),
    }));
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('maps INVALID_ARGUMENT to 400', async () => {
    const identityClient = fakeIdentityClient(() => ({
      error: serviceError(grpc.status.INVALID_ARGUMENT, 'universityEmail is required'),
    }));
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'jane@example.com', password: 'correct-horse', accountType: 'ETUDIANT' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('maps any other gRPC error to 500 with a generic message', async () => {
    const identityClient = fakeIdentityClient(() => ({
      error: serviceError(grpc.status.UNAVAILABLE, 'connection refused'),
    }));
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal error' });
  });
});
