/**
 * GraphQL SDL for the Catalog domain (docs/03-catalog.md, "Contrat API —
 * GraphQL"). V1 scope matches CatalogService's own V1 scope: `Title` only
 * — `genres`/`seasons` from the spec's target schema aren't implemented
 * yet (no Genre/Season/Episode features on the Catalog service either).
 */
export const typeDefs = /* GraphQL */ `
  enum TitleType {
    MOVIE
    SERIES
    SHORT
  }

  enum ContentRating {
    G
    PG
    PG_13
    R
    NC_17
    UNRATED
  }

  type Title {
    id: ID!
    slug: String!
    type: TitleType!
    originalTitle: String!
    synopsis: String!
    releaseYear: Int!
    rating: ContentRating!
    runtimeMinutes: Int
    posterUrl: String
    backdropUrl: String
    """
    Derived from the title's MediaAsset status (docs/03-catalog.md's
    Episode.isPlayable, applied here at the Title level since there's no
    Episode yet) — true only once AttachMediaAsset has produced a READY
    asset. A title returned by Query.title is always published, and
    PublishTitle refuses without a READY asset, so this is effectively
    always true there — it matters for a future admin-facing query over
    drafts.
    """
    isPlayable: Boolean!
    """ Null until AttachMediaAsset has been called at least once. """
    videoUrl: String
  }

  input CreateTitleInput {
    type: TitleType!
    originalTitle: String!
    synopsis: String!
    releaseYear: Int!
    rating: ContentRating!
    runtimeMinutes: Int
    posterUrl: String
    backdropUrl: String
  }

  input AttachMediaAssetInput {
    titleId: ID!
    url: String!
  }

  type Query {
    """
    Null for an unknown slug OR a real title that isn't published —
    see CatalogService.GetTitleBySlug's comment in /proto/catalog.proto.
    """
    title(slug: String!): Title
  }

  type Mutation {
    """
    Admin only (Account.isAdmin) — see resolvers.ts's requireAdmin().
    """
    createTitle(input: CreateTitleInput!): Title!
    """
    Admin only. Attaches (or replaces) the one static video file for a
    Title — see CatalogService.AttachMediaAsset's comment in
    /proto/catalog.proto for the V1 no-real-upload-pipeline caveat.
    """
    attachMediaAsset(input: AttachMediaAssetInput!): Title!
    """
    Admin only. Fails if the Title has no READY MediaAsset yet.
    """
    publishTitle(id: ID!): Title!
  }
`;
