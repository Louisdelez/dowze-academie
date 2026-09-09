# Dowze Academie

Application de bureau local-first pour macOS, Windows et Linux qui réunit un cursus structuré, un calendrier académique, des notes Markdown, des évaluations papier et des assistants IA contextualisés.

**Créé par Louis Délez** · Domaine prévu : `dowze.academie.ch` · [Licence MIT](./LICENSE)

> [!IMPORTANT]
> Dowze Academie 0.1.0 est un projet personnel en développement. Ce n’est ni un établissement d’enseignement, ni un diplôme, ni une certification. Les builds publics sont destinés au test : les applications macOS utilisent une signature ad hoc sans notarisation Apple et l’installateur Windows n’est pas signé.

## Pourquoi Dowze Academie

Dowze Academie transforme un programme annuel en parcours d’apprentissage concret : chaque matière est découpée en notions atomiques, chaque notion sépare le cours des exercices, et les évaluations restent conçues pour être réalisées sur papier. L’application coordonne le travail sans enfermer l’utilisateur dans un fournisseur d’IA unique.

La version actuelle embarque l’Année 1 « Ingénierie de l’énergie & physique appliquée » pour 2026–2027 : 10 matières, 182 chapitres et 988 notions, complétées par un parcours d’anglais annuel sélectionnable de A1 à C2.

## Points forts

- **Cursus structuré** — matières, chapitres, cours atomiques, exercices distincts, progression et anglais aligné sur le CECRL.
- **Formations annuelles** — bibliothèque locale, import de cursus complets et espaces de travail indépendants pour chaque année scolaire.
- **Planning académique** — vues année, mois, semaine et jour, événements personnels, tâches et export iCalendar vers le calendrier de l’appareil ou Google Agenda.
- **Évaluations sur papier** — préparation de sujets et corrigés PDF, archivage local des copies, barème propre à la formation, coefficients et appréciations.
- **Espace de notes** — éditeur Markdown visuel, onglets globaux, tags et association d’une même note à plusieurs matières.
- **Assistants au choix** — pages officielles de plusieurs services dans une WebView native persistante, fonctions vocales propres aux sites après autorisation du microphone, plus un Chat libre pour des API compatibles ou Ollama local.
- **Profils locaux** — comptes protégés par Argon2id, espaces de travail séparés et reconnexion facultative via le coffre sécurisé du système.

## Formations annuelles importables

Une formation Dowze Academie représente **une seule année scolaire**, sur 370 jours au maximum. Un cursus de plusieurs années doit donc être découpé en plusieurs formations indépendantes : par exemple Lycée — Seconde, Lycée — Première et Lycée — Terminale. L’Année 1 « Ingénierie de l’énergie & physique appliquée » reste incluse dans l’application ; d’autres années ou domaines peuvent être ajoutés depuis la page **Formations** du rail gauche.

Cette fonctionnalité appartient au code courant postérieur à la release publique `v0.1.0` ; les installateurs attachés à cette release ne la contiennent pas encore.

### Format du dossier

Le dossier doit s’appeler exactement `dowze-formation-<id>`, où `<id>` est la valeur stable de `formation.json:id`. Cet identifiant utilise uniquement des lettres ASCII minuscules, des chiffres et des tirets. Les six fichiers JSON obligatoires se trouvent directement à la racine, avec ces noms exacts :

| Fichier | Contenu initial |
| --- | --- |
| `formation.json` | Identité, année, niveau, pédagogie, notation, thème, locale et fuseau IANA |
| `matieres.json` | Matières et métadonnées stables |
| `programme.json` | Modules, chapitres et cours atomiques de chaque matière |
| `planning.json` | Périodes, fermetures, créneaux récurrents et événements datés |
| `evaluations.json` | Contrôles, examens et autres jalons évaluatifs planifiés |
| `taches.json` | Tâches initiales et échéances de départ |

Une matière de langue peut déclarer `languageCode` avec une balise BCP 47 canonique (`de`, `en`, `fr-CH`, etc.) et `languageName` avec son nom lisible. Ces deux champs vont toujours ensemble et deviennent obligatoires dès que `cefrLevel` apparaît sur la matière ou l’un de ses modules. Ainsi, un parcours CECRL B1 en allemand reste allemand dans les cours, évaluations, corrections, recherches et outils de pratique ; Dowze Academie ne déduit jamais « anglais » du seul niveau CECRL. Une évaluation couvrant plusieurs modules conserve tous leurs niveaux dans son contexte, par exemple A2–B1.

Le kit complet ajoute `MODE_D_EMPLOI.md`, un prompt par fichier dans `prompts/` et les schémas JSON dans `schemas/`. Ces documents aident à préparer le paquet mais ne deviennent pas des données personnelles de l’année installée. Le format et ses schémas sont propres à Dowze Academie ; aucune compatibilité avec un standard d’échange de programmes scolaires n’est revendiquée.

### Préparer et importer une formation

Dans **Formations → Ajouter une formation**, saisissez le nom ainsi que les dates de début et de fin de l’année. L’identifiant, le nom du dossier, les six modèles et leurs prompts reprennent automatiquement cette période ; les dates proposées par défaut suivent l’année scolaire courante et restent modifiables. L’atelier permet soit de télécharger un kit ZIP complet, soit de récupérer séparément chacun des six modèles JSON. Le niveau, le barème et le contenu pédagogique doivent toujours être relus et adaptés avant import.

Chaque carte de fichier fournit aussi un prompt autonome et copiable, avec ses dépendances et un modèle minimal. Dowze Academie ne contacte aucune IA pour cette opération : l’utilisateur choisit lui-même s’il remplit le JSON manuellement ou transmet le prompt et les fichiers de référence à un service externe. Une sortie générée reste à relire ; l’application valide sa structure et sa cohérence technique, pas sa qualité ou son exactitude pédagogique.

Lors de l’import, les six fichiers sont lus et validés ensemble avant toute écriture : versions de schéma, propriétés autorisées, identifiants et références entre fichiers, métadonnées de langue explicites, dates réelles dans l’année déclarée, locale BCP 47 canonique, fuseau IANA connu, heures DST existantes, collisions d’événements, prompts IA générables et compatibilité exacte avec l’export calendrier natif. Les schémas Draft 2020-12 vérifient la structure ; ces contrôles sémantiques et inter-fichiers sont volontairement appliqués en plus par Dowze Academie. Le rapport affiche au plus 200 erreurs détaillées avec leur fichier et leur chemin JSON, puis un marqueur de troncature ; l’installation reste indisponible tant qu’une erreur bloquante subsiste. Une installation valide est journalisée et initialise le nouvel espace comme un lot, sans rendre visible un état partiel.

### Activation, isolation et restauration

Installer une formation crée une instance locale et un espace de travail neuf pour cette année. Les matières et le planning du paquet sont chargés, les tâches initiales commencent non terminées, et les notes, résultats, historiques et conversations personnels commencent vides. Les évaluations du paquet deviennent des événements planifiés ; elles ne préremplissent aucune note obtenue.

La formation active se choisit depuis la bibliothèque après une confirmation dédiée. Le changement remonte l’espace de travail sur le couple **compte local + instance de formation** : progression, planning personnalisé, tâches, notes Markdown, résultats, PDF et historiques restent rattachés à leur année. Revenir à une ancienne formation restaure ses données au lieu de la remettre à zéro, et la dernière formation active est retrouvée séparément pour chaque compte au prochain lancement. Un miroir local du dernier registre valide et des copies de récupération versionnées empêchent une corruption de métadonnées de supprimer silencieusement les espaces annuels. L’export d’une année inclut uniquement ses propres copies de récupération, jamais celles d’une autre formation ni celles du registre.

Changer de formation ne supprime rien. La version actuelle ne propose d’ailleurs aucune commande de suppression ou de désinstallation d’une formation. Les sessions et cookies des sites tiers ainsi que les clés API conservées dans le coffre sécurisé restent des réglages de l’application sur l’appareil ; ils ne sont pas cloisonnés par formation.

### Limites du format actuel

- jusqu’à 100 formations importées par profil local, en plus de la formation incluse ;
- six fichiers JSON de 2 Mio maximum chacun et 8 Mio maximum pour l’ensemble lu ;
- 5 000 événements maximum après développement des créneaux récurrents ;
- 4 Mio maximum pour l’état initial compilé et 4 Mio pour le fichier iCalendar complet ;
- 64 Kio maximum par prompt final envoyé à une WebView IA native ;
- 1 000 modules, 10 000 chapitres et 50 000 cours atomiques au maximum, cumulés dans le paquet ;
- évaluations planifiées de 10 à 360 minutes, avec au moins un chapitre appartenant à la matière ;
- le dossier natif doit être réel et non un lien symbolique, et aucun fichier JSON supplémentaire n’est accepté à sa racine ;
- le dossier source et ses JSON originaux ne sont pas archivés comme tels par Dowze Academie : conservez-en une copie pour les modifier ou les réimporter ;
- aucun partage, catalogue distant, synchronisation cloud ou mise à jour automatique d’un paquet installé n’est fourni actuellement ;
- la limite pratique peut être inférieure à 100 formations si le quota local WebKit est atteint ; l’installation échoue alors sans état partiel, et aucune désinstallation n’est encore proposée dans cette version.

## Confidentialité en bref

« Local-first » ne signifie pas « entièrement hors ligne » :

- les profils, cours, événements, tâches, notes, résultats et métadonnées restent sur l’appareil ;
- les mots de passe des comptes locaux ne sont pas conservés en clair ;
- les clés du Chat libre et, avec consentement, les identifiants de reconnexion sont stockés dans le Trousseau macOS, le Gestionnaire d’identifiants Windows ou un service Secret Service sous Linux ;
- un message envoyé dans le Chat libre est transmis uniquement au fournisseur configuré, ou à Ollama sur `127.0.0.1` ;
- les sites ouverts dans la WebView appliquent leurs propres politiques de compte, de cookies et de confidentialité.

Sur macOS, le bouton microphone de la barre du panneau web demande explicitement l’autorisation système avec AVFoundation, puis recharge le service après accord. Cette activation ne démarre aucun enregistrement et vaut pour tous les services web intégrés compatibles. Lorsqu’une dictée ou une conversation vocale est ensuite lancée dans un site, Dowze Academie ne reçoit ni ne conserve l’audio ou sa transcription ; leur traitement et leur disponibilité restent ceux du fournisseur choisi. Ce pont natif fait partie des changements non publiés postérieurs à la version 0.1.0.

Les comptes Dowze Academie n’ont actuellement ni serveur, ni synchronisation cloud, ni récupération distante. Consultez la [documentation de confidentialité et de sécurité](./docs/CONFIDENTIALITE.md) avant d’utiliser un service tiers.

Sous Linux, les comptes locaux et la reconnexion sécurisée nécessitent une session D-Bus avec un service compatible Secret Service accessible et déverrouillé, par exemple GNOME Keyring. L’application bloque l’authentification si elle ne peut pas vérifier ou révoquer un éventuel secret mémorisé.

## Installation

### Installer une release

Téléchargez la [dernière release GitHub](https://github.com/Louisdelez/dowze-academie/releases/latest), puis choisissez l’artefact adapté :

| Système | Architecture | Artefact principal |
| --- | --- | --- |
| macOS | Apple Silicon | `Dowze-Academie-v0.1.0-macos-arm64.dmg` |
| macOS | Intel | `Dowze-Academie-v0.1.0-macos-x64.dmg` |
| Windows | x64 | `Dowze-Academie-v0.1.0-windows-x64-setup.exe` |
| Linux | x64 | `Dowze-Academie-v0.1.0-linux-x64.AppImage` ou paquet `.deb` |

Le fichier `SHA256SUMS.txt` de la release permet de vérifier l’intégrité des téléchargements. Les avertissements de sécurité liés à l’absence de notarisation macOS ou de signature Windows sont détaillés dans les [limites connues](./docs/LIMITES.md).

La release publie uniquement les deux DMG macOS comme formats d’installation Apple ; choisissez celui qui correspond à l’architecture de votre Mac.

Sous Linux, rendez l’AppImage exécutable avec `chmod +x Dowze-Academie-*.AppImage`, puis lancez-la directement. Si FUSE n’est pas disponible sur votre distribution, utilisez le paquet `.deb` à la place.

### Construire depuis les sources

#### Prérequis

- macOS, Windows ou Linux et les [prérequis système Tauri 2](https://v2.tauri.app/start/prerequisites/) correspondants ;
- Node.js `20.19+` ou `22.12+`, avec npm ;
- Rust stable et Cargo ;
- sous macOS, les outils de ligne de commande Xcode.

```bash
git clone https://github.com/Louisdelez/dowze-academie.git
cd dowze-academie
npm ci
npm run tauri -- dev
```

Pour prévisualiser seulement l’interface dans un navigateur :

```bash
npm run dev
```

Cette prévisualisation ne reproduit pas les garanties natives : coffre sécurisé du système, Argon2id natif, gestion privée des PDF et WebViews intégrées y sont absents ou simulés.

## Vérification

```bash
npm run build
npm run test:unit
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm audit --audit-level=low
```

`npm run test:ui` démarre automatiquement Vite sur `127.0.0.1:1421` et exécute les parcours Playwright séquentiellement.

## Construire l’application

```bash
# macOS
npm run tauri -- build --bundles dmg

# Windows
npm run tauri -- build --bundles nsis

# Linux
npm run tauri -- build --bundles appimage,deb
```

Les bundles sont produits sous `src-tauri/target/release/bundle/`. Le workflow `Desktop release` construit nativement les deux architectures macOS, Windows x64 et Linux x64 ; un déclenchement manuel effectue un préflight sans release, tandis qu’un tag `vX.Y.Z` publie les artefacts après validation de toute la matrice.

## Limites principales

- Le profil de la WebView intégrée est distinct du navigateur système. Certains fournisseurs OAuth peuvent refuser un navigateur embarqué ; Dowze Academie ne contourne pas ce refus.
- L’export `.ics` est un instantané ponctuel, pas une synchronisation bidirectionnelle.
- Les automatismes liés aux sites tiers peuvent évoluer avec leur interface ; la copie de consigne et l’association manuelle restent disponibles en secours.
- L’application ne lit pas les réponses privées affichées par les services IA : l’archivage des PDF, de la note et de l’appréciation reste explicite.
- Le parcours d’anglais est aligné sur les objectifs du CECRL mais ne délivre aucune certification.

La liste détaillée se trouve dans [Limites connues](./docs/LIMITES.md).

## Documentation

- [Guide d’utilisation](./docs/UTILISATION.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Développement et validation](./docs/DEVELOPPEMENT.md)
- [Confidentialité et modèle de sécurité](./docs/CONFIDENTIALITE.md)
- [Limites connues](./docs/LIMITES.md)
- [Historique des versions](./CHANGELOG.md)
- [Contribuer](./CONTRIBUTING.md)
- [Signaler une vulnérabilité](./SECURITY.md)

## Licence et marques

Le code et les ressources de ce dépôt sont distribués sous [licence MIT](./LICENSE), copyright © 2026 Louis Délez.

Les noms ChatGPT, Claude, Gemini, Mistral, DeepSeek, Kimi, Duolingo, Khan Academy, YouTube, TikTok, NotebookLM, Apple et Google appartiennent à leurs titulaires respectifs. Dowze Academie est un projet indépendant, sans affiliation ni approbation de leur part.
