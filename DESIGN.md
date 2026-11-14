# Dowze Académie — refonte 0.12, 8 octobre 2026

## Direction

Un bureau d’étude précis et accueillant. La progression vient du travail réel, la navigation reste constante, le contenu de cours conserve son espace de lecture. Operate pour organiser et écrire ; Read pour étudier. Le compagnon est la seule animation persistante expressive.

Manrope auto-hébergée : une même famille pour les contrôles, la rédaction et les titres. Titres 26–40 px, texte courant 14–16, secondaire 12–13, largeur de lecture 70 caractères. Pas de labels décoratifs en capitales. Encre `#18243f`, fond `#f4f6fa`, surfaces blanches, bleu d’action `#3154b8`, sélection `#eaf0ff`. Succès vert, erreurs rouge et attente ambre réservés aux états. Couleurs pédagogiques propres aux matières conservées.

## Composition

Navigation nommée, groupée en apprentissage/carnet, compacte sur les petites fenêtres et repliable. Recherche globale indépendante de l’assistant, Ctrl/Cmd K ; elle reste limitée au compte et à la formation actifs. Les notes ouvertes demeurent en onglets. Aucun déplacement de fenêtre depuis les onglets : barre native uniquement.

Accueil : un seul espace de reprise lie formation et matière suivante, puis planning/objectifs ; détails de la formation en bas. Les cours gardent leur sommaire, la prochaine étape et leur historique. Métadonnées légères, zone de travail prioritaire. Réglages : compte, services, sauvegardes, mises à jour et confidentialité ont une rubrique à la fois ; les contrôleurs de synchronisation et d’update restent montés.

Mobile : cinq rubriques tactiles persistantes en bas, choix d’année compact, liste/recherche de notes puis éditeur avec retour explicite. Catalogue recherchable. Éditeur sans double défilement obligatoire sur smartphone. Sur tablette, liste et rédaction côte à côte.

## Composants et états

Boutons 42 px desktop/44 tactile, rayon 8, séparateurs `#e0e5ef`, input `#bcc7dc`. Rayon 12 pour zones distinctes, 18 seulement pour reprise et entrée de compte. Ombre sur surfaces flottantes, aucune accumulation de cartes dans cartes. Focus visible, dialogues avec arrière-plan inerte et focus restitué, erreur conserve la saisie. Tables/chiffres en numerals tabulaires quand ils sont comparés.

Mouvement déclenché par une action, préférence reduced-motion respectée. L’îlot Coucou garde géométrie et ressorts validés. Cache hors ligne, conflits, auth, export et chargements gardent une explication exacte et une issue visible. Désactivation explique un prérequis lorsqu’il n’est pas évident.

## Sources et preuves

Frontend Design, Interface Design, Impeccable, Frontend Agent Skills, références d’accessibilité, React et animation de l’inventaire du propriétaire. Couverture détaillée dans Documents/Dowze-Refonte-Globale-20261008. Leurs plateformes externes non connectées ne sont pas revendiquées comme exécutées. Recette : tests de composants + captures Chromium et WebKit natif Rust/Tauri ; aucun score lecteur d’écran ni recette Mac/Windows inventé.

## Carnet unifié — 0.11

Une seule destination Notes. Liste avec recherche et classement par matière à gauche, note sélectionnée à droite ; retour vers la liste sur petit écran. Titre et sauvegarde au-dessus de la page. Texte mis en forme et source Markdown sont deux vues du même texte ; dessin et images se trouvent dans le corps de cette note, sans changement de rubrique. Aucun dessin ni image d’une autre note ne doit y apparaître. Les anciens dessins du carnet commun restent ouvrables dans une note dédiée, sans réécriture destructive.

Identité stable par note pour le document média, compte et année inchangés. Sauvegarde locale et synchronisation privées réemploient les protocoles existants ; conflits et indisponibilité doivent être visibles, sans effacer un média indisponible. L’export .md conserve la source textuelle ; il ne constitue pas un export des pièces jointes.

## Correction propriétaire : une seule feuille — 0.12

La proposition 0.11 à zones texte puis dessin est rejetée par Louis : référence Apple Notes et Notability. La composition 0.12 est un unique éditeur avec images privées insérées à la position du curseur et encre sur la page elle-même. Une seule barre réunit mise en forme, écriture, stylo, surligneur, gomme, couleur, épaisseur et image. Les contrôles avancés sont dépliables. Aucun onglet de modes Texte/Markdown ni carte Dessin/Photos. Markdown demeure le format textuel sous-jacent.
