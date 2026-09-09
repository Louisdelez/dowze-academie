# Historique des versions

Les changements notables de Dowze Academie sont consignés dans ce fichier. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet utilise une numérotation compatible avec [Semantic Versioning](https://semver.org/lang/fr/).

## Non publié

### Ajouté

- Khan Academy rejoint les plateformes officielles du panneau d’étude comme ressource autonome, sans injection de consigne ni historique IA.
- Le bundle macOS déclare l’usage du microphone, signe le droit d’entrée audio du hardened runtime et propose une activation locale AVFoundation qui demande réellement le consentement TCC, puis recharge le service web après accord.

### Modifié

- La version macOS minimale des prochains builds passe de 10.13 à 10.14, niveau requis par les API AVFoundation utilisées pour demander le microphone.

### Corrigé

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
