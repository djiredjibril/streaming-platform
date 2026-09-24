# KICKOFF-PROMPT.md — Prompt d'entrée pour l'agent d'implémentation

## Contexte du projet

Tu implémentes une plateforme de streaming vidéo (films, séries, shorts) en monorepo, avec authentification, abonnements à réductions par type de compte, pipeline de transcodage vidéo réel, interactions sociales et recommandations. Le projet est découpé en 7 domaines (bounded contexts), chacun avec sa spec complète.

**Documents de référence — à lire avant toute action, dans cet ordre :**
1. `/docs/00-OVERVIEW.md` — vision, domaines, phasage global
2. `/docs/WORKFLOW.md` — la boucle de travail que tu dois suivre pour CHAQUE feature, sans exception
3. Le fichier `AGENTS.md` du dossier où tu t'apprêtes à travailler (`/services/AGENTS.md` pour tout travail backend, `/apps/web/AGENTS.md` pour tout travail frontend) — conventions techniques, structure de code, exigences de tests/logs/audit/sécurité/documentation
4. Le fichier de spec du domaine concerné (`/docs/0X-<domaine>.md`) — modèle de données, schéma ER, contrat gRPC/GraphQL/REST, bonnes pratiques spécifiques

## Règle absolue — le workflow n'est pas optionnel

Pour CHAQUE feature, même petite, tu suis exactement la boucle définie dans `/docs/WORKFLOW.md` :

1. **Planifier** — avant d'écrire du code, écris le plan (fichiers touchés, modèle de données impacté, approche de test) et présente-le-moi
2. **Challenger** — je vais challenger ce plan (ou challenge-le toi-même explicitement si je te le demande). Si le plan n'est pas bon → tu replanifies. Si bon → tu implémentes
3. **Implémenter** — en suivant strictement le plan validé et les conventions du `AGENTS.md` applicable
4. **Tester** — jamais de feature "terminée" sans les tests correspondants (cf. pyramide de tests du `AGENTS.md`)
   - Si les tests échouent → tu debugges, tu ne passes pas à autre chose
   - Si les tests réussissent → tu commits, **sans signature GPG**, en **un seul commit par thème/lot** (pas un commit par fichier), avec un message clair (`feat(identity): register endpoint with argon2id hashing`)
5. **Feature suivante** — uniquement après le commit de la précédente

**Ne saute jamais l'étape 1 et 2, même si la feature te semble triviale.** Une feature qui semble simple mais casse un contrat inter-domaine (gRPC/GraphQL) coûte plus cher à corriger après coup qu'à planifier avant.

## Granularité attendue d'une feature

Une feature = une unité testable de façon autonome (ex: "endpoint Register avec validation + hash argon2id", pas "tout le domaine Identity"). Si une tâche te semble trop large pour être planifiée clairement en une fois, découpe-la toi-même en sous-features avant de proposer un plan, et dis-le explicitement.

## Documentation — non négociable à chaque feature

Conformément aux `AGENTS.md`, chaque feature livrée inclut :
- Code documenté (TSDoc sur les fonctions publiques, `.proto` commentés côté backend)
- README du service/module mis à jour si son usage a changé
- Schéma ER Mermaid du fichier de spec concerné mis à jour dans le même commit si le modèle de données a changé
- Changelog du service/app mis à jour (une ligne par lot de commit)

## Point de départ

On démarre la **Phase 1** de `/docs/00-OVERVIEW.md` : domaines Identity (`01-identity.md`) et Catalog (`03-catalog.md`), côté backend d'abord.

**Première feature à planifier** : bootstrap du monorepo (structure de dossiers, `docker-compose.yml` avec PostgreSQL + Redis + MinIO, configuration TypeScript/lint/tests partagée) — avant toute logique métier. Propose-moi le plan de cette première feature avant de créer le moindre fichier.

---

## Rappel pour toi (humain) avant d'envoyer ce prompt

- Vérifie que `/docs`, `/services/AGENTS.md` et `/apps/web/AGENTS.md` sont bien en place dans le repo avant de démarrer la session agent
- Si l'agent propose un plan qui s'écarte d'une spec de domaine sans le justifier, c'est le signal de le renvoyer à l'étape 1 (replanifier) — ne laisse pas passer un écart silencieux même si le code semble correct