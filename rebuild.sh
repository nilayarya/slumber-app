#!/bin/bash
set -e

PROJ="Sleep-Tracker-Visualizer"
ZIP="${PROJ} (1).zip"
DIR="$(dirname "$(pwd)/$PROJ")"

cd "$DIR"

rm -rf "$PROJ"
rm -f "${PROJ}.zip"

if [ ! -f "$ZIP" ]; then
  echo "Error: '$ZIP' not found in $DIR"
  exit 1
fi

unzip "$ZIP"
rm -f "$ZIP"

cd "$PROJ"

npm install
rm -rf ios
npx expo prebuild --platform ios
npx expo run:ios
