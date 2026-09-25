/**
 * GraphQL SDL for the Catalog domain (docs/03-catalog.md, "Contrat API —
 * GraphQL"). V1 scope matches CatalogService's own V1 scope — `seasons`
 * from the spec's target schema isn't implemented yet (no Season/Episode
 * features on the Catalog service). `genres` is implemented, but as
 * `[String!]!` rather than `[Genre!]!` — see the `Title.genres` docstring.
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
    """
    Genre names, as plain strings rather than the spec's target Genre type —
    nothing yet looks up a title by genre id, so there's no reason to
    expose one (see CatalogService's Title.genres comment in
    /proto/catalog.proto).
    """
    genres: [String!]!
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
    genres: [String!]
  }

  input AttachMediaAssetInput {
    titleId: ID!
    url: String!
  }

  """
  Deliberately not a strict Relay Connection (no per-edge cursor) —
  CatalogService.BrowseTitles only returns one cursor for the whole page
  (the last title's), since pagination here is forward-only ("next page"),
  never "resume from an arbitrary edge". Adding per-edge cursors would need
  Title.createdAt on the wire, which nothing else needs yet.
  """
  type TitleConnection {
    titles: [Title!]!
    """ Null once there are no more pages. """
    nextCursor: String
  }

  type Query {
    """
    Null for an unknown slug OR a real title that isn't published —
    see CatalogService.GetTitleBySlug's comment in /proto/catalog.proto.
    """
    title(slug: String!): Title
    """
    Published titles, newest first. Public — no admin check, unlike every
    Mutation on this schema. cursor/limit name the underlying gRPC fields
    directly rather than Relay's after/first — see TitleConnection's
    docstring for why this isn't a strict Connection.
    """
    browseTitles(genre: String, type: TitleType, cursor: String, limit: Int): TitleConnection!
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
