#!/bin/sh
# Runs at every VM boot of the Cosmos cloud environment, and once from
# provision.sh when the repository is already checked out at image build time.
#
# Dependencies are baked into the image, so they only need reinstalling when
# package-lock.json has moved since. Sessions on an unchanged lockfile pay
# nothing.
set -eu

REPO=/workspace/brantgurga/simply-fizzed
STAMP=node_modules/.package-lock-stamp

# The checkout may not exist yet this early in boot.
i=0
while [ ! -d "$REPO/.git" ] && [ "$i" -lt 60 ]; do
	sleep 2
	i=$((i + 1))
done
if [ ! -d "$REPO/.git" ]; then
	echo "on-startup: no checkout at $REPO; leaving dependencies to the session." >&2
	exit 0
fi

cd "$REPO"
current=$(sha256sum package-lock.json | cut -d' ' -f1)

if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$current" ]; then
	echo "on-startup: dependencies already match package-lock.json."
	exit 0
fi

echo "on-startup: package-lock.json changed; reinstalling dependencies."
npm ci --no-audit --fund=false
printf '%s\n' "$current" >"$STAMP"
