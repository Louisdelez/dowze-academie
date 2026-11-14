# Confidentialité

Le bureau conserve des données et caches par profil ; la PWA utilise le stockage de son navigateur. Les documents synchronisés, comptes et médias passent par l’API configurée. Le stockage local ne signifie donc pas que le service fonctionne exclusivement hors ligne.

Les secrets natifs utilisent le coffre du système lorsque cette fonction est disponible. Les cookies des sites IA appartiennent au profil de WebView ; ils ne sont pas automatiquement ceux du navigateur système. Les fournisseurs intégrés ont leurs propres conditions de traitement des messages et de l’audio.

Cette consolidation publie le code, les tests et les ressources publiques. Elle exclut : mots de passe, tokens, clés privées, fichiers `.env` réels, bases SQLite/PostgreSQL, sauvegardes utilisateur, cookies, sessions et journaux d’administration. Les clés publiques de vérification et les données synthétiques des tests ne sont pas des identifiants de production.

Le dossier local `local/` est ignoré par Git ; son contenu est décrit dans l’inventaire local. Les permissions et sauvegardes de la production actuelle restent à vérifier avec l’accès d’administration : aucun résultat complet de sécurité n’est déduit des seules réponses HTTP 200.

Les anciens documents sous `docs/application-source/` sont datés et peuvent décrire un état antérieur. Cette page et l’audit du 14 novembre prennent priorité pour décrire la consolidation actuelle.
