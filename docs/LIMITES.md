# Limites connues

Cette liste décrit les limites de Dowze Academie 0.1.0. Elles font partie du périmètre public du projet et ne doivent pas être présentées comme déjà résolues.

## Distribution

- Le bundle macOS actuel est construit localement pour x86_64.
- Il n’est ni signé avec un certificat Apple Developer ID, ni notarisé.
- Une distribution large demandera des builds pour les architectures visées, une signature, une notarisation et un canal de mise à jour maîtrisé.

## Comptes et données

- Les comptes existent uniquement sur le Mac courant.
- Il n’y a ni serveur, ni synchronisation cloud, ni récupération distante du mot de passe.
- L’export JSON n’a pas encore de flux d’import versionné et atomique.
- Le stockage actuel devra évoluer pour plusieurs années de notes et d’historiques, probablement vers SQLite et des fichiers séparés.
- Les cookies WebView et les clés API sont partagés à l’échelle de l’application sur la session macOS, pas isolés par profil.

## Calendrier

- L’export iCalendar est ponctuel et unidirectionnel.
- Les changements ultérieurs ne sont pas répercutés dans Apple Calendrier ou Google Agenda.
- Une synchronisation réelle nécessiterait des UID persistants côté service et une intégration EventKit ou API.

## Fournisseurs et OAuth

- WKWebView utilise un profil distinct de Safari et Chrome.
- Un fournisseur, notamment Google, peut refuser un navigateur embarqué.
- Dowze Academie ne modifie pas l’agent utilisateur, ne copie pas les cookies et ne contourne pas un refus OAuth.
- La réutilisation réelle d’une session Google par chaque fournisseur et sa suppression WebKit doivent encore être vérifiées manuellement avec un vrai compte.
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
