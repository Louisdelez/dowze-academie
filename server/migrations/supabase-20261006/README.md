# Migration historique Supabase — 6 octobre 2026

Sources récupérées du serveur le 14 novembre : migration SQLite vers PostgreSQL, contrôles, sauvegarde/restauration et tests associés. Ce répertoire conserve son propre état historique ; l’API active actuelle est dans `server/api/`.

Ces scripts contiennent des opérations de migration et de bascule. Ils n’ont pas été exécutés pendant la consolidation et ne doivent pas être relancés tels quels sur la production actuelle. Les fichiers de secrets qu’ils référencent ne sont pas inclus.
