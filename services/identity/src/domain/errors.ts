export class InvalidRegisterInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRegisterInputError';
  }
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('An account with this email already exists');
    this.name = 'EmailAlreadyRegisteredError';
  }
}
