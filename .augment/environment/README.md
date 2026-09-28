# Cloud environment scripts

These scripts define the machine image that Cosmos agents run this repository
on. They are not used by local development, by CI, or by the Firebase
deployment — only by the agent VMs.

## What runs, and when

| Script          | Runs                                           | Persists                                           |
| --------------- | ---------------------------------------------- | -------------------------------------------------- |
| `provision.sh`  | Once, during an image rebuild                  | Baked into the image; every future session sees it |
| `on-startup.sh` | At every VM boot, and once from `provision.sh` | Per session                                        |

`provision.sh` is the complete definition of everything layered on top of the
base Docker image (`nikolaik/python-nodejs:python3.12-nodejs24-bookworm`). It
installs Eclipse Temurin, the GitHub CLI, the Playwright browsers, and the
Firebase emulator artifacts.

`on-startup.sh` installs npm dependencies, but only when `package-lock.json`
has changed since the last install. Sessions on an unchanged lockfile skip it
in milliseconds.

## Why this matters

An image changes in one of three ways:

- **Incremental update** runs a one-off script on the current image and keeps
  everything already installed. It cannot change the base OS or Node version.
- **Refresh** re-pulls the repository and runs the startup hook on the current
  image. Installed packages survive.
- **Rebuild** starts over from the base Docker image. It is the only way to
  pick up a newer base OS or Node, and it discards everything that is not
  reinstalled by `provision.sh`.

That last point is the reason this directory exists. If `provision.sh` is
incomplete, a rebuild does not fail — it produces an image that is quietly
missing a tool, and the loss surfaces later as a confusing failure inside an
agent session (`gh: command not found`, a Firestore emulator that refuses to
start on an old JRE, a Playwright run with no browser to drive).

## Rebuilding

```sh
auggie cloud environment rebuild <environment-id> \
  --provision-script .augment/environment/provision.sh \
  --vm-startup-script .augment/environment/on-startup.sh
```

Afterwards, confirm the result on a fresh session rather than trusting the
build output. The image is only proven when `java -version`, `gh auth status`,
the contents of `/root/.cache/ms-playwright` and
`/root/.cache/firebase/emulators`, and a clean `npm test` all come back as
expected.

## Constraints to keep in mind

- **Versions come from the lockfile.** `provision.sh` fetches browsers and
  emulator artifacts for specific Playwright and firebase-tools versions, and
  those must match what actually gets installed at runtime. `npm ci` installs
  strictly from `package-lock.json` and never consults `package.json`, whose
  caret ranges can resolve to a newer release without anyone editing them. So
  the script reads the versions out of `package-lock.json` when the checkout is
  available, and only falls back to the constants near the top of the file when
  it is not. Those constants must be kept in sync with the lockfile, not with
  `package.json`; a mismatch produces cached browsers the test runner refuses
  to use.
- **Browser location.** Browsers install to `/root/.cache/ms-playwright`,
  outside `node_modules`, so that reinstalling dependencies does not delete
  them. `playwright.config.ts` defaults `PLAYWRIGHT_BROWSERS_PATH` to `0`
  (meaning `node_modules`), so the environment sets that variable explicitly to
  override the default. Changing either side alone will break e2e runs.
- **Private repository.** The checkout may not exist yet when `provision.sh`
  runs, and the script cannot clone it. Anything that needs the working tree
  belongs in `on-startup.sh`, which `provision.sh` calls when the checkout does
  happen to be present.

## Adding a tool

Add it to `provision.sh` first, then rebuild. Installing it ad hoc inside a
session, or through a one-off incremental update, leaves the image in a state
no file describes — which is the drift this setup was written to end.
