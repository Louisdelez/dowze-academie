# Déploiement et exploitation

## État observé le 14 novembre 2026

- Le frontal HTTPS sert `academie.dowze.ch` et relaie vers Epic‑01.
- Le répertoire de service est `/srv/epicube/dowze/academie` ; le marqueur de migration est daté du 4 novembre.
- Les fichiers publics, le catalogue de distribution et le shell PWA sont lisibles. Les releases nommées `notes-managed-20261016` et `notebook-reference-20261013` existent ; leurs sources utiles et le contexte scellé ont ensuite été récupérés avec l’accès administrateur.
- Le NAS ne montre plus de conteneur Dowze/Académie ni l’ancien répertoire de projet vérifié. Le site « Dossier de Formation » est distinct.
- L’ancien hôte Dowze‑01 n’est pas joignable depuis le Dell par la route SSH configurée.

## Séparation des déploiements

Le site et la PWA sont des ressources statiques. L’API dépend de la base, des blobs, des secrets et du validateur des carnets. Copier du JavaScript ne migre pas une base ; changer un DNS ne vérifie pas une sauvegarde.

`server/api/Dockerfile.development` fournit uniquement un conteneur de développement SQLite. Le Dockerfile historique de production est conservé sous `Dockerfile.production-reference`. Il nécessite une image de base par digest, le runtime Node scellé, son worker, ses fixtures et son manifeste. Le contexte scellé et ses artefacts sont maintenant récupérés. Le binaire Node et les images de l’API, du web et de l’image de base sont conservés localement hors Git ; le schéma SQL est versionné. Une nouvelle base, son rôle et le fichier de connexion privé doivent être configurés sur une machine de reprise ; aucune donnée ni clé privée n’est fournie publiquement. Voir `SERVER-RECOVERY.md`.

## Procédure pour une future livraison

1. Identifier l’image et la base courantes avec l’accès d’administration autorisé ; exporter un inventaire sans secrets.
2. Sauvegarder la base dans un format cohérent et les blobs liés ; conserver version, empreintes, migrations et date.
3. Restaurer sur un environnement isolé et vérifier comptes, documents, médias et références ; une copie de fichiers seule ne suffit pas.
4. Qualifier le client bureau, la PWA et l’API sur le même contrat. Conserver les contrôles de scellement et de révision.
5. Construire et signer les paquets ; publier d’abord les artefacts, puis les métadonnées d’updater correspondant exactement à leurs empreintes.
6. Vérifier HTTPS, `/healthz`, authentification, lecture/écriture, synchronisation, reprise hors ligne et mises à jour sur un appareil de test.
7. Conserver l’ancienne image et la sauvegarde pour un retour arrière compatible avec le schéma de données. Ne jamais remplacer les volumes de données par ceux d’un test.

## Écarts à corriger avant prochaine release

Le catalogue public annonce 0.12.7, mais macOS, Windows et RPM pointent encore vers 0.6.0. Le fichier `SHA256SUMS.txt` contient lui aussi un ancien AppImage 0.6.0 ; il n’est pas un manifeste de la seule release courante. L’updater Tauri utilise `/updates/v2/…` avec signature exigée ; ses clés privées restent hors Git.

Les modèles de `infra/` sont explicitement des exemples ; aucun n’a remplacé la configuration serveur existante pendant cet audit.
