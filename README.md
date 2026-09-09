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
- **Planning académique** — vues année, mois, semaine et jour, événements personnels, tâches et export iCalendar vers le calendrier de l’appareil ou Google Agenda.
- **Évaluations sur papier** — préparation de sujets et corrigés PDF, archivage local des copies, notes sur 20, coefficients et appréciations.
- **Espace de notes** — éditeur Markdown visuel, onglets globaux, tags et association d’une même note à plusieurs matières.
- **Assistants au choix** — pages officielles de plusieurs services dans une WebView native persistante, fonctions vocales propres aux sites après autorisation du microphone, plus un Chat libre pour des API compatibles ou Ollama local.
- **Profils locaux** — comptes protégés par Argon2id, espaces de travail séparés et reconnexion facultative via le coffre sécurisé du système.

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
