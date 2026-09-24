/** Thrown by registerAccount when the raw input fails schema/business validation. Maps to gRPC INVALID_ARGUMENT. */
export class InvalidRegisterInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRegisterInputError';
  }
}

/** Thrown by registerAccount when the email is already taken. Maps to gRPC ALREADY_EXISTS. */
export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('An account with this email already exists');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

/** Thrown by verifyEmail when the token doesn't match any pending account or has expired. Maps to gRPC INVALID_ARGUMENT — deliberately doesn't distinguish "wrong" from "expired" to avoid leaking account existence. */
export class InvalidOrExpiredTokenError extends Error {
  constructor() {
    super('Invalid or expired token');
    this.name = 'InvalidOrExpiredTokenError';
  }
}
