# Développement et validation

## Environnement requis

- macOS ;
- Node.js `^20.19.0` ou `>=22.12.0` ;
- npm ;
- Rust stable avec Cargo ;
- Xcode Command Line Tools et les prérequis système de Tauri 2.

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
| `npm run tauri -- build` | Bundle natif de production |

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
- 70/70 tests Rust réussis ;
- formatage Rust et Clippy strict réussis ;
- audit npm : 0 vulnérabilité connue.

Vite signale encore deux chunks supérieurs à 500 ko : le cœur de l’interface et l’éditeur Markdown chargé à la demande. Cet avertissement de taille n’empêche pas le build.

## Build macOS

```bash
npm run tauri -- build
```

Les sorties se trouvent sous `src-tauri/target/release/bundle/`. La présence d’un `.app` ou d’un `.dmg` ne prouve pas qu’il est prêt à être distribué : contrôlez son architecture, sa signature et sa notarisation.

Le DMG 0.1.0 vérifié le 8 septembre 2026 est un build x86_64 de 10 424 026 octets, SHA-256 `d960b140ca157a8075584e179240d523a759606b8c7eb2b78fea2cdba3cc5b62`. `hdiutil verify` le déclare valide, mais l’application reste non signée et non notarisée ; cet artefact généré n’est pas versionné dans le dépôt.

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
