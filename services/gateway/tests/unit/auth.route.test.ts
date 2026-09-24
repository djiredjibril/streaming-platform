import * as grpc from '@grpc/grpc-js';
import { describe, expect, it, vi } from 'vitest';
import { buildGatewayServer } from '../../src/http/server.js';
import type { IdentityServiceClient } from '../../src/grpc/generated/identity.js';
import { logger } from '../../src/infra/logger.js';

type MethodName =
  | 'register'
  | 'verifyEmail'
  | 'login'
  | 'refreshToken'
  | 'logout'
  | 'validateToken'
  | 'getAccount'
  | 'createProfile'
  | 'listProfiles';
type MethodResult = { error?: grpc.ServiceError; response?: unknown };

/** Fake IdentityServiceClient covering whichever methods a test needs; every real call is `method(request, metadata, callback)` since routes go through callUnary(). */
function fakeIdentityClient(
  methods: Partial<Record<MethodName, (request: unknown) => MethodResult>>,
): IdentityServiceClient {
  const client: Record<string, unknown> = {};
  for (const [name, handler] of Object.entries(methods)) {
    client[name] = (
      request: unknown,
      _metadata: grpc.Metadata,
      callback: (error: grpc.ServiceError | null, response?: unknown) => void,
    ) => {
      const { error, response } = handler(request);
      callback(error ?? null, response);
    };
  }
  return client as unknown as IdentityServiceClient;
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
    const identityClient = fakeIdentityClient({
      register: () => ({
        response: {
          accessToken: '',
          refreshToken: '',
          expiresIn: 0,
          emailVerificationToken: 'a'.repeat(64),
          account: { id: 'acc_1', email: 'jane@example.com', accountType: 1, status: 'PENDING_VERIFICATION' },
        },
      }),
    });
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
    const identityClient = fakeIdentityClient({
      register: () => ({ error: serviceError(grpc.status.ALREADY_EXISTS, 'An account with this email already exists') }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('maps INVALID_ARGUMENT to 400', async () => {
    const identityClient = fakeIdentityClient({
      register: () => ({ error: serviceError(grpc.status.INVALID_ARGUMENT, 'universityEmail is required') }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'jane@example.com', password: 'correct-horse', accountType: 'ETUDIANT' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('maps any other gRPC error to 500 with a generic message', async () => {
    const identityClient = fakeIdentityClient({
      register: () => ({ error: serviceError(grpc.status.UNAVAILABLE, 'connection refused') }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal error' });
  });

  it('maps RESOURCE_EXHAUSTED (rate limited) to 429', async () => {
    const identityClient = fakeIdentityClient({
      register: () => ({ error: serviceError(grpc.status.RESOURCE_EXHAUSTED, 'Too many attempts; retry in 3600 seconds') }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
    });

    expect(res.statusCode).toBe(429);
  });
});

describe('POST /auth/verify-email', () => {
  it('returns the activated account', async () => {
    const identityClient = fakeIdentityClient({
      verifyEmail: () => ({
        response: {
          accessToken: '',
          refreshToken: '',
          expiresIn: 0,
          account: { id: 'acc_1', email: 'jane@example.com', accountType: 1, status: 'ACTIVE' },
        },
      }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: 'abc' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ account: { status: 'ACTIVE' } });
  });

  it('maps INVALID_ARGUMENT (unknown/expired token) to 400', async () => {
    const identityClient = fakeIdentityClient({
      verifyEmail: () => ({ error: serviceError(grpc.status.INVALID_ARGUMENT, 'Invalid or expired token') }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: 'bad' } });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /auth/login', () => {
  it('sets an httpOnly refresh token cookie and never puts the refresh token in the JSON body', async () => {
    const identityClient = fakeIdentityClient({
      login: () => ({
        response: {
          accessToken: 'access-123',
          refreshToken: 'refresh-456',
          expiresIn: 900,
          account: { id: 'acc_1', email: 'jane@example.com', accountType: 1, status: 'ACTIVE' },
        },
      }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'jane@example.com', password: 'correct-horse' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      accessToken: 'access-123',
      expiresIn: 900,
      account: { id: 'acc_1', email: 'jane@example.com', accountType: 1, status: 'ACTIVE' },
    });
    const cookie = res.cookies.find((c) => c.name === 'refresh_token');
    expect(cookie).toMatchObject({ value: 'refresh-456', httpOnly: true, path: '/auth' });
  });

  it('maps UNAUTHENTICATED (wrong credentials) to 401', async () => {
    const identityClient = fakeIdentityClient({
      login: () => ({ error: serviceError(grpc.status.UNAUTHENTICATED, 'Invalid email or password') }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'jane@example.com', password: 'wrong' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('maps FAILED_PRECONDITION (not verified) to 403', async () => {
    const identityClient = fakeIdentityClient({
      login: () => ({ error: serviceError(grpc.status.FAILED_PRECONDITION, 'Account is not verified yet') }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'jane@example.com', password: 'correct-horse' },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('POST /auth/refresh', () => {
  it('returns 401 when there is no refresh token cookie', async () => {
    const app = buildGatewayServer({ identityClient: {} as IdentityServiceClient, logger });

    const res = await app.inject({ method: 'POST', url: '/auth/refresh' });

    expect(res.statusCode).toBe(401);
  });

  it('rotates the cookie on success', async () => {
    const identityClient = fakeIdentityClient({
      refreshToken: () => ({
        response: {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresIn: 900,
          account: { id: 'acc_1', email: 'jane@example.com', accountType: 1, status: 'ACTIVE' },
        },
      }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refresh_token: 'old-refresh' },
    });

    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === 'refresh_token');
    expect(cookie?.value).toBe('new-refresh');
  });

  it('clears the cookie and maps UNAUTHENTICATED to 401 on reuse of a revoked token', async () => {
    const identityClient = fakeIdentityClient({
      refreshToken: () => ({
        error: serviceError(grpc.status.UNAUTHENTICATED, 'Refresh token reuse detected'),
      }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refresh_token: 'stolen-token' },
    });

    expect(res.statusCode).toBe(401);
    const cookie = res.cookies.find((c) => c.name === 'refresh_token');
    expect(cookie?.value).toBe('');
  });
});

describe('POST /auth/logout', () => {
  it('clears the cookie and returns 204 when a token was present', async () => {
    const logout = vi.fn(() => ({ response: { success: true } }));
    const identityClient = fakeIdentityClient({ logout });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { refresh_token: 'abc' } });

    expect(res.statusCode).toBe(204);
    expect(logout).toHaveBeenCalledOnce();
  });

  it('returns 204 without calling Identity when there is no cookie', async () => {
    const logout = vi.fn();
    const identityClient = { logout } as unknown as IdentityServiceClient;
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({ method: 'POST', url: '/auth/logout' });

    expect(res.statusCode).toBe(204);
    expect(logout).not.toHaveBeenCalled();
  });
});

describe('GET /auth/me', () => {
  it('returns 401 without a bearer token', async () => {
    const app = buildGatewayServer({ identityClient: {} as IdentityServiceClient, logger });

    const res = await app.inject({ method: 'GET', url: '/auth/me' });

    expect(res.statusCode).toBe(401);
  });

  it('returns the account for a valid token', async () => {
    const identityClient = fakeIdentityClient({
      validateToken: () => ({ response: { valid: true, accountId: 'acc_1' } }),
      getAccount: () => ({
        response: { id: 'acc_1', email: 'jane@example.com', accountType: 1, status: 'ACTIVE' },
      }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: 'Bearer good-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 'acc_1', email: 'jane@example.com' });
  });

  it('returns 401 for an invalid token without calling getAccount', async () => {
    const getAccount = vi.fn();
    const identityClient = fakeIdentityClient({
      validateToken: () => ({ response: { valid: false, accountId: '' } }),
      getAccount,
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: 'Bearer bad-token' } });

    expect(res.statusCode).toBe(401);
    expect(getAccount).not.toHaveBeenCalled();
  });
});

describe('POST /auth/profiles', () => {
  it('returns 401 without a bearer token, without calling createProfile', async () => {
    const createProfile = vi.fn();
    const identityClient = { createProfile } as unknown as IdentityServiceClient;
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/profiles',
      payload: { displayName: 'Jane', isKidsProfile: false },
    });

    expect(res.statusCode).toBe(401);
    expect(createProfile).not.toHaveBeenCalled();
  });

  it('creates a profile for the token-derived account, never trusting an accountId from the body', async () => {
    const createProfile = vi.fn((request: { accountId: string; displayName: string; isKidsProfile: boolean }) => ({
      response: { id: 'prof_1', accountId: request.accountId, displayName: request.displayName, isKidsProfile: request.isKidsProfile },
    }));
    const identityClient = fakeIdentityClient({
      validateToken: () => ({ response: { valid: true, accountId: 'acc_1' } }),
      createProfile,
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/profiles',
      headers: { authorization: 'Bearer good-token' },
      // Deliberately injects a different accountId in the body — must be ignored.
      payload: { accountId: 'someone-elses-account', displayName: 'Jane', isKidsProfile: false },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accountId: 'acc_1', displayName: 'Jane' });
    expect(createProfile).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc_1' }),
    );
  });

  it('maps FAILED_PRECONDITION (profile limit exceeded) to 403', async () => {
    const identityClient = fakeIdentityClient({
      validateToken: () => ({ response: { valid: true, accountId: 'acc_1' } }),
      createProfile: () => ({ error: serviceError(grpc.status.FAILED_PRECONDITION, 'This account type is limited to one profile') }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/profiles',
      headers: { authorization: 'Bearer good-token' },
      payload: { displayName: 'Jane', isKidsProfile: false },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for an empty displayName', async () => {
    const identityClient = fakeIdentityClient({
      validateToken: () => ({ response: { valid: true, accountId: 'acc_1' } }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/profiles',
      headers: { authorization: 'Bearer good-token' },
      payload: { displayName: '', isKidsProfile: false },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /auth/profiles', () => {
  it('returns 401 without a bearer token', async () => {
    const app = buildGatewayServer({ identityClient: {} as IdentityServiceClient, logger });

    const res = await app.inject({ method: 'GET', url: '/auth/profiles' });

    expect(res.statusCode).toBe(401);
  });

  it('returns the profiles for the token-derived account', async () => {
    const identityClient = fakeIdentityClient({
      validateToken: () => ({ response: { valid: true, accountId: 'acc_1' } }),
      listProfiles: () => ({
        response: { profiles: [{ id: 'prof_1', accountId: 'acc_1', displayName: 'Jane', isKidsProfile: false }] },
      }),
    });
    const app = buildGatewayServer({ identityClient, logger });

    const res = await app.inject({ method: 'GET', url: '/auth/profiles', headers: { authorization: 'Bearer good-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ id: 'prof_1', accountId: 'acc_1', displayName: 'Jane', isKidsProfile: false }]);
  });
});
