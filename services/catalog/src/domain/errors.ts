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

/** Thrown by GetTitleBySlug for an unknown slug OR a real title that isn't `published` — see catalog.proto's GetTitleBySlug comment for why these two cases are deliberately indistinguishable. Also thrown by AttachMediaAsset/PublishTitle for an unknown title id. Mapped to gRPC NOT_FOUND. */
export class TitleNotFoundError extends Error {
  constructor() {
    super('Title not found');
    this.name = 'TitleNotFoundError';
  }
}

/** Thrown when AttachMediaAsset's input fails Zod validation (schemas.ts). Mapped to gRPC INVALID_ARGUMENT. */
export class InvalidAttachMediaAssetInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAttachMediaAssetInputError';
  }
}

/** Thrown by PublishTitle when the Title has no `READY` MediaAsset — a title is never published without something playable behind it (docs/03-catalog.md, "Bonnes pratiques"). Mapped to gRPC FAILED_PRECONDITION. */
export class MediaAssetNotReadyError extends Error {
  constructor() {
    super('This title has no ready media asset — attach one before publishing');
    this.name = 'MediaAssetNotReadyError';
  }
}

/** Thrown when BrowseTitles' input fails Zod validation, OR when `cursor` doesn't decode to a well-formed (createdAt, id) pair (domain/cursor.ts) — a malformed/tampered cursor is an input error, not a server error. Mapped to gRPC INVALID_ARGUMENT. */
export class InvalidBrowseTitlesInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBrowseTitlesInputError';
  }
}
