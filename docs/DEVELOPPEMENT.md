# Développement et contrôles

## Prérequis

Node et npm compatibles avec `package.json`, Rust/Cargo, et prérequis système Tauri 2 pour la plateforme visée. Le manifeste npm annonce `^20.19.0 || >=22.12.0` ; vérifier également les exigences de la version verrouillée de Vite avant de choisir le runtime. Les versions effectivement verrouillées sont dans `package-lock.json` et `src-tauri/Cargo.lock`. macOS est configuré pour 13.0 minimum.

## Installer les dépendances

Depuis la racine du dépôt : `npm ci`. Les dépendances ne sont pas vendoriées. La copie locale Dell peut utiliser un lien `node_modules` vers le cache de travail existant ; ce lien est ignoré par Git et n’est pas requis par les autres machines.

## Commandes

| Commande | Résultat |
| --- | --- |
| `npm run dev` | Frontend bureau dans le navigateur, port 1420 |
| `npm run tauri -- dev` | Application native de développement |
| `npm run build` | Vérification TS puis bundle bureau |
| `npx tsc --noEmit -p tsconfig.pwa.json` | Vérification des types PWA |
| `npx vite build --config vite.pwa.config.ts` | Bundle PWA dans `pwa-dist/` |
| `npm run test:unit` | Suite des fichiers `tests/*.test.ts` présents |
| `npm run test:ui` | Parcours UI historiques ; vérifier les prérequis du pilote |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Tests Rust |
| `python3 tools/verify_repository.py` | Intégrité légère de la consolidation |

Certains pilotes de qualification historiques contiennent des chemins absolus ou attendent des fixtures externes. Leur présence n’implique pas qu’une seule commande valide toute la refonte. Les tests de consolidation ne remplacent pas les recettes fonctionnelles, réseau, appareil et stylet.

## Protection du Dell

Ne pas lancer Vite, TypeScript, Cargo ou les suites de tests directement sur cette machine. Employer le garde-fou conservé :

```bash
bash scripts/run-dell-safe-check.sh -- npm run build
```

Ce lanceur borne mémoire, CPU, swap et durée, et refuse un démarrage si la mémoire disponible est insuffisante. Exécuter un seul contrôle lourd à la fois. Une compilation isolée distante doit disposer de ses propres limites. La consolidation du 14 novembre n’a lancé aucun build ni installé de paquet.

## Reconstituer la branche Notes préparatoire

```bash
python3 tools/materialize_notes.py /chemin/vers/nouveau-dossier-vide
```

L’outil écrit uniquement dans une destination inexistante, vérifie les empreintes des 619 fichiers attendus, et n’installe rien. Il restaure les octets historiques exacts du fichier Vite de qualification ; adapter sa sortie absolue avant un futur build portable. La version principale garde sa correction de portabilité `pwa-dist/`.

## Publication

Le workflow GitHub Actions existant est conservé comme historique de release. Son contrôle macOS doit être réconcilié avec la valeur 13.0 avant une nouvelle livraison. Aucun tag ni exécution de release n’est créé par la consolidation. Les clés de signature ne sont jamais commitées.
