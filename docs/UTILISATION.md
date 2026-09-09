# Guide d’utilisation

Ce guide décrit Dowze Academie 0.1.0 sur macOS, Windows et Linux. Les données et comptes présentés ici sont locaux à l’application ; ils ne créent aucun compte sur le site d’un fournisseur tiers.

## 1. Créer un profil local

Au premier lancement, choisissez **Créer ton compte**, puis renseignez un nom affiché, un identifiant et un mot de passe d’au moins 10 caractères. Chaque nouveau profil commence avec un cursus vierge et son propre espace de progression, de planning, de notes, de résultats et de documents.

À la connexion, **Se souvenir de moi sur cet appareil** reste désactivé par défaut. Si vous l’activez dans l’application native, les identifiants de reconnexion sont confiés au coffre sécurisé du système — Trousseau macOS, Gestionnaire d’identifiants Windows ou Secret Service Linux — et le mot de passe est de nouveau vérifié par Argon2id au prochain lancement. Une déconnexion explicite révoque cette reconnexion.

Il n’existe ni récupération distante du mot de passe, ni synchronisation entre plusieurs appareils.

## 2. Naviguer dans le cursus

La barre latérale donne accès à l’accueil, au planning, aux cours, aux notes et évaluations, aux tâches et aux réglages.

Sur macOS, maintenez le bouton principal de la souris dans une zone vide en haut du rail gauche, de la barre d’onglets centrale ou du panneau IA, puis faites glisser pour déplacer la fenêtre. Les boutons et les onglets restent interactifs et ne servent pas de poignée.

Dans **Cours**, choisissez une matière, puis un chapitre et une notion atomique. Deux parcours indépendants sont proposés :

- **Cours** pour l’explication guidée ;
- **Exercices** pour l’entraînement, les indices et la correction.

Une conversation existante est reprise selon la matière, la notion, le mode et le fournisseur. Les sessions vides ne sont pas enregistrées dans l’historique.

### Anglais

La première ouverture de la matière Anglais demande un niveau de A1 à C2. Ce choix est mémorisé dans le profil. L’action **Niveau mal adapté ? Changer** permet de sélectionner un autre parcours sans supprimer la progression des niveaux précédents.

Le programme est aligné sur les objectifs du CECRL, mais ne constitue ni un examen officiel, ni une certification, ni une garantie d’acquisition complète du niveau.

## 3. Utiliser le planning

Le planning possède des vues Année, Mois, Semaine et Jour.

- Un clic principal sur un événement lié à une matière ouvre directement son programme.
- Un événement sans matière ouvre la journée correspondante.
- Pour modifier un événement, utilisez le clic droit puis **Modifier**.
- Au clavier, le même menu est disponible avec `Maj+F10` ou la touche Menu.

Ce comportement évite de lancer une session IA par erreur depuis le calendrier.

### Exporter vers un agenda

Choisissez **Envoyer vers un agenda**, sélectionnez les catégories, puis le calendrier de l’appareil, Google Agenda ou un fichier `.ics`.

L’export est un instantané : une modification ultérieure dans Dowze Academie ne met pas à jour automatiquement les événements déjà importés. Utilisez de préférence un calendrier de destination séparé afin de pouvoir remplacer un ancien export proprement.

## 4. Prendre des notes

La barre d’onglets centrale garde la page courante et les notes ouvertes. Le bouton `+` permet de créer une note ou d’en rouvrir une existante.

Chaque note :

- est enregistrée automatiquement ;
- peut être renommée et étiquetée ;
- peut être associée à zéro, une ou plusieurs matières ;
- reste enregistrée lorsqu’on ferme son onglet ;
- peut être exportée au format Markdown.

Fermer un onglet ne supprime jamais le document. Une note associée à plusieurs matières apparaît comme la même référence dans chacune d’elles.

## 5. Préparer et classer une évaluation

Les mini-tests de chapitre et les événements d’évaluation préparent une consigne destinée au fournisseur IA choisi. Le flux demande deux documents distincts : un sujet A4 imprimable et un corrigé enseignant avec barème sur 20.

Après avoir réalisé puis scanné une copie, revenez dans la conversation d’origine pour demander la correction. La note, l’appréciation et les PDF à archiver doivent ensuite être confirmés ou sélectionnés explicitement dans Dowze Academie. L’application ne lit pas automatiquement le contenu privé affiché sur le site du fournisseur.

Les PDF sélectionnés sont copiés dans le dossier privé du profil. L’original n’est pas modifié.

## 6. Choisir un assistant

Le panneau droit propose des pages officielles de services tiers et un **Chat libre** intégré.

Pour un assistant web, Dowze Academie prépare la consigne et tente de l’insérer. Si l’éditeur du site a changé, utilisez **Consigne** pour la recopier puis collez-la manuellement. L’action **Associer** permet aussi d’enregistrer manuellement l’URL d’une conversation.

Duolingo et Khan Academy sont des plateformes autonomes : leur page officielle conserve sa propre session, mais Dowze Academie n’y copie ni n’injecte la consigne du cours et ne crée pas d’entrée dans l’historique IA. YouTube et TikTok reçoivent plutôt une recherche pédagogique ciblée ; NotebookLM reçoit un contexte adapté à son fonctionnement par sources.

### Dictée et conversation vocale

Dans l’application macOS, cliquez d’abord sur le bouton microphone **Autoriser la dictée et les appels** dans la barre supérieure du panneau web. Au premier clic, acceptez la demande macOS pour **Dowze Academie**. L’application consulte l’état AVFoundation, demande le consentement s’il est encore indéterminé, puis recharge la page après accord. Cette étape ne démarre aucun enregistrement et son refus ne bloque pas les fonctions textuelles.

Les boutons de microphone ou d’appel proposés par ChatGPT et les autres sites compatibles peuvent ensuite utiliser le microphone à travers leur page officielle. L’autorisation bénéficie à tous les services web intégrés qui exposent eux-mêmes une fonction vocale ; elle ne crée pas une fonction absente chez un fournisseur.

Si l’accès a déjà été refusé, ouvrez **Réglages Système → Confidentialité et sécurité → Microphone**, activez **Dowze Academie**, puis relancez complètement l’application et rechargez le service. La disponibilité dépend aussi du compte, de l’offre, du déploiement et de la compatibilité WKWebView du fournisseur. L’audio est traité par le fournisseur actif selon ses propres règles ; Dowze Academie ne l’enregistre pas dans ses données locales. Cette activation native est un changement non publié après la version 0.1.0.

### Chat libre et Ollama

Le Chat libre peut utiliser un fournisseur d’API pris en charge, un endpoint HTTPS compatible OpenAI ou Ollama sur l’adresse fixe `http://127.0.0.1:11434`.

Pour Ollama :

1. lancez Ollama et installez au moins un modèle ;
2. ouvrez **Chat libre → Réglages** ;
3. choisissez **Détecter Ollama**.

Les conversations du Chat libre sont enregistrées localement. Leur contenu est transmis au backend choisi au moment de l’envoi.

## 7. Gérer la session Google intégrée

La rubrique **Réglages → Compte Google** ouvre une fenêtre utilisant le même profil de WebView que les services intégrés. Chaque service garde toutefois sa propre session et peut redemander une confirmation.

Sur macOS, **Retirer Google de Dowze Academie…** ferme les fenêtres distantes et supprime les données WebKit rattachées aux domaines Google et YouTube. Cette suppression ciblée n’est pas encore disponible sous Windows ou Linux ; le bouton y est désactivé. Elle ne supprime jamais le compte Google en ligne et n’efface pas automatiquement les cookies propres aux domaines de ChatGPT, Claude, Duolingo ou Khan Academy.

Google peut refuser les navigateurs embarqués. Dans ce cas, utilisez le navigateur système ; ses cookies ne sont pas transférés dans l’application.

## 8. Exporter les données

Dans **Réglages → Données locales**, l’export JSON contient les programmes, événements, tâches, notes, résultats et métadonnées. Il n’embarque pas le contenu binaire des PDF ni les secrets du coffre sécurisé du système.

L’import complet d’un export JSON n’est pas encore disponible. Conservez aussi vos documents originaux.
