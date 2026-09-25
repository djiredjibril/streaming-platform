/** Thrown when CreateTitle's input fails Zod validation (schemas.ts). Mapped to gRPC INVALID_ARGUMENT. */
export class InvalidCreateTitleInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCreateTitleInputError';
  }
}

/** Thrown when the generated slug already exists — see slug.ts's docstring on why collisions aren't auto-resolved in V1. Mapped to gRPC ALREADY_EXISTS. */
export class SlugAlreadyExistsError extends Error {
  constructor(slug: string) {
    super(`A title with slug "${slug}" already exists`);
    this.name = 'SlugAlreadyExistsError';
  }
}

/** Thrown by GetTitleBySlug for an unknown slug OR a real title that isn't `published` — see catalog.proto's GetTitleBySlug comment for why these two cases are deliberately indistinguishable. Mapped to gRPC NOT_FOUND. */
export class TitleNotFoundError extends Error {
  constructor() {
    super('Title not found');
    this.name = 'TitleNotFoundError';
  }
}
