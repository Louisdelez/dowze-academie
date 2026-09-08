# Contribuer à Dowze Academie

Merci de l’intérêt porté au projet. Les contributions doivent préserver son approche local-first, ses limites de sécurité et la cohérence du parcours pédagogique.

## Avant de commencer

1. Vérifiez qu’une issue ne couvre pas déjà le sujet.
2. Pour un changement important d’architecture, de persistance ou d’expérience utilisateur, ouvrez d’abord une issue afin d’aligner le périmètre.
3. Ne joignez jamais de mot de passe, clé API, cookie, export utilisateur, PDF personnel ou capture contenant des données privées.

## Développement

```bash
npm ci
npm run tauri -- dev
```

Créez une branche courte et gardez chaque commit centré sur un changement cohérent. Le code visible par l’utilisateur et la documentation sont rédigés en français.

## Validation attendue

Au minimum :

```bash
npm run build
npm run test:unit
```

Avant une pull request qui touche l’interface, la persistance ou la partie native :

```bash
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Décrivez dans la pull request le comportement modifié, les commandes réellement exécutées et les limites qui restent non testées.

## Compatibilité des données

Les préfixes `etude.*`, certains identifiants du coffre sécurisé et l’identifiant de bundle historique sont conservés pour que les installations existantes retrouvent leurs données. Ne les renommez pas sans migration versionnée, testée et réversible.

En contribuant, vous acceptez que votre travail soit distribué sous la [licence MIT](./LICENSE) du projet.
