#!/bin/sh
# Provisions the Cosmos cloud environment image used by this repository's agents.
#
#   auggie cloud environment rebuild <environment-id> \
#     --provision-script .augment/environment/provision.sh \
#     --vm-startup-script .augment/environment/on-startup.sh
#
# A rebuild starts from the base Docker image, so everything the agents need on
# top of it has to be reinstalled here. Keep this script complete: if it is not,
# the loss only shows up as confusing tool failures in a later session.
set -eu

REPO=/workspace/brantgurga/simply-fizzed

# Fallbacks, used only when the checkout is not available at provision time.
# package.json declares caret ranges, so it is not the authority here: npm ci
# installs whatever package-lock.json resolved to, and browser and emulator
# artifacts must match that. Keep these in sync with package-lock.json.
PLAYWRIGHT_FALLBACK_VERSION=1.63.0
FIREBASE_TOOLS_FALLBACK_VERSION=15.30.2

# Read the installed version of a package out of the lockfile.
locked_version() {
	node -p "require('$REPO/package-lock.json').packages['node_modules/$1'].version" 2>/dev/null || true
}

PLAYWRIGHT_VERSION=$(locked_version '@playwright/test')
[ -n "$PLAYWRIGHT_VERSION" ] || PLAYWRIGHT_VERSION=$PLAYWRIGHT_FALLBACK_VERSION
FIREBASE_TOOLS_VERSION=$(locked_version 'firebase-tools')
[ -n "$FIREBASE_TOOLS_VERSION" ] || FIREBASE_TOOLS_VERSION=$FIREBASE_TOOLS_FALLBACK_VERSION
echo "playwright=$PLAYWRIGHT_VERSION firebase-tools=$FIREBASE_TOOLS_VERSION"

export DEBIAN_FRONTEND=noninteractive
# Outside node_modules so the browsers survive a dependency reinstall. The same
# value is set as an environment variable on the environment itself, which is
# what stops playwright.config.ts from defaulting the path back to node_modules.
export PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

ARCH=$(dpkg --print-architecture)
CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME")

echo "=== apt repositories ==="
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings

# Eclipse Temurin. firebase-tools rejects Java older than 21 and bookworm's
# default-jre is 17, so the Firestore emulator cannot start without this.
curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public |
	gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg
chmod go+r /etc/apt/keyrings/adoptium.gpg
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb %s main\n' \
	"$ARCH" "$CODENAME" >/etc/apt/sources.list.d/adoptium.list

# GitHub CLI. Authenticates itself from the GITHUB_TOKEN the platform injects.
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
	-o /etc/apt/keyrings/githubcli-archive-keyring.gpg
chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\n' \
	"$ARCH" >/etc/apt/sources.list.d/github-cli.list

echo "=== temurin + gh ==="
apt-get update
apt-get install -y --no-install-recommends temurin-25-jre gh
java -version
gh --version

echo "=== playwright browsers ==="
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
npx --yes "playwright@$PLAYWRIGHT_VERSION" install --with-deps chromium firefox webkit

echo "=== firebase emulators ==="
npx --yes "firebase-tools@$FIREBASE_TOOLS_VERSION" setup:emulators:firestore
npx --yes "firebase-tools@$FIREBASE_TOOLS_VERSION" setup:emulators:ui

# The repository is private, so it may not be checked out yet at provision time.
# When it is, bake the dependencies in; otherwise on-startup.sh installs them on
# first boot.
if [ -d "$REPO/.git" ]; then
	echo "=== npm dependencies ==="
	sh "$REPO/.augment/environment/on-startup.sh"
fi

echo "=== provisioning complete ==="
