# Reprise du serveur Dowze Académie

## Éléments réunis

- `server/api/app/` : les 33 modules actifs et leur scellement.
- `server/api/runtime/` : le worker Node, la fixture et le manifeste scellés ; le vérificateur est dans `server/api/`.
- `server/database/dowze_academie.schema.sql` : schéma des 20 tables PostgreSQL, sans données, propriétaire ni privilèges exportés.
- `infra/epic-01/` : configuration applicative Compose/nginx et unités système observées ; les fichiers de secrets ne sont pas inclus.
- `local/runtime/notebook-validator/node` : binaire Node exact, SHA-256 attendu dans le manifeste.
- `local/distribution/images/dowze-production-20261114.tar.gz` : trois images Docker, API/web/base, sans volumes utilisateur. Empreinte dans `local-artifacts.json`.

Les fichiers `local/` sont présents dans le dossier demandé sur le Dell, mais ignorés par Git. Un clone GitHub seul ne contient donc pas les gros binaires ; leur emplacement et leurs empreintes sont documentés.

## Reconstituer les sources de construction

Depuis la racine du dossier local :

```bash
python3 tools/materialize_api_release.py /chemin/vers/contexte-neuf
```

L’outil vérifie les 33 empreintes, le scellement du manifeste et les trois artefacts du validateur avant de copier. Il ne construit ni n’active une image. Le Dockerfile historique utilise l’image parent par digest ; l’archive Docker récupérée contient également cette base. La reconstruction et le rechargement sur une nouvelle machine restent à qualifier avant une livraison.

## Préparer une reprise isolée

1. Vérifier le SHA-256 de l’archive, puis charger les images sur une machine de test avec Docker. Ne pas lancer ce test sur les volumes de production.
2. Préparer PostgreSQL compatible, le schéma, un rôle applicatif limité et un fichier de connexion privé. Les comptes et documents réels doivent être restaurés depuis une sauvegarde autorisée, pas déduits de l’export de schéma.
3. Restaurer les blobs associés à la même sauvegarde cohérente. Le shell PWA ou les images Docker ne contiennent pas ces données.
4. Adapter les chemins et interfaces de `infra/epic-01/academie.compose.json` à la machine isolée, en conservant l’absence de pull automatique, les limites et les mounts de secrets en lecture seule.
5. Démarrer la factory scellée, puis qualifier authentification, accès aux documents, synchronisation, médias et restauration. Ne pas remplacer la factory par le démarrage de développement.
6. Préparer DNS/TLS et les contrôles du frontal séparément. Aucun DNS, service, base ou volume n’a été modifié durant la collecte.

## Base active et sauvegarde

L’API utilise PostgreSQL 17.6, base `postgres`, schéma `dowze_academie`, sur le Supabase partagé d’Epic‑01. Le fichier `data/api.sqlite3` est un reliquat historique. Le job `restbackup-dw-native` couvre des services partagés ; les unités conservées renvoient au système de sauvegarde d’exploitation. Le dernier état observé est réussi et le timer actif ; aucune nouvelle restauration n’est revendiquée par cet audit.
