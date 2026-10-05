#!/usr/bin/env bash
# commit-push.sh : commit des fichiers listés (seulement s'il y a du nouveau) puis push avec reprise.
# USAGE : scripts/commit-push.sh "message" chemin [chemin...]
# Partagé par update-data.yml, actualites.yml et publier-stories.yml : une seule logique de reprise.
#  - les chemins absents sont ignorés ;
#  - plusieurs workflows écrivent dans data/ : on reprend le dernier état distant (nos fichiers l'emportent) et on réessaie ;
#  - si le push échoue après toutes les tentatives, le script SORT EN ERREUR (avant : échec silencieux) et l'écrit dans le résumé.
set -u
message="$1"; shift
branche="${GITHUB_REF_NAME:-main}"
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
for chemin in "$@"; do
  if [ -e "$chemin" ]; then git add -A -- "$chemin"; fi
done
if git diff --cached --quiet; then
  echo "Rien de nouveau — rien à committer."
  exit 0
fi
git commit -q -m "$message"
for i in 1 2 3 4; do
  if git pull --rebase -X theirs origin "$branche" && git push origin "HEAD:$branche"; then
    git status -sb | head -1
    exit 0
  fi
  git rebase --abort 2>/dev/null || true
  sleep $((i * 5))
done
echo "::error::Push impossible après 4 tentatives : les données de cette exécution ne sont pas publiées."
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "- **Publication** : le commit des données a échoué (conflit de push répété) ; elles seront recalculées à la prochaine exécution." >> "$GITHUB_STEP_SUMMARY"
fi
exit 1
