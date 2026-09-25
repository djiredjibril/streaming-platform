import * as grpc from '@grpc/grpc-js';

type UnaryMethod<Req, Res> = (
  request: Req,
  metadata: grpc.Metadata,
  callback: (error: grpc.ServiceError | null, response: Res) => void,
) => grpc.ClientUnaryCall;

/**
 * Promisifies one gRPC unary call. Pass a bound method (`identityClient.login.bind(identityClient)`)
 * so every route/resolver shares this instead of hand-rolling the same
 * new-Promise-wrapping-a-callback boilerplate. Not tied to a specific
 * service — reused by both the Identity and Catalog clients.
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
