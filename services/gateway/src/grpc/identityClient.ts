import * as grpc from '@grpc/grpc-js';
import { IdentityServiceClient } from './generated/identity.js';

/**
 * Builds a client to the Identity gRPC service. `address` is injected
 * (rather than read from env here) so tests can point it at an in-process
 * test server instead of the real one.
 */
export function createIdentityClient(address: string): IdentityServiceClient {
  return new IdentityServiceClient(address, grpc.credentials.createInsecure());
}

type UnaryMethod<Req, Res> = (
  request: Req,
  metadata: grpc.Metadata,
  callback: (error: grpc.ServiceError | null, response: Res) => void,
) => grpc.ClientUnaryCall;

/**
 * Promisifies one gRPC unary call. Pass a bound method (`identityClient.login.bind(identityClient)`)
 * so every route shares this instead of hand-rolling the same
 * new-Promise-wrapping-a-callback boilerplate six times.
 */
export function callUnary<Req, Res>(
  method: UnaryMethod<Req, Res>,
  request: Req,
  metadata: grpc.Metadata = new grpc.Metadata(),
): Promise<Res> {
  return new Promise((resolve, reject) => {
    method(request, metadata, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}
