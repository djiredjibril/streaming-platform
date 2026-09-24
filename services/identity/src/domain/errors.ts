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

/** Thrown by loginAccount on any credential mismatch (unknown email, wrong password, or OAuth-only account). Deliberately generic — never reveals which part was wrong. Maps to gRPC UNAUTHENTICATED. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

/** Thrown by loginAccount when the account is still PENDING_VERIFICATION. Maps to gRPC FAILED_PRECONDITION. */
export class AccountNotVerifiedError extends Error {
  constructor() {
    super('Account is not verified yet');
    this.name = 'AccountNotVerifiedError';
  }
}

/** Thrown by loginAccount when the account is SUSPENDED. Maps to gRPC PERMISSION_DENIED. */
export class AccountSuspendedError extends Error {
  constructor() {
    super('Account is suspended');
    this.name = 'AccountSuspendedError';
  }
}

/** Thrown by refreshSession/getAccount when no account matches. Maps to gRPC NOT_FOUND. */
export class AccountNotFoundError extends Error {
  constructor() {
    super('Account not found');
    this.name = 'AccountNotFoundError';
  }
}

/** Thrown by refreshSession when the presented refresh token doesn't exist or is expired. Maps to gRPC UNAUTHENTICATED. */
export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('Invalid or expired refresh token');
    this.name = 'InvalidRefreshTokenError';
  }
}

/** Thrown by refreshSession when a refresh token that was already rotated/revoked is presented again — signals likely token theft. All of the account's refresh tokens are revoked as a side effect before this is thrown. Maps to gRPC UNAUTHENTICATED. */
export class RefreshTokenReuseDetectedError extends Error {
  constructor() {
    super('Refresh token reuse detected; all sessions for this account have been revoked');
    this.name = 'RefreshTokenReuseDetectedError';
  }
}

/** Thrown by validateAccessToken when the JWT signature/expiry check fails. Maps to gRPC UNAUTHENTICATED. */
export class InvalidAccessTokenError extends Error {
  constructor() {
    super('Invalid or expired access token');
    this.name = 'InvalidAccessTokenError';
  }
}

/** Thrown by createProfile when a PERSO/ETUDIANT account (capped at one profile) already has one. Maps to gRPC FAILED_PRECONDITION. */
export class ProfileLimitExceededError extends Error {
  constructor() {
    super('This account type is limited to one profile');
    this.name = 'ProfileLimitExceededError';
  }
}

/** Thrown by createProfile/registerAccount-adjacent input validation when displayName fails schema checks. Maps to gRPC INVALID_ARGUMENT. */
export class InvalidProfileInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProfileInputError';
  }
}

/** Thrown by loginAccount/registerAccount when the caller's IP has exceeded its attempt budget. Maps to gRPC RESOURCE_EXHAUSTED. */
export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Too many attempts; retry in ${retryAfterSeconds} seconds`);
    this.name = 'RateLimitExceededError';
  }
}
