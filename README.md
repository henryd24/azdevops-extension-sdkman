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

**Windows agents** work through **Git Bash** (Git for Windows). They must also have **`zip` and `unzip`** available inside Git Bash (Git Bash does not ship them; install them, for example from MSYS2 or GnuWin32, in Git's `usr\bin` or `mingw64\bin`). `unzip` is already required by the Azure Pipelines agent to unpack tools. SDKMAN does not support Cygwin or WSL's bash as the agent shell. The task never picks `C:\Windows\System32\bash.exe`; use the `bashPath` input to point at a specific Git Bash. Windows support is best effort: it is not covered by this repository's automated tests yet.

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

Outputs: `sdkmanDir`, `sdkmanVersion`, `sdkmanCacheHit` (`true` when SDKMAN was already installed).

## SdkmanInstall

| Input | Default | Description |
| ----- | ------- | ----------- |
| `candidates` | (required) | One per line: `<candidate> [<version>]`. `#` starts a comment. List a candidate several times for several versions; the first is active. |
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

- **GitHub Actions** (`.github/workflows`): tests and typecheck on Linux, Windows and macOS, a dev `.vsix` on every push, and an automatic release on pushes to `trunk` that change code.
- **Azure Pipelines** (`azure-pipelines.yml`): runs the bundled tasks on real Linux and macOS agents (Phase 7 of [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)).

# Disclaimer

Community project, provided as is, without warranty or support. It is not affiliated with or endorsed by SDKMAN! or Microsoft. You are responsible for what runs on your agents: review the code before installing it.
