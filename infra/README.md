# Infrastructure

Ces modèles complètent les sources ; ils ne sont pas un export de la configuration privée actuelle. Le frontal public observé est sur le VPS et le service sur Epic‑01. Les adresses internes et secrets restent dans la configuration d’exploitation hors Git.

`nginx-public.example.conf` illustre le proxy HTTPS ; remplacer le nom d’upstream et les chemins des certificats. Il nécessite une résolution et un service déjà configurés. La terminaison TLS spéciale du frontal observé n’est pas reproduite par ce modèle simplifié.

Le site `server/public-site/` conserve le catalogue public tel que trouvé, y compris ses versions anciennes ; ne pas le republier sans correction du catalogue et qualification des paquets. Le shell compilé de la PWA est conservé uniquement dans la copie locale ignorée.

Voir `docs/DEPLOIEMENT.md` pour sauvegarde, restauration et limites de reproductibilité.
