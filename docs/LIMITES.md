# Limites vérifiées de la consolidation

Ce travail réunit et documente le projet ; il ne déploie pas une nouvelle version et n’installe rien sur le Dell.

- L’application principale correspond aux sources 0.12.7. Les travaux Notes 0.12.8 restent séparés.
- La source API principale a désormais été comparée aux 33 modules extraits de l’image active ; les empreintes et le scellement correspondent.
- La base et les médias utilisateur ne sont pas publiés ni copiés en clair dans le dépôt. Le schéma SQL seul, la configuration applicative sans secrets, les sources et les images serveur sont récupérés. Les secrets restent dans le coffre et les fichiers protégés.
- L’instantané PWA public est une distribution compilée ; sa présence ne permet pas de reconstruire ses sources par simple déduction.
- Le runtime scellé est récupéré : worker, fixture, manifeste, vérificateur et binaire Node. Le binaire et les images restent dans `local/`, hors Git. Le serveur de développement ne remplace pas la factory scellée.
- Les recherches Notability et UI/UX sont conservées comme travaux documentaires datés ; la parité intégrale n’est pas acquise.
- Les recettes sur iPad/Pencil, autres tablettes, macOS et Windows ne sont pas rejouées dans cet audit.
- Les caches, gros paquets historiques, anciens runtimes Hermes et binaires de Notability sont exclus du dépôt source.
- Le statut « données indisponibles » ou une preuve historique n’est pas un contrôle actuel d’un service privé.

L’audit détaille les écarts et les éléments réellement observés. Le rapprochement des sources avec l’API et de la configuration avec la base actives est effectué. Toute future opération de production nécessite encore sa qualification et une sauvegarde/restauration adaptées au changement.
