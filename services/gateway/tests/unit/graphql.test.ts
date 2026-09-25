import * as grpc from '@grpc/grpc-js';
import { describe, expect, it, vi } from 'vitest';
import { buildGatewayServer } from '../../src/http/server.js';
import type { CatalogServiceClient } from '../../src/grpc/generated/catalog.js';
import type { IdentityServiceClient } from '../../src/grpc/generated/identity.js';
import { logger } from '../../src/infra/logger.js';

type MethodResult = { error?: grpc.ServiceError; response?: unknown };

/** Same shape as auth.route.test.ts's fakeIdentityClient, generalized for any gRPC client. */
function fakeClient<T>(methods: Partial<Record<keyof T, (request: unknown) => MethodResult>>): T {
  const client: Record<string, unknown> = {};
  for (const [name, handler] of Object.entries(methods)) {
    client[name] = (
      request: unknown,
      _metadata: grpc.Metadata,
      callback: (error: grpc.ServiceError | null, response?: unknown) => void,
    ) => {
      const { error, response } = (handler as (request: unknown) => MethodResult)(request);
      callback(error ?? null, response);
    };
  }
  return client as T;
}

function serviceError(code: grpc.status, message: string): grpc.ServiceError {
  return Object.assign(new Error(message), { code, details: message, metadata: new grpc.Metadata() });
}

async function graphqlRequest(
  app: ReturnType<typeof buildGatewayServer>,
  query: string,
  variables?: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json', ...headers },
    payload: { query, variables },
  });
  return res.json();
}

const protoTitle = {
  id: 'title_1',
  slug: 'the-matrix-1999',
  type: 1, // TitleType.MOVIE
  originalTitle: 'The Matrix',
  synopsis: 'A hacker discovers reality is a simulation.',
  releaseYear: 1999,
  rating: 4, // ContentRating.R
  runtimeMinutes: 136,
  status: 2, // TitleStatus.PUBLISHED
  mediaAssetStatus: 3, // MediaAssetStatus.READY
  mediaAssetUrl: 'https://example.com/matrix.mp4',
  genres: ['Action', 'Sci-Fi'],
};

describe('Query.title', () => {
  it('returns the title for a published slug', async () => {
    const catalogClient = fakeClient<CatalogServiceClient>({
      getTitleBySlug: () => ({ response: protoTitle }),
    });
    const app = buildGatewayServer({
      identityClient: {} as IdentityServiceClient,
      catalogClient,
      logger,
    });

    const body = await graphqlRequest(app, 'query($slug: String!) { title(slug: $slug) { originalTitle rating } }', {
      slug: 'the-matrix-1999',
    });

    expect(body.errors).toBeUndefined();
    expect(body.data.title).toEqual({ originalTitle: 'The Matrix', rating: 'R' });
  });

  it('derives isPlayable/videoUrl from the media asset status', async () => {
    const catalogClient = fakeClient<CatalogServiceClient>({
      getTitleBySlug: () => ({ response: protoTitle }),
    });
    const app = buildGatewayServer({ identityClient: {} as IdentityServiceClient, catalogClient, logger });

    const body = await graphqlRequest(app, 'query($slug: String!) { title(slug: $slug) { isPlayable videoUrl } }', {
      slug: 'the-matrix-1999',
    });

    expect(body.data.title).toEqual({ isPlayable: true, videoUrl: 'https://example.com/matrix.mp4' });
  });

  it('isPlayable is false and videoUrl is null when no media asset has been attached yet', async () => {
    const catalogClient = fakeClient<CatalogServiceClient>({
      getTitleBySlug: () => ({
        response: { ...protoTitle, mediaAssetStatus: 0 /* MEDIA_ASSET_STATUS_UNSPECIFIED */, mediaAssetUrl: undefined },
      }),
    });
    const app = buildGatewayServer({ identityClient: {} as IdentityServiceClient, catalogClient, logger });

    const body = await graphqlRequest(app, 'query($slug: String!) { title(slug: $slug) { isPlayable videoUrl } }', {
      slug: 'the-matrix-1999',
    });

    expect(body.data.title).toEqual({ isPlayable: false, videoUrl: null });
  });

  it('returns tagged genre names', async () => {
    const catalogClient = fakeClient<CatalogServiceClient>({
      getTitleBySlug: () => ({ response: protoTitle }),
    });
    const app = buildGatewayServer({ identityClient: {} as IdentityServiceClient, catalogClient, logger });

    const body = await graphqlRequest(app, 'query($slug: String!) { title(slug: $slug) { genres } }', {
      slug: 'the-matrix-1999',
    });

    expect(body.data.title).toEqual({ genres: ['Action', 'Sci-Fi'] });
  });

  it('returns null (not an error) for NOT_FOUND — an unpublished or unknown slug', async () => {
    const catalogClient = fakeClient<CatalogServiceClient>({
      getTitleBySlug: () => ({ error: serviceError(grpc.status.NOT_FOUND, 'Title not found') }),
    });
    const app = buildGatewayServer({ identityClient: {} as IdentityServiceClient, catalogClient, logger });

    const body = await graphqlRequest(app, 'query($slug: String!) { title(slug: $slug) { id } }', {
      slug: 'does-not-exist',
    });

    expect(body.errors).toBeUndefined();
    expect(body.data.title).toBeNull();
  });

  it('maps any other gRPC error to a typed INTERNAL_SERVER_ERROR', async () => {
    const catalogClient = fakeClient<CatalogServiceClient>({
      getTitleBySlug: () => ({ error: serviceError(grpc.status.UNAVAILABLE, 'connection refused') }),
    });
    const app = buildGatewayServer({ identityClient: {} as IdentityServiceClient, catalogClient, logger });

    const body = await graphqlRequest(app, 'query($slug: String!) { title(slug: $slug) { id } }', { slug: 'x' });

    expect(body.data.title).toBeNull(); // `title` is a nullable field, so the error doesn't null out the whole response
    expect(body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.errors[0].message).toBe('Internal error'); // never leaks the raw gRPC error to the client
  });
});

const CREATE_TITLE_MUTATION = `
  mutation($input: CreateTitleInput!) {
    createTitle(input: $input) {
      slug
      originalTitle
    }
  }
`;

const validInput = {
  type: 'MOVIE',
  originalTitle: 'The Matrix',
  synopsis: 'A hacker discovers reality is a simulation.',
  releaseYear: 1999,
  rating: 'R',
  runtimeMinutes: 136,
};

describe('Mutation.createTitle', () => {
  it('rejects a request with no bearer token, without calling Catalog', async () => {
    const createTitle = vi.fn();
    const catalogClient = { createTitle } as unknown as CatalogServiceClient;
    const app = buildGatewayServer({ identityClient: {} as IdentityServiceClient, catalogClient, logger });

    const body = await graphqlRequest(app, CREATE_TITLE_MUTATION, { input: validInput });

    expect(body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(createTitle).not.toHaveBeenCalled();
  });

  it('rejects a valid-but-non-admin token with FORBIDDEN, without calling Catalog', async () => {
    const createTitle = vi.fn();
    const identityClient = fakeClient<IdentityServiceClient>({
      validateToken: () => ({ response: { valid: true, accountId: 'acc_1', isAdmin: false } }),
    });
    const catalogClient = { createTitle } as unknown as CatalogServiceClient;
    const app = buildGatewayServer({ identityClient, catalogClient, logger });

    const body = await graphqlRequest(app, CREATE_TITLE_MUTATION, { input: validInput }, {
      authorization: 'Bearer non-admin-token',
    });

    expect(body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(createTitle).not.toHaveBeenCalled();
  });

  it('creates the title for an admin token', async () => {
    const identityClient = fakeClient<IdentityServiceClient>({
      validateToken: () => ({ response: { valid: true, accountId: 'admin_1', isAdmin: true } }),
    });
    const catalogClient = fakeClient<CatalogServiceClient>({
      createTitle: () => ({ response: { ...protoTitle, status: 1 /* DRAFT */ } }),
    });
    const app = buildGatewayServer({ identityClient, catalogClient, logger });

    const body = await graphqlRequest(app, CREATE_TITLE_MUTATION, { input: validInput }, {
      authorization: 'Bearer admin-token',
    });

    expect(body.errors).toBeUndefined();
    expect(body.data.createTitle.slug).toBe('the-matrix-1999');
  });

  it('passes genres through to Catalog, defaulting to an empty array when omitted', async () => {
    const identityClient = fakeClient<IdentityServiceClient>({
      validateToken: () => ({ response: { valid: true, accountId: 'admin_1', isAdmin: true } }),
    });
    const createTitle = vi.fn(() => ({ response: { ...protoTitle, status: 1 } }));
    const catalogClient = fakeClient<CatalogServiceClient>({ createTitle });
    const app = buildGatewayServer({ identityClient, catalogClient, logger });

    await graphqlRequest(app, CREATE_TITLE_MUTATION, { input: validInput }, { authorization: 'Bearer admin-token' });

    expect(createTitle).toHaveBeenCalledWith(expect.objectContaining({ genres: [] }));
  });

  it('maps ALREADY_EXISTS (duplicate slug) to a typed error', async () => {
    const identityClient = fakeClient<IdentityServiceClient>({
      validateToken: () => ({ response: { valid: true, accountId: 'admin_1', isAdmin: true } }),
    });
    const catalogClient = fakeClient<CatalogServiceClient>({
      createTitle: () => ({ error: serviceError(grpc.status.ALREADY_EXISTS, 'A title with this slug already exists') }),
    });
    const app = buildGatewayServer({ identityClient, catalogClient, logger });

    const body = await graphqlRequest(app, CREATE_TITLE_MUTATION, { input: validInput }, {
      authorization: 'Bearer admin-token',
    });

    expect(body.errors[0].extensions.code).toBe('ALREADY_EXISTS');
  });
});

const ATTACH_MEDIA_ASSET_MUTATION = `
  mutation($input: AttachMediaAssetInput!) {
    attachMediaAsset(input: $input) { id isPlayable videoUrl }
  }
`;

describe('Mutation.attachMediaAsset', () => {
  it('rejects a non-admin token, without calling Catalog', async () => {
    const attachMediaAsset = vi.fn();
    const identityClient = fakeClient<IdentityServiceClient>({
      validateToken: () => ({ response: { valid: true, accountId: 'acc_1', isAdmin: false } }),
    });
    const catalogClient = { attachMediaAsset } as unknown as CatalogServiceClient;
    const app = buildGatewayServer({ identityClient, catalogClient, logger });

    const body = await graphqlRequest(
      app,
      ATTACH_MEDIA_ASSET_MUTATION,
      { input: { titleId: 'title_1', url: 'https://example.com/v.mp4' } },
      { authorization: 'Bearer non-admin-token' },
    );

    expect(body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(attachMediaAsset).not.toHaveBeenCalled();
  });

  it('attaches the asset for an admin token', async () => {
    const identityClient = fakeClient<IdentityServiceClient>({
      validateToken: () => ({ response: { valid: true, accountId: 'admin_1', isAdmin: true } }),
    });
    const catalogClient = fakeClient<CatalogServiceClient>({
      attachMediaAsset: () => ({
        response: { ...protoTitle, status: 1 /* DRAFT */, mediaAssetUrl: 'https://example.com/v.mp4' },
      }),
    });
    const app = buildGatewayServer({ identityClient, catalogClient, logger });

    const body = await graphqlRequest(
      app,
      ATTACH_MEDIA_ASSET_MUTATION,
      { input: { titleId: 'title_1', url: 'https://example.com/v.mp4' } },
      { authorization: 'Bearer admin-token' },
    );

    expect(body.errors).toBeUndefined();
    expect(body.data.attachMediaAsset).toEqual({
      id: 'title_1',
      isPlayable: true,
      videoUrl: 'https://example.com/v.mp4',
    });
  });

  it('maps an unknown titleId (NOT_FOUND) to a typed error', async () => {
    const identityClient = fakeClient<IdentityServiceClient>({
      validateToken: () => ({ response: { valid: true, accountId: 'admin_1', isAdmin: true } }),
    });
    const catalogClient = fakeClient<CatalogServiceClient>({
      attachMediaAsset: () => ({ error: serviceError(grpc.status.NOT_FOUND, 'Title not found') }),
    });
    const app = buildGatewayServer({ identityClient, catalogClient, logger });

    const body = await graphqlRequest(
      app,
      ATTACH_MEDIA_ASSET_MUTATION,
      { input: { titleId: 'unknown', url: 'https://example.com/v.mp4' } },
      { authorization: 'Bearer admin-token' },
    );

    expect(body.errors[0].extensions.code).toBe('NOT_FOUND');
  });
});

const PUBLISH_TITLE_MUTATION = `
  mutation($id: ID!) {
    publishTitle(id: $id) { id status: originalTitle }
  }
`;

describe('Mutation.publishTitle', () => {
  it('rejects a request with no bearer token, without calling Catalog', async () => {
    const publishTitle = vi.fn();
    const catalogClient = { publishTitle } as unknown as CatalogServiceClient;
    const app = buildGatewayServer({ identityClient: {} as IdentityServiceClient, catalogClient, logger });

    const body = await graphqlRequest(app, PUBLISH_TITLE_MUTATION, { id: 'title_1' });

    expect(body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(publishTitle).not.toHaveBeenCalled();
  });

  it('publishes for an admin token', async () => {
    const identityClient = fakeClient<IdentityServiceClient>({
      validateToken: () => ({ response: { valid: true, accountId: 'admin_1', isAdmin: true } }),
    });
    const catalogClient = fakeClient<CatalogServiceClient>({
      publishTitle: () => ({ response: protoTitle }),
    });
    const app = buildGatewayServer({ identityClient, catalogClient, logger });

    const body = await graphqlRequest(
      app,
      PUBLISH_TITLE_MUTATION,
      { id: 'title_1' },
      { authorization: 'Bearer admin-token' },
    );

    expect(body.errors).toBeUndefined();
    expect(body.data.publishTitle.id).toBe('title_1');
  });

  it('maps FAILED_PRECONDITION (no ready media asset) to a typed error', async () => {
    const identityClient = fakeClient<IdentityServiceClient>({
      validateToken: () => ({ response: { valid: true, accountId: 'admin_1', isAdmin: true } }),
    });
    const catalogClient = fakeClient<CatalogServiceClient>({
      publishTitle: () => ({
        error: serviceError(grpc.status.FAILED_PRECONDITION, 'This title has no ready media asset'),
      }),
    });
    const app = buildGatewayServer({ identityClient, catalogClient, logger });

    const body = await graphqlRequest(
      app,
      PUBLISH_TITLE_MUTATION,
      { id: 'title_1' },
      { authorization: 'Bearer admin-token' },
    );

    expect(body.errors[0].extensions.code).toBe('FAILED_PRECONDITION');
  });
});
