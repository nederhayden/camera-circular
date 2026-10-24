#!/bin/sh
# Publica a versão do package.json como Release no GitHub.
# A Release é criada antes do build: o electron-builder envia os arquivos em
# paralelo e, se ela ainda não existir, as várias tentativas de criá-la colidem.
set -e

version=$(node -p "require('./package.json').version")
tag="v$version"

GH_TOKEN=$(gh auth token)
export GH_TOKEN

gh release view "$tag" >/dev/null 2>&1 || gh release create "$tag" --title "$tag" --generate-notes
electron-builder --mac --publish always
