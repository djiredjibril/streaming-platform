# AGENT.md — Frontend Implementation Guide

Ce document encadre tout agent (humain ou IA) qui implémente le frontend web de la plateforme de streaming. **Hypothèse posée ici** : la plateforme est une app web (comme spécifié), donc stack web plutôt que React Native — à confirmer/ajuster si tu comptes réutiliser des composants avec Kabakoo. À lire avec `WORKFLOW.md` qui définit la boucle plan → challenge → implémentation → test → commit à suivre pour chaque feature.

## 1. Principes non négociables

1. **Aucune donnée sensible stockée en `localStorage`** — les tokens d'authentification vivent en cookie `httpOnly` + `secure`, jamais en `localStorage`/`sessionStorage` (vulnérable au XSS)
2. **Le filtrage kids/rating affiché côté client n'est jamais la seule protection** — c'est une commodité UX, la vraie vérification est côté serveur (cf. `AGENT-BACKEND.md`)
3. **Chaque écran a un état de chargement, un état vide, et un état d'erreur explicitement gérés** — pas d'écran blanc silencieux
4. **Accessibilité (a11y) considérée dès la construction du composant**, pas ajoutée après coup

## 2. Stack technique recommandée

| Composant | Choix | Justification |
|---|---|---|
| Framework | Next.js (React, TypeScript) | SSR utile pour le SEO du catalogue, écosystème mature |
| Client GraphQL | Apollo Client ou urql | Cache normalisé, cohérent avec la gateway GraphQL backend |
| Lecteur vidéo HLS | `hls.js` (avec fallback natif Safari) | Standard pour lire du HLS hors Safari/iOS |
| State management léger | Zustand (état UI local) — le state serveur reste dans le cache Apollo/urql, pas dupliqué | Évite de dupliquer inutilement l'état serveur dans un store global |
| Styles | Tailwind CSS | Rapide à itérer, cohérent avec un usage moderne React |
| Tests unitaires/composants | Vitest + Testing Library | Cohérent avec ta CI/CD React déjà explorée |
| Tests E2E | Playwright | Déjà utilisé dans ton exploration CI/CD |
| Mocking API en test | Mock Service Worker (MSW) | Déjà exploré côté CI/CD — intercepte les requêtes GraphQL en test sans vrai backend |

## 3. Structure de projet

```
/apps/web
  /app                      <- Next.js App Router
    /(auth)/login
    /(auth)/register
    /browse
    /watch/[contentId]
    /account
  /components
    /player                 <- lecteur vidéo HLS, isolé et réutilisable
    /catalog                <- cartes de titres, grilles de navigation
    /social                 <- commentaires, réactions
    /ui                     <- composants génériques (boutons, modals)
  /lib
    /graphql                <- client, queries, mutations générées
    /auth                   <- gestion de session côté client
  /tests
    /unit
    /e2e
```

## 4. Le lecteur vidéo — composant le plus critique

- **Isoler le lecteur dans un composant dédié** (`/components/player`) qui ne connaît rien du GraphQL/state global — il reçoit une URL de manifest et des callbacks (`onProgress`, `onEnded`), rien d'autre. Ça le rend testable indépendamment.
- **Gérer les erreurs HLS explicitement** (`hls.js` remonte des événements d'erreur réseau/média) — un flux qui échoue doit informer l'utilisateur, pas planter silencieusement
- **Reprendre la lecture à `WatchProgress.position_seconds`** (cf. `05-delivery.md`) au chargement, pas depuis zéro
- **Envoyer les heartbeats de progression** (`RecordProgress`) à intervalle régulier (15-30s), pas seulement au `onEnded` — sinon une fermeture d'onglet brutale perd la progression
- **Adapter la qualité affichée** aux capacités déclarées du plan d'abonnement (cf. `IsSubscriptionActive.max_video_quality` en Billing) — ne pas juste s'appuyer sur `hls.js` pour tout décider automatiquement si le plan limite la qualité maximale

## 5. Gestion de session

- Token d'accès (courte durée) en mémoire (state React), jamais persisté
- Refresh token en cookie `httpOnly` — le renouvellement de session passe par une route serveur (Next.js API route ou Server Action) qui parle au backend, jamais directement exposé au JS client
- Redirection systématique vers login si le refresh échoue, avec message clair (pas un écran blanc)

## 6. Tests — exigence de rigueur

| Niveau | Cible | Outil |
|---|---|---|
| Unitaire | Fonctions utilitaires, hooks isolés | Vitest |
| Composant | Rendu, interactions (clic, formulaire) | Testing Library + MSW pour mocker le GraphQL |
| E2E | Parcours critiques : inscription → souscription → lecture d'un contenu → commentaire | Playwright |

**Parcours E2E prioritaires à couvrir** :
1. Inscription + vérification email (mockée) + création de profil
2. Souscription à un plan avec réduction étudiant
3. Lecture d'une vidéo avec reprise de progression
4. Blocage d'accès à un contenu restreint sur un profil kids
5. Commentaire + like sur un contenu

## 7. Accessibilité (a11y)

- Navigation clavier complète sur le lecteur vidéo (play/pause, volume, plein écran) — pas seulement à la souris
- Contrastes conformes WCAG AA sur les textes
- `alt` descriptif sur les posters/affiches, pas juste le titre répété
- Sous-titres (`.vtt`) supportés dans le lecteur dès que possible — lié au pipeline média backend si tu veux étendre `04-media-pipeline.md` à la génération de sous-titres plus tard

## 8. Logging et observabilité côté client

- Erreurs JS non catchées envoyées à un service de tracking (ex: Sentry) — pas seulement `console.error`
- Erreurs de lecture vidéo (`hls.js` error events) loggées avec le `content_id` et le code d'erreur, pour croiser avec les logs backend de Delivery via le `correlation_id`
- Ne jamais logger de token ou d'information de paiement côté client, même en erreur

## 9. Documentation — exigence par implémentation

- **README par app/module** (`/apps/web/README.md`, et un README court par dossier `/components/<domaine>` non trivial) : ce que le module fait, comment le tester en isolation (Storybook si tu veux l'introduire, sinon juste les commandes de test)
- **JSDoc/TSDoc sur les hooks et fonctions utilitaires partagées** — surtout `/lib/auth` et `/components/player`, les deux zones les plus critiques
- **Props documentées** sur chaque composant réutilisable (via les types TypeScript eux-mêmes, complétés d'un commentaire quand un prop a un comportement non évident)
- **Changelog par app**, aligné avec les commits "par thème" définis dans `WORKFLOW.md`

## 10. Performance

- Images (posters/backdrops) servies en format optimisé (WebP/AVIF) avec tailles responsives (`next/image`)
- Pagination par curseur côté UI (scroll infini) cohérente avec l'API `browseTitles` (cf. `03-catalog.md`) — ne pas charger tout le catalogue d'un coup
- Préchargement du manifest du prochain épisode d'une série en fin de lecture (amélioration UX, pas prioritaire en V1)

## Ordre d'implémentation recommandé

Suivre le même phasage que le backend : écran de login/inscription + navigation du catalogue (Phase 1) → lecteur vidéo fonctionnel (Phase 2) → écran de souscription/gestion de plan (Phase 3) → commentaires/réactions + section recommandations (Phase 4).
