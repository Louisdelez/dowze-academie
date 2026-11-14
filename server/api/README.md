# API Dowze Académie

33 modules Python récupérés directement de l’API active sur Epic‑01 le 14 novembre 2026 et comparés par SHA-256 aux sources du dépôt. Ils correspondent également à la preuve de livraison du 16 octobre. Le scellement, le validateur et son runtime ont été récupérés et vérifiés. Le nom historique `dowze-nas-api` du manifeste Python ne signifie pas que le NAS héberge encore ce service.

## Développement local

Depuis ce répertoire, dans un environnement Python compatible :

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install --require-hashes -r requirements.lock
# Option PostgreSQL seulement :
# pip install --require-hashes -r postgres-requirements.lock
# Définir les variables décrites dans .env.example, sans commiter leurs valeurs.
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Le lancement direct emploie par défaut une base SQLite locale et n’est pas une procédure de production pour carnets gérés. L’API expose `/health` en interne ; le frontal public utilise `/healthz`.

Configuration : `DOWZE_ENV`, `DOWZE_DATABASE_PATH` ou `DOWZE_DATABASE_URL_FILE`, `DOWZE_DATABASE_SCHEMA`, `DOWZE_PACKAGE_DIR`, `DOWZE_BLOB_DIR`, `DOWZE_ALLOWED_ORIGINS`, TTL et quotas dans `app/config.py`. Les origines doivent correspondre exactement au client. Le fichier d’URL de base reste un secret d’exploitation.

## Tests et contrat

Les tests conservés sont un socle historique, pas toute la qualification des 33 modules. `openapi.yaml` est également un instantané historique ; générer et comparer le contrat de l’API réellement qualifiée avant une livraison. Utiliser un stockage temporaire et aucun compte de production pour les tests.

## Production

`app.notebook_startup:create_managed_app` vérifie les artefacts scellés avant création de l’API. Le Dockerfile de référence nécessite son image parent, son manifeste et son runtime validateur. Les sources du runtime sont dans `runtime/`, le binaire Node et les images dans le dossier local ignoré. Le contexte complet peut être reconstitué avec `tools/materialize_api_release.py` ; voir `docs/SERVER-RECOVERY.md`. Conserver ces garanties ; ne pas remplacer la factory de production par `app.main:app` pour contourner un échec.

La variante de 37 modules est rangée dans `../../work-in-progress/server-api37/` depuis la racine du dépôt, sans être activée.
