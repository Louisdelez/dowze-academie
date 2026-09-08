# Limites connues

Cette liste décrit les limites de Dowze Academie 0.1.0. Elles font partie du périmètre public du projet et ne doivent pas être présentées comme déjà résolues.

## Distribution

- La release GitHub fournit des builds natifs pour macOS Apple Silicon, macOS Intel, Windows x64 et Linux x64 ; elle ne couvre pas encore Windows ARM ni Linux ARM.
- Les applications macOS utilisent une signature ad hoc, sans certificat Apple Developer ID ni notarisation. Gatekeeper peut demander une autorisation explicite.
- L’installateur Windows n’est pas signé et Microsoft Defender SmartScreen peut afficher un avertissement. Les paquets Linux ne disposent pas d’une signature de dépôt.
- Aucun mécanisme de mise à jour automatique n’est encore configuré.
- La compilation CI prouve le packaging sur chaque système, pas tous les parcours réels avec un bureau, un trousseau déverrouillé et des comptes tiers. Les intégrations Windows et Linux demandent encore une validation manuelle approfondie.
- Sous Linux, l’application bloque l’authentification si la session D-Bus ou le service Secret Service est absent, inaccessible ou verrouillé. Ce choix évite de contourner silencieusement la vérification et la révocation d’une connexion mémorisée.

## Comptes et données

- Les comptes existent uniquement sur l’appareil courant.
- Il n’y a ni serveur, ni synchronisation cloud, ni récupération distante du mot de passe.
- L’export JSON n’a pas encore de flux d’import versionné et atomique.
- Le stockage actuel devra évoluer pour plusieurs années de notes et d’historiques, probablement vers SQLite et des fichiers séparés.
- Les cookies WebView et les clés API sont partagés à l’échelle de l’application sur la session du système, pas isolés par profil.

## Calendrier

- L’export iCalendar est ponctuel et unidirectionnel.
- Les changements ultérieurs ne sont pas répercutés dans Apple Calendrier ou Google Agenda.
- Une synchronisation réelle nécessiterait des UID persistants côté service et une intégration EventKit ou API.

## Fournisseurs et OAuth

- La WebView native utilise un profil distinct du navigateur système : WKWebView sous macOS, WebView2 sous Windows et WebKitGTK sous Linux.
- Un fournisseur, notamment Google, peut refuser un navigateur embarqué.
- Dowze Academie ne modifie pas l’agent utilisateur, ne copie pas les cookies et ne contourne pas un refus OAuth.
- La réutilisation réelle d’une session Google par chaque fournisseur et sa suppression WebKit doivent encore être vérifiées manuellement avec un vrai compte.
- La suppression ciblée des données Google intégrées est disponible uniquement sur macOS ; elle est désactivée sous Windows et Linux afin de ne jamais effacer globalement des sessions qui ne sont pas dans la liste autorisée.
- Les automatismes d’insertion ou de capture de lien dépendent de pages tierces qui peuvent évoluer.

## IA et évaluations

- Les réponses affichées dans les pages officielles ne sont pas lues par l’application.
- Les PDF produits par un assistant doivent être téléchargés puis sélectionnés explicitement.
- La note et l’appréciation d’une correction doivent être reportées dans le carnet.
- La disponibilité et la qualité d’un modèle ou d’un outil de génération de fichiers dépendent du fournisseur choisi.

## Pédagogie

- Le parcours vise une maîtrise personnelle comparable à un cursus exigeant, sans équivalence administrative de diplôme.
- Le calendrier d’évaluations n’est pas celui d’un établissement officiel.
- Les niveaux d’anglais sont alignés sur le CECRL mais ne sont pas certifiants.
- Les évaluations papier d’anglais ne mesurent pas à elles seules l’écoute, la parole spontanée ou la prononciation.
- Les exercices vocaux Duolingo peuvent nécessiter le navigateur système, la WebView ne demandant pas actuellement une autorisation microphone globale.

## Éditeur et cursus

- Une note est limitée à 1,5 million de caractères et une image intégrée à 350 ko.
- Le module d’édition riche est volumineux, bien qu’il soit chargé à la demande.
- Une matière personnalisée peut être créée, mais l’éditeur complet de modules, chapitres et notions n’est pas encore disponible.
- Le moteur de validation annuelle, de seuils et de rattrapages reste à formaliser complètement.
