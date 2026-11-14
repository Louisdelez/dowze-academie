# Limites vérifiées de la consolidation

Ce travail réunit et documente le projet ; il ne déploie pas une nouvelle version et n’installe rien sur le Dell.

- L’application principale correspond aux sources 0.12.7. Les travaux Notes 0.12.8 restent séparés.
- La source API principale correspond exactement à la preuve du 16 octobre, pas à une extraction de l’image actuellement active.
- Les volumes de base et de médias, les sauvegardes, la configuration privée et les sources serveur archivées protégées n’ont pas été copiés.
- L’instantané PWA public est une distribution compilée ; sa présence ne permet pas de reconstruire ses sources par simple déduction.
- Le runtime de production scellé des carnets nécessite des artefacts supplémentaires. Le serveur de développement ne le remplace pas.
- Les recherches Notability et UI/UX sont conservées comme travaux documentaires datés ; la parité intégrale n’est pas acquise.
- Les recettes sur iPad/Pencil, autres tablettes, macOS et Windows ne sont pas rejouées dans cet audit.
- Les caches, gros paquets historiques, anciens runtimes Hermes et binaires de Notability sont exclus du dépôt source.
- Le statut « données indisponibles » ou une preuve historique n’est pas un contrôle actuel d’un service privé.

L’audit détaille les écarts et les éléments réellement observés. Il reste nécessaire de rapprocher les sources recueillies de l’API et de la base actives avant toute opération de production.
