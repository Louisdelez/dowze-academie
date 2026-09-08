# Confidentialité et modèle de sécurité

Dowze Academie privilégie le stockage local, mais peut communiquer avec des services choisis par l’utilisateur. Cette page précise les frontières afin d’éviter d’assimiler « local-first » à « hors ligne ».

## Où vont les données ?

| Donnée | Stockage ou destination | Portée |
| --- | --- | --- |
| Profil, progression, planning, tâches, notes et résultats | Stockage local de l’appareil | Profil Dowze Academie |
| Vérificateur du mot de passe | Registre natif privé, sous forme Argon2id | Compte local |
| Identifiants de reconnexion, si activée | Coffre sécurisé du système | Application sur cet appareil |
| Clés API du Chat libre | Coffre sécurisé du système | Application sur cet appareil |
| Conversations du Chat libre | Données locales, puis backend choisi à l’envoi | Profil local et fournisseur choisi |
| Cookies et sessions des sites | Profil persistant de la WebView native | Application sur cet appareil |
| PDF archivés | Dossier privé géré par Tauri | Profil et évaluation |
| Export JSON | Emplacement explicitement choisi | Fichier utilisateur |

## Comptes locaux

Les comptes ne sont pas synchronisés avec un serveur Dowze Academie. Le registre natif stocke un vérificateur Argon2id, pas le mot de passe en clair. Sans l’option de reconnexion, la session disparaît avec le processus de l’application.

Lorsque **Se souvenir de moi sur cet appareil** est activé, l’identifiant, le mot de passe et l’identifiant interne du compte sont conservés comme secret dans le coffre du système : Trousseau macOS, Gestionnaire d’identifiants Windows ou service Secret Service Linux. Ils servent à refaire une authentification Argon2id au prochain lancement. Toute personne pouvant ouvrir la session système déverrouillée peut alors potentiellement accéder au profil tant que cette option n’a pas été révoquée. Sous Linux, l’opération échoue explicitement si aucun service Secret Service persistant et déverrouillé n’est disponible.

Il n’existe pas encore de récupération distante. Perdre le mot de passe d’un compte non mémorisé peut rendre son espace inaccessible.

## Isolation des profils

Les données fonctionnelles et les PDF sont séparés par identifiant de profil. Les changements de compte ferment le panneau distant afin d’éviter d’afficher à un profil une page laissée ouverte par le précédent.

Les cookies des fournisseurs web et les clés API restent toutefois des réglages de l’application sur l’appareil, pas des secrets séparés par profil Dowze Academie. Un utilisateur partageant la même session système doit se déconnecter des services tiers s’il ne souhaite pas réutiliser leurs sessions.

## Services web intégrés

Les pages distantes s’exécutent dans des WebViews sans permission Tauri. Dowze Academie n’enregistre pas leurs mots de passe ou messages. Chaque fournisseur reste responsable de son service, de ses cookies et de sa politique de confidentialité.

Le profil de la WebView native n’est pas celui du navigateur système. Le bouton d’ouverture dans le navigateur système ne transfère aucun cookie vers l’application.

Sur macOS, la suppression Google cible les données WebKit liées à une liste fermée de domaines Google et YouTube. Elle ne supprime pas le compte en ligne et ne garantit pas la déconnexion des sessions propres aux domaines d’autres fournisseurs. Cette commande est désactivée sous Windows et Linux tant qu’une suppression ciblée équivalente n’est pas implémentée.

## Chat libre

Les conversations sont conservées localement pour pouvoir être reprises. Lors d’un envoi, le contenu est transmis au backend explicitement choisi : API prise en charge, endpoint HTTPS compatible OpenAI ou Ollama local.

Le backend Rust refuse les destinations distantes non HTTPS, les redirections et les plages réseau locales ou privées pour les endpoints configurables. Ollama est limité à la boucle locale et à l’adresse `http://127.0.0.1:11434`.

## Fichiers et exports

Les PDF sélectionnés sont validés puis copiés dans l’espace privé de l’application, avec une limite de 64 Mio par fichier. Les originaux ne sont pas modifiés. L’export JSON contient des métadonnées mais pas les binaires PDF, les clés API, les cookies ou les mots de passe.

## Ce que le projet ne garantit pas encore

- aucun audit de sécurité indépendant n’a été publié ;
- aucune synchronisation chiffrée entre appareils n’existe ;
- aucun mécanisme complet d’import ou de restauration d’un export JSON n’est disponible ;
- les politiques, pages et mécanismes OAuth tiers peuvent changer sans préavis.

Pour une vulnérabilité, suivez la [politique de signalement](../SECURITY.md) et ne publiez aucun secret dans une issue.
