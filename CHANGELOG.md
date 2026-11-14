# Historique

## Consolidation — 2026-11-14

Regroupement des sources bureau 0.12.7, PWA, API historique, site public, documentation et refontes non livrées. Sortie PWA rendue relative. Aucun changement de version distribuée, de base ou de service actif. Les entrées antérieures ci-dessous restent historiques.

# Historique des versions

Les changements notables de Dowze Academie sont consignés dans ce fichier. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet utilise une numérotation compatible avec [Semantic Versioning](https://semver.org/lang/fr/).

## Non publié

### Ajouté

- Une bibliothèque **Formations** permet de créer, installer et rouvrir plusieurs années scolaires complètes depuis le rail gauche.
- L’atelier de création génère un kit ZIP autonome comprenant les six fichiers JSON du cursus, leurs schémas JSON Schema Draft 2020-12, un mode d’emploi et six prompts IA adaptés au nom et aux dates de la formation.
- L’import strict d’un dossier annuel valide la structure, les références, les dates, les volumes et les métadonnées linguistiques avant toute installation, avec journal de reprise et retour sûr vers la formation intégrée en cas de corruption.
- Chaque formation dispose désormais de son propre espace de travail local : cours, progression, planning, tâches, notes, évaluations, résultats, conversations, PDF et préférences sont restaurés ensemble lors d’un changement d’année.
- Khan Academy rejoint les plateformes officielles du panneau d’étude comme ressource autonome, sans injection de consigne ni historique IA.
- Le bundle macOS déclare l’usage du microphone, signe le droit d’entrée audio du hardened runtime et propose une activation locale AVFoundation qui demande réellement le consentement TCC, puis recharge le service web après accord.

### Modifié

- Les calendriers, barèmes, semestres, invites pédagogiques et parcours de langue sont maintenant dérivés du manifeste de la formation au lieu d’être limités au cursus énergétique intégré.
- Les niveaux CECRL importés conservent explicitement leur langue, y compris pour les leçons, corrections, recherches et raccourcis vers les plateformes d’apprentissage.
- La version macOS minimale des prochains builds passe de 10.13 à 10.14, niveau requis par les API AVFoundation utilisées pour demander le microphone.

### Corrigé

- Les alias historiques du cursus énergétique et de l’anglais intégré ne peuvent plus contaminer une formation personnalisée portant des identifiants ou des noms similaires.
- Les exports calendaires respectent les fuseaux de la formation, y compris les changements d’heure à minuit et les dates civiles entièrement sautées.
- Le déplacement de la fenêtre à barre de titre superposée est restauré depuis la zone supérieure du rail gauche, l’espace libre de la barre d’onglets centrale et la barre supérieure du panneau IA.
- La dictée et les conversations vocales restaient privées de microphone dans WKWebView car l’accord d’origine donné par Wry ne déclenchait pas à lui seul la demande native macOS.

## 0.1.0 — 2026-09-08

### Ajouté

- cursus Année 1 d’ingénierie et parcours d’anglais A1 à C2 ;
- calendrier académique, tâches et export iCalendar ;
- parcours séparés Cours, Exercices et évaluations papier ;
- carnet de résultats et archivage local des PDF ;
- éditeur Markdown visuel avec notes multi-matières ;
- profils locaux Argon2id et reconnexion facultative par le coffre sécurisé natif de macOS, Windows ou Linux ;
- services web intégrés, Chat libre et Ollama local ;
- documentation publique et licence MIT.

### Modifié

- le produit anciennement présenté comme « Étude » porte désormais le nom public **Dowze Academie** ;
- les anciens identifiants de stockage et de bundle restent conservés pour la compatibilité des données.
- une release GitHub construit désormais macOS Apple Silicon, macOS Intel, Windows x64 et Linux x64, avec sommes de contrôle SHA-256.
