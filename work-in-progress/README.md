# Travaux conservés séparément

Ces sources ne sont ni une version installée ni une nouvelle livraison.

- `notes/overlay/` : 53 fichiers de changement pour reconstruire une cible de 619 fichiers, dont les métadonnées 0.12.8. Le manifeste donne chaque empreinte et sa base. Des contrôles historiques ont passé, mais la composition finale et la recette GUI complète restent non qualifiées.
- `server-api37/app/` : 37 modules de la qualification suivante ; ne remplace pas les 33 modules de référence dans `server/api/`.
- `paper-template-gallery/overlay/` : préparation de la galerie de modèles ; non intégrée et non qualifiée ici.

L’audit et le plan de refonte Notes conservés dans `research/notability/` couvrent 130 critères et 137 tâches. Ils décrivent un travail inachevé, pas une certification de parité. Les overlays sont des sources de projet ; les binaires propriétaires de référence restent exclus.

Reconstruction vérifiée des sources Notes : `python3 tools/materialize_notes.py DESTINATION_INEXISTANTE`. Ne pas recopier l’overlay directement dans une production ni supprimer ses contrôles de révision.
