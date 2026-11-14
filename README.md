# Dowze Académie

Espace d’étude pour organiser les cours, le planning, les évaluations et les notes, avec une application de bureau Rust/Tauri et une PWA pour téléphone et tablette.

Ce dépôt rassemble les sources retrouvées sur le Dell, les sources serveur conservées localement et le site public récupéré sur Epic‑01. **La consolidation du 14 novembre 2026 n’est pas une nouvelle version installée ou déployée.**

## État des versions

| Composant | Source réunie | Qualification |
| --- | --- | --- |
| Application de bureau | 0.12.7 ; React, TypeScript, Rust/Tauri 2 | Copie de l’espace de travail Dell, sans nouvelle compilation |
| PWA | `pwa/`, avec modèles et bibliothèques partagés de `src/` | Sources présentes ; instantané public distinct dans le dossier local ignoré |
| API | `server/api/app/` : 33 modules Python | 33 modules comparés à l’API active sur Epic‑01 ; scellement et validateur récupérés |
| Site public | `server/public-site/` | Fichiers récupérés sur Epic‑01 le 14 novembre |
| Refonte Notes | `work-in-progress/notes/` : 53 fichiers de delta, cible de 619 fichiers | Travail non livré ; métadonnées préparatoires 0.12.8 |
| API suivante | `work-in-progress/server-api37/` : 37 modules | Travail non activé |

Le site répond sur **[academie.dowze.ch](https://academie.dowze.ch/)** ; la **[PWA](https://academie.dowze.ch/app/)** et `/healthz` répondent en HTTP 200 lors de l’audit. Le routage public mène désormais à **Epic‑01**. Les anciennes références à Dowze‑01 et au NAS sont historiques.

## Organisation

```text
src/                     Interface, modèles, cours et ressources du compagnon
src-tauri/               Application native Rust, capacités et configuration Tauri
pwa/                     Interface mobile/tablette et synchronisation web
public/                  Icônes et manifeste du client
server/api/              API Python, stockage et tests historiques
server/public-site/      Sources du site de distribution et catalogue public
infra/                   Modèles de configuration et procédures d’exploitation
research/                Recherche UI/UX et audit/plan Notes conservés
work-in-progress/        Refontes séparées, non appliquées à la version principale
tools/                   Vérification de l’assemblage et reconstruction des sources Notes
docs/                    Architecture, audit, développement, exploitation et limites
local/                   Instantané PWA et inventaire privé ; ignoré par Git
```

Les historiques Git précédents sont conservés. Les dépendances, exécutables distribués, bases de données et secrets ne font pas partie du code publié. Les images API/web et le binaire Node du validateur sont conservés dans `local/`, hors Git, avec leurs empreintes. Voir [la reprise du serveur](docs/SERVER-RECOVERY.md).

## Commencer

Après installation des prérequis de la plateforme, `npm ci`, puis `npm run tauri -- dev` pour le bureau ; `npm run dev` pour le frontend seul. Pour la PWA : `npx vite --config vite.pwa.config.ts`, ou compilation vers `pwa-dist/` avec `npx vite build --config vite.pwa.config.ts`.

Sur le Dell, utiliser impérativement le lanceur borné décrit dans [Développement](docs/DEVELOPPEMENT.md). Aucun build lourd n’a été lancé pour cette consolidation.

Le serveur de développement est documenté dans [server/api/README.md](server/api/README.md). Il ne remplace pas l’image de production scellée des carnets gérés.

## Documentation

- [Audit et inventaire du 14 novembre](docs/AUDIT-2026-11-14.md)
- [Architecture et circulation des données](docs/ARCHITECTURE.md)
- [Développement et contrôles](docs/DEVELOPPEMENT.md)
- [Déploiement, sauvegarde et reprise](docs/DEPLOIEMENT.md)
- [Confidentialité](docs/CONFIDENTIALITE.md), [limites](docs/LIMITES.md), [utilisation](docs/UTILISATION.md)
- [Travaux non livrés](work-in-progress/README.md) et [recherche conservée](research/README.md)

Licence du projet : [MIT](LICENSE). Les avis des dépendances restent dans [notices/](notices/). L’objectif de refonte des notes ne constitue pas une certification de parité avec Notability.
