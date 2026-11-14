# Mises à jour automatiques Dowze Académie — 7 octobre 2026

## Comportement

Version desktop 0.6.1. Vérification au démarrage après ouverture (15 secondes), toutes les six heures, et à la reconnexion. Une version disponible est téléchargée automatiquement en arrière-plan sans installer, interrompre la session ni redémarrer pendant le travail.

Le téléchargement est conservé dans le cache natif signed-updates. Le paquet et le manifeste sont écrits séparément puis validés par renommage ; le manifeste n'est publié localement qu'après écriture et synchronisation disque du paquet. Le téléchargement est vérifié par Tauri puis par une vérification indépendante Minisign avec la clé publique existante et la version du commentaire signé. Au lancement suivant, avant l'ouverture de la session, le cache est vérifié à nouveau (taille, SHA256, signature globale et version). Les versions égales/anciennes sont ignorées. Un échec ne bloque pas l'ouverture de l'application.

Linux AppImage peut appliquer un cache valide hors ligne ; ancien AppImage conservé à côté avant remplacement. Windows/macOS utilisent l'installateur natif Tauri après confirmation du manifeste serveur ; hors ligne, l'installation est différée et la version actuelle s'ouvre. Les opérations manuelles de vérification et de redémarrage restent disponibles dans Réglages.

Le client Dell est passé du dossier extrait à un AppImage dans /home/louis/Applications/DowzeAcademie.AppImage, avec lanceur /home/louis/.local/bin/dowze-academie et entrée desktop. Données et comptes utilisent le même identifiant com.etude.desktop et restent hors de l'exécutable. Aucun module Hermes réactivé.

## Vérification

- TypeScript/Vite et Rust release compilés.
- Tests JS : téléchargement automatique unique, absence d'installation/redémarrage en session, rejet signature, tests cache et synchronisation préexistants.
- Trois tests Rust : versions sans downgrade, cache modifié refusé, signature valide vérifiée puis changement de version ou de clé refusé. Clé de fixture temporaire supprimée ; clé de confiance produit inchangée.
- Recette native finale : fermeture normale par WM_DELETE_WINDOW réussie, réouverture ; cache signé avec une clé de fixture refusé au démarrage, version actuelle ouverte, fichiers de test retirés. Compte test connecté, 1115 événements et synchronisation serveur conservés.
- Test de lancement initial a identifié une permission manquante ; commandes limitées à la webview principale ajoutées dans main-commands. Le démarrage ne dépend plus du succès d'une mise à jour.

## Publication

Catalogue public actuellement 0.6.0. La version 0.6.1 ne doit pas être déclarée publiée sans signature. La clé privée originale n'a pas été retrouvée malgré inspection des références locales et du coffre ; emplacement demandé au propriétaire. Aucun changement de clé effectué. La préparation de release existante conserve l'exigence d'artefacts signés pour les plateformes annoncées et utilise désormais academie.dowze.ch. Les autres installations ne recevront 0.6.1 qu'après publication de leurs paquets signés.

Référence du mécanisme Tauri : https://v2.tauri.app/plugin/updater/ . Source : /home/louis/DowzeBuild/20260923/collections-060/src-tauri/src/automatic_updates.rs et src/lib/nativeUpdates.ts.

## Clôture vérifiée — 7 octobre 2026

Louis a demandé de terminer la configuration sans lui demander de fournir une clé. La clé historique n'a pas été retrouvée dans les emplacements consultés. Une nouvelle clé a été créée et conservée avec permissions 0600 sur Dowze-01 dans `/srv/dowze/academie/config/release-signing/signing.key`, répertoire 0700. Une copie privée de construction reste dans `~/.local/state/dowze-release`, 0700/0600. Aucun secret n'est inclus dans ce bilan. La sauvegarde chiffrée du serveur inclut `/srv/dowze/academie`, donc cette référence. Les anciens installateurs, le manifeste stable historique et le fichier installé avant transition sont conservés. Les anciennes installations faisant confiance à l'ancienne clé ne reçoivent pas silencieusement la nouvelle clé : le Dell a été explicitement réinstallé comme amorçage de confiance sous la demande propriétaire.

Le canal par plateforme `https://academie.dowze.ch/updates/v2/linux-x86_64.json` publie 0.6.2. Le fichier public de 132557304 octets et sa signature avec version liée ont été vérifiés avant publication ; sa somme HTTPS est `56a7dfea9ff19486745bda0c7dfbac6c7111db1b569a17b9762a9d0e6f195c53`. Le lien AppImage du site pointe désormais vers cette version, avec version propre à chaque plateforme. Windows, RPM et Mac historiques restent en 0.6.0 ; aucune qualification physique ni nouvelle publication de ces plateformes n'est revendiquée.

Recette réelle sur Dell : 0.6.1 avec nouveau canal démarre normalement ; sans clic de téléchargement, la version 0.6.2 est téléchargée et vérifiée en arrière-plan. L'AppImage installée reste inchangée pendant la session. Fermeture normale puis relancement : remplacement atomique et redémarrage sur le binaire exact de 0.6.2, vérifié par l'empreinte de `/proc/PID/exe`. Le journal pending est supprimé. Le compte test est toujours connecté, les 11 matières sont toujours visibles. Preuve : `real-upgrade-verification.json`, `native-verification.json`, `public-manifest.json`, `release-0.6.2-proof.json`. Aucun appel de connexion ni perte de données observé.

Les nouveaux fichiers avaient initialement une étiquette SELinux var_t suite à restorecon ; ce défaut est corrigé en héritant l'étiquette container_file_t et ses catégories du répertoire public. HTTPS et téléchargement intégral vérifiés ensuite. Les futures publications doivent conserver cette étiquette et remplacer le manifeste en dernier, après vérification de la signature et de l'empreinte. Ne pas remplacer le manifeste global avec une version Linux assortie des anciens artefacts Windows/Mac.

La mémoire ops-memory est actuellement indisponible : socket absent, service inactif par échec de dépendance constaté. Le présent bilan conserve le passage de relais local ; aucune ingestion mémoire distante réussie n'est prétendue. Le souvenir 8032138d-fe13-45a9-b015-77d5263db6ec doit être corrigé dès que le service revient : publication et recette réelle Dell sont maintenant terminées.
