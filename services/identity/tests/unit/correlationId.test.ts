import * as grpc from '@grpc/grpc-js';
import type { ServerUnaryCall } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';
import { getCorrelationId } from '../../src/grpc/correlationId.js';

function fakeCall(metadata: grpc.Metadata): ServerUnaryCall<unknown, unknown> {
  return { metadata } as unknown as ServerUnaryCall<unknown, unknown>;
}

describe('getCorrelationId', () => {
  it('returns the x-correlation-id metadata value when present', () => {
    const metadata = new grpc.Metadata();
    metadata.set('x-correlation-id', 'abc-123');

    expect(getCorrelationId(fakeCall(metadata))).toBe('abc-123');
  });

  it('generates a fresh UUID when the metadata is absent', () => {
    const id = getCorrelationId(fakeCall(new grpc.Metadata()));

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('generates a different UUID on each call without metadata', () => {
    const first = getCorrelationId(fakeCall(new grpc.Metadata()));
    const second = getCorrelationId(fakeCall(new grpc.Metadata()));

    expect(first).not.toBe(second);
  });
});
