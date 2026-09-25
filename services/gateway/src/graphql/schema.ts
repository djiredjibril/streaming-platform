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
  }
`;
