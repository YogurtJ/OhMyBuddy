# Install, update and recover OhMyBuddy

[English home](../../README.md) · [User guide](USER_GUIDE.md) · [中文完整指南](../INSTALL_RECOVERY.md)

OhMyBuddy runs natively on Linux, macOS and Windows with **Node.js 22.x (22.19.0 or later)** and npm, as required by the current locked dependencies. The environments validated for each release are listed in [platform validation](../RELEASE_INSTALL_VALIDATION.md); if you run into a problem elsewhere, please [open an issue](https://github.com/YogurtJ/OhMyBuddy/issues).

The examples below use **1.11.0**; replace it with the version you downloaded from [Releases](https://github.com/YogurtJ/OhMyBuddy/releases). Use matching archives, checksums and version directories together. Each release's notes and validation attachment describe the checks performed on that archive.

## Prerequisites

- Node 22.x and npm in the server process's PATH.
- Bash and ripgrep (`rg`). Windows needs Git for Windows/Git Bash. Linux additionally uses standard tar, gzip, curl, CA certificates and checksum tools in the examples below. On macOS, install ripgrep if needed, for example with `brew install ripgrep`.
- HTTPS access to npm to download locked dependencies on first installation.
- Your own model provider account or compatible model service. A model appearing in the catalog does not provide credentials or credit.

No global Pi installation, frontend build or GPU is required. OhMyBuddy's own native components are prebuilt; the current source's SQLite dependency may require native compilation when no matching prebuilt binary is available. Keep packaged native source, binaries and manifests together. Do not reuse another OS/CPU's `node_modules`, omit optional dependencies, or use `npm audit fix --force` to change locked dependencies.

Use the same ordinary operating-system user as your existing Pi CLI. OhMyBuddy normally reuses that user's native Pi identity; media and scheduled messages use instance-specific paths. Use a separate identity only for an explicitly independent instance or isolated testing. Additional project tools, such as Git, compilers or Python, are installed separately as needed.

## Bundled capabilities

The current source includes pi-subagents 0.82.1 and pi-hermes-memory 0.9.10 under `vendor/`. `node scripts/install.cjs` installs the locked dependencies, prepares esbuild, verifies upstream files, builds the profile memory component and checks native SQLite support. It uses the dependency's shipped binaries without npm's unnecessary node-gyp step. Failure returns a nonzero installation result. Older published archives without this script retain their original `npm ci` installation command. Targets without a usable SQLite binary need Python and C/C++ tools to build the upstream module explicitly.

OhMyBuddy selects its own package versions without rewriting existing CLI package declarations or moving profile data. Legacy resource filters remain effective. Subagent settings and profile memory controls keep their existing scopes; installation does not start tasks or enable memory for every profile. Components update with OhMyBuddy. `PI_SKIP_DEFAULT_CAPABILITIES` no longer controls bundled preparation. After an explicit `npm ci --ignore-scripts`, run `npm rebuild esbuild --foreground-scripts` and `node scripts/install-bundled-capabilities.cjs`. See [bundled capabilities](../BUNDLED_CAPABILITIES.md).

## Installation scope

For an ordinary deployment, check prerequisites, reuse the intended Pi identity, configure instance data paths and project roots, run `node scripts/install.cjs` once, and install the background service. Verify read-only status and that the page opens. Foreground startup is for trials or troubleshooting. Full tests, browser regression, packaging and recovery drills belong to development validation. Report time to first usable page separately from later checks.

When given only the GitHub repository URL, prefer the Release archive and checksum. If the user explicitly chooses a Git checkout, record its commit and follow the same instance setup; a source checkout does not require development tests. After switching Node versions, check `node --version` and `node -p 'process.execPath'`. Chain the switch and installation with `&&` so a failed switch cannot silently run installation under the previous Node. Node 22 is the installation baseline, not proof that every other major version is incompatible.

Project roots are separate from data isolation. Ordinary installations default to `/` on Linux/macOS and the available drive roots on Windows, so projects can live anywhere accessible to the server user. Do not add a scope-selection step or silently restrict projects to Documents or the demo directory. Configure a narrower scope only when the user requests it.

## Existing Pi CLI users

Pi uses Node's OS home directory plus `.pi/agent`: usually `/Users/<user>/.pi/agent` on macOS, `/home/<user>/.pi/agent` on Linux, and `C:\Users\<user>\.pi\agent` on native Windows. Windows does not default to AppData. A nonempty `PI_CODING_AGENT_DIR` overrides this. Git Bash's `~`, PowerShell's home and native Node's home may differ; WSL Pi is a separate Linux environment.

After dependency installation, the commands below use `node scripts/pi-agent-dir.cjs` to obtain the path through Pi's public resolver. Run them as the normal CLI user with its actual configuration environment, including overrides supplied by a CLI alias or wrapper. The helper only reports a path; it does not read credentials, create directories or send model requests. Existing identities are reused, and missing ones are initialized by Pi on normal startup. OhMyBuddy still uses its bundled Pi version, not the globally installed executable.

Sharing an identity also shares native settings, standard sessions and global resources. Do not let the CLI and Web UI write the same session concurrently. For an existing OhMyBuddy installation, stop it when idle through its original management channel, retain both identity directories, and change the actual `PI_CODING_AGENT_DIR` in its startup configuration. Do not copy or merge authentication files. Media and schedule paths should retain their existing values. After startup, the authenticated `/api/pi/settings/native` response reports `agentDir`; check configured providers in Settings before logging in again.

Environment-only keys, proxy settings and external credential commands must also be available to OhMyBuddy. Service managers and `env -i` do not copy your interactive shell environment. Extension-only providers may not appear in provider settings. Custom CLI session directories are not automatically migrated by sharing an identity. See the detailed [Pi CLI integration guide](../PI_CLI.md).

## Linux and macOS

Download the archive and its `.sha256` file from [Releases](https://github.com/YogurtJ/OhMyBuddy/releases) to Downloads and verify the source. In Bash or your macOS terminal:

```bash
ARCHIVE="$HOME/Downloads/ohmybuddy-1.11.0.tar.gz"
# Linux:
(cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256")
# macOS: use this checksum command instead:
# (cd "$(dirname "$ARCHIVE")" && shasum -a 256 -c "$(basename "$ARCHIVE").sha256")
```

Continue only if verification succeeds. For a new instance, the base directory must not already exist:

```bash
BASE="$HOME/ohmybuddy"
test ! -e "$BASE" || { echo "Directory exists; use the update procedure or another BASE"; exit 1; }
umask 077
mkdir -p "$BASE/releases/1.11.0"
tar -xzf "$ARCHIVE" -C "$BASE/releases/1.11.0" --strip-components=1
cd "$BASE/releases/1.11.0"
node --version
rg --version
node scripts/install.cjs
```

Resolve the native Pi identity after dependency installation:

```bash
AGENT_DIR=$(node scripts/pi-agent-dir.cjs) || exit 1
printf 'Pi identity: %s\n' "$AGENT_DIR"
```

Only for an explicitly isolated identity, use an external path such as `AGENT_DIR="$HOME/.pi/ohmybuddy-agent"`. Create a fixed instance configuration. The shell expands `BASE` before writing; OhMyBuddy's `.env` reader itself does **not** expand variables or `~`.

```bash
PI_CODING_AGENT_DIR="$AGENT_DIR" node scripts/configure-instance.cjs
node scripts/storage-layout.cjs
node scripts/install-service.cjs
```

The minimal environment retains the identity explicitly selected in the configuration but does not inherit shell provider keys or proxy variables. Preserve your own HOME. If authentication uses environment values or external commands, provide those dependencies to this instance, or save credentials through the native Web login. If your network requires a proxy, explicitly add the required proxy configuration for this instance. With a Node version manager, ensure the chosen Node 22 is actually in PATH; noninteractive SSH and service managers may not load shell startup scripts.

Open **http://127.0.0.1:11408**. The installation terminal can close. A user service starts OhMyBuddy at login; on Linux servers, configure user linger or an equivalent system service for boot-time startup. macOS also gets a desktop browser shortcut. See [background service management](../BACKGROUND_SERVICE.md). Foreground `npm start` is reserved for trials and troubleshooting.

macOS's privacy controls and filesystem permissions still apply. `/tmp` resolving to `/private/tmp` is normal. Finder Trash is not integrated: session deletion tries `gio trash`, then permanently deletes if unavailable. The confirmation and result explain which behavior applies.

## Windows

Install Node 22.x x64, Git for Windows and ripgrep, making them available in PATH. Normal installation does not require Visual Studio or WSL. Use a new directory under your own user profile. In PowerShell:

```powershell
$archive = Join-Path $env:USERPROFILE 'Downloads\ohmybuddy-1.11.0.tar.gz'
$expected = (Get-Content -LiteralPath ($archive + '.sha256') -Raw).Trim().Split()[0]
if ($expected -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $expected) { throw 'Archive checksum failed' }
$base = Join-Path $env:USERPROFILE 'OhMyBuddy'
if (Test-Path -LiteralPath $base) { throw 'Directory exists; use the update procedure or another base' }
$app = Join-Path $base 'releases\1.11.0'
New-Item -ItemType Directory -Path $app -Force | Out-Null
tar.exe -xzf $archive -C $app --strip-components=1
if ($LASTEXITCODE -ne 0) { throw 'Extraction failed' }
Set-Location -LiteralPath $app
node.exe --version
rg.exe --version
node.exe scripts/install.cjs
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
```

Resolve the Pi identity through the same public API, then save absolute paths with forward slashes:

```powershell
$agentDir = & node.exe scripts/pi-agent-dir.cjs
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($agentDir)) { throw 'Cannot resolve the Pi identity; check the CLI startup environment' }
Write-Output "Pi identity: $agentDir"
$env:PI_CODING_AGENT_DIR = $agentDir
node.exe scripts/configure-instance.cjs
node.exe scripts/storage-layout.cjs
node.exe scripts/install-service.cjs
```

Open **http://127.0.0.1:11408** or the OhMyBuddy desktop shortcut. The installation terminal can close; a current-user scheduled task starts OhMyBuddy at login. See [service lifecycle and platform limitations](../BACKGROUND_SERVICE.md). Existing process environment variables override `.env`; retain the intended CLI identity and its required credential/proxy/command environment, and clear unrelated instance overrides without printing secrets or changing other applications' system settings. For an explicitly isolated identity, set `$agentDir = Join-Path $base 'data\agent'` before calculating `$piIdentity`.

The Windows example includes all drive roots visible at installation, such as `C:/;D:/`. Update the configuration and restart when adding drives. To restrict the scope on request, use **semicolon-separated** paths such as `C:/Projects;D:/Work`. The directories must exist. Use NTFS-aware backups and verify the restored Agent directory's protected DACL. See the detailed [Windows guide](../WINDOWS.md) for filesystem and platform limits.

## First use and remote access

Open Settings → Providers and models and check existing native configuration; sign in only if credentials are missing. Read-only status and a usable page complete basic startup. If the user has authorized a real model test, select a project, create a thread, send a simple question and reopen it to verify persistence. The request may incur charges. Use a synthetic file for any separate tool check, and verify uncertain requests before sending again.

The examples listen only on loopback. `localhost` on a phone means the phone, not the server. To connect from another device, configure the server's listen address, firewall, reachable workspace URL and access authentication. Use trusted HTTPS or a trusted private network for credentials. Change both `PORT` and `PI_WORKSPACE_BASE_URL` if you change the port.

The UI currently cannot change `PI_PROJECT_ROOTS`. If a directory is outside the configured roots, edit the server's actual `.env` or service environment; keep the fixed `instance.env` in sync if you use it. Nonempty process environment values override `.env`. Use absolute paths, not `~` or `$HOME`. Preserve drafts, pause scheduled messages, wait for active operations to finish, and restart through the existing independent management channel. Check the effective `projectRoots` in `/api/pi/status` after authentication. Moving projects or sessions is unnecessary. POSIX roots are colon-separated; Windows roots are semicolon-separated. Server filesystem permissions and macOS privacy controls continue to apply. Project roots are **not a tool sandbox**. For project resources, manage Pi trust through the project menu or `/trust`.

A fresh installation has no executable media service. Configure your own image, video or speech service separately. The lab's planning extension is included in the package and does not require global Package installation; it does require a configured chat model. Ordinary persistent chats already include `media_models`, `media_results` and `media_generate`; no extra Package is needed. For a standalone CLI or additional compatibility planning tools, install the bundled `pi-packages/media-workbench` from Extensions → Installed after reviewing its permissions. See the [Package tools](../MEDIA_AGENT.md#pi-package). GPU adapters have additional service-specific prerequisites.

## Backups, upgrades and recovery

Current source supports an external layout and path-only configuration helper. Older archives retain their original locations; follow the instructions shipped with that version. See the [storage layout, platform defaults and migration policy](../STORAGE_LAYOUT.md).

Run `node scripts/storage-layout.cjs` to locate the actual instance configuration, runtime state, Pi identity, media and work roots. Do not assume personal data is under the program or BASE/data.

Back up the entire native Pi identity (including original JSONL, external images, attachments, profiles, queues and proofs), OMB configuration, media/history/prompts, Bot and independent-chat working folders, user projects, actual service registration and matching program/checksums. Update snapshots do not replace a separate backup of working files.

Before copying, preserve drafts, pause dispatch and wait for Agent, Shell, side-chat, media, settings and import/export work to finish. Stop OhMyBuddy and external CLI writers through an independent management channel. Preserve private permissions or the actual Windows DACL, original absolute paths, manifests and checksums. Never stop the service hosting the migration agent itself.

Prefer managed updates from a stable program entry. For manual code relocation, explicitly reuse the same external configuration and runtime identity; do not copy secrets into each release or start a second owner. Reinstallation at the same location retains external configuration bytes and working files. Normal program removal retains user data; shared Pi credentials must not be deleted as if they belonged only to OMB.

Restore a verified backup while all writers are stopped, to the original paths, then verify native session IDs, full branches/bookmarks, images/attachments, authentication, work files and queues. A directory move requires a separate offline plan and native semantic verification; never replace text globally in JSONL. Do not replay uncertain tasks. Detailed procedures are in the [recovery guide](../INSTALL_RECOVERY.md#4-备份范围与一致性).
