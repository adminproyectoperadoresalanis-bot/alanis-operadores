#!/bin/bash
# Guarda todos los cambios en git, los sube a GitHub y publica en Firebase (Hosting +
# reglas e índices de Firestore + Cloud Functions), en un solo paso.
# Se puede correr desde cualquier carpeta y de cualquier forma (./publicar.sh,
# bash publicar.sh, o con su ruta completa) — se ubica solo a partir de dónde
# vive el propio archivo, no de la carpeta desde la que lo invoques.
# Uso: ./publicar.sh
set -e

# Primero nos paramos junto al propio script (no en la carpeta desde la que se
# invocó) — así "git rev-parse" siempre encuentra el repo, sin importar si lo
# corriste desde /workspaces, desde la raíz del repo o desde alanis-app-v2.
cd "$(dirname "${BASH_SOURCE[0]}")"
RAIZ_REPO="$(git rev-parse --show-toplevel)"
cd "$RAIZ_REPO"

echo "Guardando cambios..."
git add .
if git diff --cached --quiet; then
  echo "No hay cambios nuevos que guardar (se publicará lo que ya estaba guardado)."
else
  git commit -m "Actualización $(date '+%Y-%m-%d %H:%M')"
fi
echo "Subiendo a GitHub..."
git push
echo "Publicando en Firebase..."
cd "$RAIZ_REPO/alanis-app-v2"
firebase deploy --only hosting,firestore:rules,firestore:indexes,functions