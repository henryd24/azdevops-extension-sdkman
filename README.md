<p align="center"><img src="images/logo.png" alt="SDKMAN Manager logo" width="160"></p>

# SDKMAN Manager

🇬🇧 English · 🇪🇸 [Español](README.es.md)

An Azure DevOps extension to install and configure JVM tools in your pipelines with [SDKMAN!](https://sdkman.io): Java (any distribution), Gradle, Maven, Kotlin, Scala, Groovy, Spring Boot CLI... Anything `sdk list` shows.

No per-tool installer tasks and no hand-rolled scripts: four small tasks that chain together.

| Task | What it does |
| ---- | ------------ |
| `SdkmanSetup` | Installs SDKMAN (or reuses an existing install) without touching shell profiles and exposes `SDKMAN_DIR`. Optional: `SdkmanInstall` can do it itself. |
| `SdkmanInstall` | Installs candidates (`java 21.0.5-tem`, `gradle 8.11`, `maven`...) and exports `JAVA_HOME`, `GRADLE_HOME`... and the `PATH` for the following steps. |
| `SdkmanEnv` | Reads a `.sdkmanrc`, installs what it lists and activates it for the following steps: the repository decides the versions, locally and in CI. |
| `SdkmanRun` | Runs `sdk` commands (`list`, `current`, `flush`, `home`...) or any command with SDKMAN loaded. |

> **Not published on the Marketplace.** This is a community project distributed as source. Build it with your own publisher and install it privately in your organization: see [Install in your organization](#install-in-your-organization). Provided as is, without support.

# Requirements

SDKMAN is a bash program, so the agent needs:

| Requirement | Notes |
| ----------- | ----- |
| **bash 4 or newer** | Linux: the default. **macOS ships bash 3.2**: the task uses Homebrew's bash (`/opt/homebrew/bin/bash`, `/usr/local/bin/bash`) if present, otherwise run `brew install bash`. |
| `curl`, `zip`, `unzip` | Debian/Ubuntu: `apt-get install -y curl zip unzip`. Alpine: `apk add bash curl zip unzip`. |
| Internet access to `get.sdkman.io`, `api.sdkman.io` and the vendors' download hosts | Or use the `installUrl` / `candidatesApi` inputs with an internal mirror. |

**Hosted agents** (checked on GitHub's `macos-latest` and `windows-latest` images, which are the same images Azure Pipelines hosts):

| Agent | What is missing | Prerequisite step |
| ----- | --------------- | ----------------- |
| `ubuntu-latest` | nothing | none |
| `macOS-latest` | only bash 3.2 is installed | `brew install bash` and put `$(brew --prefix)/bin` on the PATH |
| `windows-latest` | Git Bash has `unzip` and `curl`, but **no `zip`** | install `zip` into Git Bash (see below) |

```yaml
steps:
  - script: |
      set -e
      brew install bash
      BREW_BIN=`brew --prefix`/bin
      echo "##vso[task.prependpath]$BREW_BIN"
    displayName: Prerequisite - bash 4+ (macOS)
    condition: and(succeeded(), eq(variables['Agent.OS'], 'Darwin'))

  - powershell: |
      & C:\msys64\usr\bin\pacman.exe -S --noconfirm zip
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
      $git = 'C:\Program Files\Git\usr\bin'
      Copy-Item C:\msys64\usr\bin\zip.exe "$git\zip.exe" -Force
      if (-not (Test-Path "$git\msys-bz2-1.dll")) { Copy-Item C:\msys64\usr\bin\msys-bz2-1.dll $git }
    displayName: Prerequisite - zip in Git Bash (Windows)
    condition: and(succeeded(), eq(variables['Agent.OS'], 'Windows_NT'))
```

**Windows agents** work through **Git Bash** (Git for Windows, found at `C:\Program Files\Git\bin\bash.exe`), and they need **`zip` and `unzip`** available inside Git Bash. `unzip` is also what the Azure Pipelines agent itself relies on to unpack tools. SDKMAN does not support Cygwin or WSL's bash as the agent shell: the task never picks `C:\Windows\System32\bash.exe` (use the `bashPath` input to point at a specific Git Bash). On self-hosted Windows agents, install `zip` and `unzip` into Git's `usr\bin` (for example from MSYS2 or GnuWin32).

The task fails early with an actionable message when something is missing.


# Install in your organization

An Azure DevOps extension is tied to its publisher, so you build it with *your* publisher and install it *privately* in *your* organization.

1. **Create a publisher** (free) at <https://marketplace.visualstudio.com/manage> and note its ID, for example `my-publisher`.
2. **Get the code**: fork or clone this repository.
3. **Build the `.vsix`** (Node.js 20+):

   ```bash
   npm ci
   npm run pack -- --publisher my-publisher
   ```
4. **Upload it** (still private) and share it with your organization, in the portal (*New extension → Azure DevOps → upload → Share*) or with the CLI and a PAT with the **Marketplace (Manage)** scope:

   ```bash
   npx tfx extension publish --vsix my-publisher.sdkman-manager-*.vsix --share-with my-organization --token <PAT>
   ```
5. **Install it** in *Organization settings → Extensions → Shared*.

In a fork, set the repository variable `EXTENSION_PUBLISHER` and every push to `trunk` that changes code creates a GitHub Release with the `.vsix` built for your publisher.

# Quick start

```yaml
steps:
  - task: SdkmanInstall@0
    inputs:
      candidates: |
        java 21.0.5-tem
        maven 3.9.9
  - script: mvn -B verify
```

`java` and `mvn` are on the PATH, `JAVA_HOME` and `MAVEN_HOME` are set. If SDKMAN is not on the agent, the task installs it.

> Pin exact identifiers (`21.0.5-tem`) for reproducible builds. Run `sdk list java` to see them. Without a version, SDKMAN's current default is used.

# Examples

## Several JDKs: build on one, run on another

The first version listed for each candidate is the active one:

```yaml
steps:
  - task: SdkmanInstall@0
    name: tools
    inputs:
      candidates: |
        java 21.0.5-tem
        java 17.0.13-tem
        gradle 8.11
  - script: ./gradlew build
  - script: echo "JAVA_HOME=$JAVA_HOME, SDKMAN_JAVA_VERSION=$SDKMAN_JAVA_VERSION"
```

Every installed version lives under `$(SDKMAN_DIR)/candidates/<candidate>/<version>`.

## A JDK matrix

```yaml
strategy:
  matrix:
    jdk17: { jdk: 17.0.13-tem }
    jdk21: { jdk: 21.0.5-tem }
steps:
  - task: SdkmanInstall@0
    inputs:
      candidates: java $(jdk)
  - script: ./gradlew test
```

## Use `sdk` yourself in a script step

`SdkmanSetup` exports `SDKMAN_DIR`, so a plain script can load SDKMAN:

```yaml
steps:
  - task: SdkmanSetup@0
  - bash: |
      source "$SDKMAN_DIR/bin/sdkman-init.sh"
      sdk list java | head
```

## The repository decides: `.sdkmanrc`

Commit a `.sdkmanrc` (the same file `sdk env` reads locally):

```
java=21.0.5-tem
gradle=8.11
```

and the pipeline just follows it:

```yaml
steps:
  - task: SdkmanEnv@0
  - script: ./gradlew build
```

In a monorepo, point to the file: `sdkmanrcPath: services/api/.sdkmanrc`. With `strict: false` a missing file only warns and skips the step.

## Running `sdk` commands

```yaml
steps:
  - task: SdkmanRun@0
    inputs:
      commands: |
        version
        list java
        home java 21.0.5-tem
```

Every line is passed to `sdk` **as arguments**, never interpolated into a shell string, so values containing `;`, `$(...)` or quotes are inert. For free-form commands with SDKMAN loaded use `mode: shell`; each line is then interpreted by bash, so do not put untrusted values (for example pipeline variables coming from pull request titles) in it:

```yaml
  - task: SdkmanRun@0
    inputs:
      mode: shell
      commands: |
        java -version
        mvn -v
```

In both modes the commands see the same `JAVA_HOME` and `PATH` as the following steps (the versions activated by `SdkmanInstall` / `SdkmanEnv`). Note that `sdk current` reports SDKMAN's *default* versions, which can differ from the ones activated for the job when you installed several versions.

## Mirrors, proxies and offline agents

| Situation | What to set |
| --------- | ----------- |
| No access to `get.sdkman.io` | `installUrl`: your internal copy of the installer (keep `rcupdate=false` in the URL). |
| No access to `api.sdkman.io` | `candidatesApi`: a mirror of the SDKMAN API (`SDKMAN_CANDIDATES_API`). |
| Slow proxy | `connectTimeout` / `maxTime` (seconds). |
| Proxy that re-signs TLS | `insecureSsl: true` (skips certificate checks in `sdk`'s curl; the initial installer download is not affected). Prefer fixing the agent's trust store. |
| No network at all | `offline: true`: only versions already in `SDKMAN_DIR` are used (restore it from a cache), every candidate needs an explicit version, and nothing is downloaded or installed. |

`connectTimeout`, `maxTime`, `insecureSsl` and `system.debug` can only be applied through SDKMAN's `etc/config`, so the task writes them there **only when you set them** and restores the original file when each command ends. Running the pipeline with `system.debug: true` turns on SDKMAN's own debug output.

Failed downloads are retried twice. Failures that cannot improve (a version that does not exist for the platform, an unknown candidate, a bad local path) fail immediately; when retries run out, the error names `api.sdkman.io` and the vendor download host.

## A local folder as a version

An existing JDK on the agent (or one your build produced) can be registered as a SDKMAN version with a third word:

```yaml
- task: SdkmanInstall@0
  inputs:
    candidates: |
      java 21-custom /opt/jdk-21
```

Quote paths with spaces. `JAVA_HOME` then points to `<SDKMAN_DIR>/candidates/java/21-custom` (a link to your folder). On Windows use POSIX paths (`/c/tools/jdk-21`).

## Caching between runs

SDKMAN keeps what it installs in `SDKMAN_DIR`. On hosted agents, cache it with `Cache@2` so JDKs are not downloaded on every run:

```yaml
variables:
  SDKMAN_DIR: $(Pipeline.Workspace)/.sdkman

steps:
  - task: Cache@2
    inputs:
      key: 'sdkman | "$(Agent.OS)" | "java 21.0.5-tem maven 3.9.9"'
      path: $(SDKMAN_DIR)
      cacheHitVar: SDKMAN_CACHE_HIT
  - task: SdkmanInstall@0
    inputs:
      candidates: |
        java 21.0.5-tem
        maven 3.9.9
```

An installed version is detected on disk, so a restored cache means no download. `SdkmanInstall` retries failed downloads twice.

## Using task outputs

```yaml
steps:
  - task: SdkmanInstall@0
    name: tools
    inputs:
      candidates: java 21.0.5-tem
  - script: echo '$(tools.sdkmanInstalled)'   # [{"candidate":"java","version":"21.0.5-tem","home":"...","installedNow":true,"active":true}]
```

# Rich pipeline output

Each task logs in collapsible groups, prints a table at the end and publishes a markdown summary on the run's **Extensions** tab. If `JAVA_HOME` was already set by the agent (for example by `JavaToolInstaller`), a warning tells you it was replaced for the following steps. Run with `system.debug: true` for internals.

# Task reference

## SdkmanSetup

| Input | Default | Description |
| ----- | ------- | ----------- |
| `sdkmanDir` | | `SDKMAN_DIR`. Empty = the one set by an earlier step, an existing `~/.sdkman`, or `<Agent.ToolsDirectory>/sdkman`. |
| `installUrl` | `https://get.sdkman.io?rcupdate=false` | Installer URL (mirror). Keep `rcupdate=false` so `~/.bashrc` is not modified. |
| `candidatesApi` | | Overrides `SDKMAN_CANDIDATES_API` (default `https://api.sdkman.io/2`). |
| `bashPath` | | A specific bash 4+ executable. |
| `offline`, `connectTimeout`, `maxTime`, `insecureSsl` | | Network options, see [Mirrors, proxies and offline agents](#mirrors-proxies-and-offline-agents). All four tasks accept them. |

Outputs: `sdkmanDir`, `sdkmanVersion`, `sdkmanCacheHit` (`true` when SDKMAN was already installed).

## SdkmanInstall

| Input | Default | Description |
| ----- | ------- | ----------- |
| `candidates` | (required) | One per line: `<candidate> [<version> [<local path>]]`. `#` starts a comment. List a candidate several times for several versions; the first is active. |
| `autoInstallSdkman` | `true` | Install SDKMAN if it is missing. |
| `setHomeVariables` | `true` | Export `JAVA_HOME`, `GRADLE_HOME`, `MAVEN_HOME`... (`<CANDIDATE>_HOME`). |
| `addToPath` | `true` | Prepend the `bin` folder of each active version to the PATH. |
| `sdkmanDir`, `installUrl`, `candidatesApi`, `bashPath` | | Same as `SdkmanSetup`. |

Outputs: `sdkmanDir`, `sdkmanInstalled` (JSON). Variables for the following steps: `<CANDIDATE>_HOME` and `SDKMAN_<CANDIDATE>_VERSION`.

Behaviour worth knowing:

- Installing is idempotent: a version already on disk is not downloaded again.
- `sdk install` always moves SDKMAN's `current` link to the version it just installed; when you list several versions of a candidate the task puts `current` back on the first one.
- The task never changes your shell profiles and never reads from stdin, so it cannot hang on a prompt.

## SdkmanEnv

| Input | Default | Description |
| ----- | ------- | ----------- |
| `sdkmanrcPath` | `.sdkmanrc` | Relative to the working directory. |
| `strict` | `true` | Fail when the file is missing or empty. When off, the step is skipped with a warning. |
| `autoInstallSdkman`, `setHomeVariables`, `addToPath` | `true` | As in `SdkmanInstall`. |
| `sdkmanDir`, `installUrl`, `candidatesApi`, `bashPath` | | As in `SdkmanSetup`. |

Format: one `candidate=version` per line, `#` comments. The version is required and each candidate may appear once. Outputs: `sdkmanDir`, `sdkmanInstalled` (JSON).

## SdkmanRun

| Input | Default | Description |
| ----- | ------- | ----------- |
| `commands` | (required) | One per line. In `sdk` mode the `sdk` prefix is optional. Each line runs on its own. |
| `mode` | `sdk` | `sdk`: arguments passed to `sdk` safely. `shell`: each line interpreted by bash with SDKMAN loaded. |
| `workingDirectory` | `$(System.DefaultWorkingDirectory)` | Where the commands run. |
| `env` | | `KEY=VALUE` per line, set for the commands. |
| `failOnError` | `true` | Stop at the first failing command and fail the task; when off, all commands run and the task ends with warnings. |
| `autoInstallSdkman`, `sdkmanDir`, `installUrl`, `candidatesApi`, `bashPath` | | As above. |

Output: `exitCode` (0, or the exit code of the first failing command).

# CI / CD

- **GitHub Actions** (`.github/workflows`): `ci.yml` runs tests and typecheck on Linux, Windows and macOS and builds a dev `.vsix`; `validate-tasks.yml` runs the four bundled tasks end to end (real SDKMAN, real JDK downloads) on Linux, macOS and Windows runners; `release.yml` releases on pushes to `trunk` that change code.
- **Azure Pipelines** (`azure-pipelines.yml`): the same validation on Azure hosted agents (Linux, macOS and Windows). It has been run on Azure hosted agents and passes, including the macOS and Windows prerequisite steps above.

# Disclaimer

Community project, provided as is, without warranty or support. It is not affiliated with or endorsed by SDKMAN! or Microsoft. You are responsible for what runs on your agents: review the code before installing it.
