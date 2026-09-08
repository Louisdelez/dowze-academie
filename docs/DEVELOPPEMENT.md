# Développement et validation

## Environnement requis

- macOS, Windows ou Linux ;
- Node.js `^20.19.0` ou `>=22.12.0` ;
- npm ;
- Rust stable avec Cargo ;
- les [prérequis système de Tauri 2](https://v2.tauri.app/start/prerequisites/) pour la plateforme ciblée.

macOS demande les Xcode Command Line Tools. Windows demande les outils de build C++ Microsoft et WebView2. Sur Ubuntu 22.04, installez notamment WebKitGTK 4.1, libayatana-appindicator, librsvg, `libdbus-1-dev`, `pkg-config` et `patchelf` ; le workflow de release contient la liste reproductible utilisée en CI. À l’exécution sous Linux, les comptes locaux exigent aussi une session D-Bus et un service compatible Secret Service accessible et déverrouillé.

Vérifiez l’environnement :

```bash
node --version
npm --version
rustc --version
cargo --version
```

## Installation reproductible

```bash
npm ci
```

Le fichier `package-lock.json` est la référence des dépendances JavaScript. `src-tauri/Cargo.lock` joue le même rôle pour Rust.

## Commandes utiles

| Commande | Usage |
| --- | --- |
| `npm run dev` | Prévisualisation web sur le port 1420 |
| `npm run tauri -- dev` | Application native en développement |
| `npm run build` | Vérification TypeScript puis bundle Vite |
| `npm run test:unit` | Tests unitaires TypeScript |
| `npm run test:ui` | Parcours Playwright avec serveur isolé sur le port 1421 |
| `npm run test:all` | Tests unitaires puis UI |
| `npm run tauri -- build --bundles dmg` | DMG de production sur macOS |
| `npm run tauri -- build --bundles nsis` | Installateur NSIS de production sur Windows |
| `npm run tauri -- build --bundles appimage,deb` | AppImage et paquet Debian de production sur Linux |

## Validation complète

```bash
npm run build
npm run test:unit
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm audit --audit-level=low
```

Pour un changement ciblé, commencez par les tests concernés, puis exécutez la suite complète avant livraison.

### Référence validée le 8 septembre 2026

- build frontend réussi, avec 3 851 modules transformés ;
- 152/152 tests unitaires TypeScript réussis ;
- 16/16 parcours UI Playwright réussis ;
- 71/71 tests Rust réussis ;
- formatage Rust et Clippy strict réussis ;
- audit npm : 0 vulnérabilité connue.

Vite signale encore deux chunks supérieurs à 500 ko : le cœur de l’interface et l’éditeur Markdown chargé à la demande. Cet avertissement de taille n’empêche pas le build.

## Builds de bureau

Exécutez sur le système concerné la commande `--bundles` du tableau ci-dessus. Les sorties se trouvent sous `src-tauri/target/release/bundle/`. Pour macOS, l’architecture correspond à celle de la cible Rust choisie ; la matrice CI fixe explicitement ARM64 ou x64. Les sommes de contrôle des bundles publics sont publiées avec chaque release plutôt que consignées dans le dépôt.

## Release GitHub multiplateforme

Le workflow [`.github/workflows/desktop-release.yml`](../.github/workflows/desktop-release.yml) possède deux modes :

- `workflow_dispatch` construit les quatre cibles et conserve les bundles comme artefacts Actions sans créer de release ;
- un tag `vX.Y.Z`, strictement égal à la version Tauri, construit les mêmes cibles dans une release brouillon.

La release n’est rendue publique qu’après la réussite complète de la matrice, la présence des artefacts attendus et la génération de `SHA256SUMS.txt`. Les cibles 0.1.0 sont macOS Apple Silicon, macOS Intel, Windows x64 et Linux x64. Linux produit volontairement AppImage et `.deb`, pas RPM, afin d’éviter le chemin de bundling RPM instable avec la version actuelle de Tauri CLI. L’action Tauri joint également une archive `.app.tar.gz` secondaire pour chaque build macOS ; le DMG reste le format d’installation recommandé.

Les applications macOS reçoivent une signature ad hoc (`-`) mais ne sont pas signées Developer ID ni notarisées. L’installateur Windows n’est pas signé. Il faut ajouter les certificats et secrets de CI appropriés avant de présenter ces artefacts comme une distribution vérifiée par les éditeurs des systèmes.

## Règles de compatibilité

Le nom public est **Dowze Academie**, mais plusieurs identifiants `etude` sont une couche de compatibilité : clés de stockage, services Trousseau, UID iCalendar et bundle ID. Leur remplacement direct ferait perdre l’accès apparent à des données ou créerait des doublons d’agenda.

Toute évolution de ces identifiants doit inclure :

1. un schéma de migration versionné ;
2. un retour arrière en cas d’échec ;
3. des tests avec plusieurs profils ;
4. une vérification des PDF, secrets et sessions existants ;
5. une note de migration publique.

## Style de contribution

- Gardez les textes d’interface en français.
- Préservez les états d’erreur explicites et les contrôles d’accessibilité.
- Ne journalisez jamais de secret, de contenu OAuth ou de données utilisateur.
- Ne présentez pas une simulation navigateur comme une validation native.
- Mettez la documentation à jour avec le comportement réellement vérifié.
