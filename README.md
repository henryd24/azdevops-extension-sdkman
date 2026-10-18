<p align="center"><img src="images/extension-icon.png" alt="SDKMAN Manager logo" width="160"></p>

# SDKMAN Manager

🇬🇧 English · 🇪🇸 [Español](README.es.md)

An Azure DevOps extension to install and configure JVM tools in your pipelines with [SDKMAN!](https://sdkman.io): Java (any distribution), Gradle, Maven, Kotlin, Scala, Groovy, Spring Boot CLI... Anything `sdk list` shows.

No per-tool installer tasks and no hand-rolled scripts: four small tasks that chain together.

| Task | What it does |
| ---- | ------------ |
| `SdkmanSetup` | Installs SDKMAN (or reuses an existing install) without touching shell profiles and exposes `SDKMAN_DIR`. Optional: `SdkmanInstall` can do it itself. |
| `SdkmanInstall` | Installs candidates (`java 21.0.5-tem`, `gradle 8.11.1`, `maven`...) and exports `JAVA_HOME`, `GRADLE_HOME`... and the `PATH` for the following steps. |
| `SdkmanEnv` | Reads a `.sdkmanrc`, installs what it lists and activates it for the following steps: the repository decides the versions, locally and in CI. |
| `SdkmanRun` | Runs `sdk` commands (`list`, `current`, `flush`, `home`...) or any command with SDKMAN loaded. |

> **Not published on the Marketplace.** This is a community project distributed as source. Build it with your own publisher and install it privately in your organization: see [Install in your organization](#install-in-your-organization). Provided as is, without support.


# Requirements

**Short answer:** on Microsoft-hosted Ubuntu agents you need nothing. On macOS and Windows hosted agents you add one prerequisite step each (below). You do **not** need Java, Maven, Gradle or SDKMAN on the agent beforehand: that is what the tasks install.

## What an agent needs

SDKMAN is a bash program, so the agent needs:

| Requirement | Notes |
| ----------- | ----- |
| **bash 4 or newer** | Linux: the default. macOS ships bash 3.2 (see below). Windows: Git Bash. |
| `curl`, `zip`, `unzip` | The SDKMAN installer checks for them and `sdk install` unpacks JDKs with them. |
| Network access to `get.sdkman.io`, `api.sdkman.io` and the vendors' download hosts | SDKMAN redirects each download to the vendor's own host. Behind a firewall, use an internal mirror ([Mirrors, proxies and offline agents](#mirrors-proxies-and-offline-agents)) or an allow-list. |
| A writable `SDKMAN_DIR` | Defaults to `<Agent.ToolsDirectory>/sdkman`; set `sdkmanDir` to change it. |
| Disk space | About 200 MB per JDK download, plus the unpacked JDK. Add `Cache@2` ([Caching between runs](#caching-between-runs)) to avoid repeating it. |

The Azure Pipelines agent already provides Node.js, which is all the tasks themselves need. The task fails early with an actionable message when something is missing.

## Microsoft-hosted agents

Checked on Azure Pipelines hosted agents (and on the equivalent GitHub runner images):

| Agent | What is missing | Prerequisite step |
| ----- | --------------- | ----------------- |
| `ubuntu-latest` | nothing | none |
| `macOS-latest` | only bash 3.2 is installed | `brew install bash` and put `$(brew --prefix)/bin` on the PATH |
| `windows-latest` | Git Bash has `unzip` and `curl`, but **no `zip`** | install `zip` into Git Bash |

Add these steps **before** the SDKMAN tasks (they are skipped on the other systems):

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

**Windows agents** work through **Git Bash** (Git for Windows, at `C:\Program Files\Git\bin\bash.exe`) and need **`zip` and `unzip`** inside Git Bash. SDKMAN does not support Cygwin or WSL's bash as the agent shell: the task never picks `C:\Windows\System32\bash.exe` (use the `bashPath` input to point at a specific Git Bash).

## Self-hosted agents

Linux, with the packages SDKMAN needs (Debian/Ubuntu):

```bash
apt-get update && apt-get install -y --no-install-recommends bash curl zip unzip ca-certificates
```

(Alpine: `apk add bash curl zip unzip`; Alpine/musl is not covered by this project's tests.) On macOS install a modern bash with `brew install bash`; on Windows install Git for Windows and add `zip` to Git's `usr\bin` (for example from MSYS2 or GnuWin32).


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

`java` and `mvn` are on the PATH, `JAVA_HOME` and `MAVEN_HOME` are set for every following step. If SDKMAN is not on the agent, the task installs it. Each line of `candidates` is `<candidate> <version>`: `java` is the tool, `21.0.5-tem` is the SDKMAN identifier (`-tem` = Eclipse Temurin).

> Pin exact identifiers (`21.0.5-tem`) for reproducible builds. Without a version, SDKMAN's current default is used and your builds change when SDKMAN's default does.

## How to use it, step by step

1. **Install the extension** in your organization ([Install in your organization](#install-in-your-organization)).
2. **Check the agent** ([Requirements](#requirements)): Ubuntu hosted needs nothing; add the prerequisite step on macOS and Windows.
3. **Add `SdkmanInstall@0`** with the tools you need, as above. One line per tool.
4. **Use the tools in the following steps** as if they were installed on the agent: `mvn`, `gradle`, `java`, `$JAVA_HOME`.
5. *(Optional)* Put the versions in a `.sdkmanrc` and use `SdkmanEnv@0` instead, so developers and the pipeline share them ([The repository decides](#the-repository-decides-sdkmanrc)).

# Complete examples

The tool installation and the Maven/Gradle builds below are exercised by this repository's own validation: it installs these exact versions and builds the sample projects in [`tests/fixtures/maven-app`](tests/fixtures/maven-app) and [`tests/fixtures/gradle-app`](tests/fixtures/gradle-app) on Linux, macOS and Windows hosted agents. The publishing steps (`PublishTestResults`, `publish`) are standard Azure Pipelines steps and are not part of that test.

## Java 21 + Maven

```yaml
trigger:
  branches:
    include: [main]

pool:
  vmImage: ubuntu-latest

steps:
  - task: SdkmanInstall@0
    displayName: Java 21 and Maven
    inputs:
      candidates: |
        java 21.0.5-tem
        maven 3.9.9

  - script: mvn -B verify
    displayName: Build and test

  - task: PublishTestResults@2
    condition: succeededOrFailed()
    inputs:
      testResultsFormat: JUnit
      testResultsFiles: '**/surefire-reports/TEST-*.xml'

  - publish: target
    artifact: jar
```

## Java 21 + Gradle

```yaml
pool:
  vmImage: ubuntu-latest

steps:
  - task: SdkmanInstall@0
    displayName: Java 21 and Gradle
    inputs:
      candidates: |
        java 21.0.5-tem
        gradle 8.11.1

  - script: gradle --no-daemon build
    displayName: Build and test
```

If your repository has the **Gradle wrapper** (`gradlew`), install only Java and run `./gradlew build`: the wrapper downloads the Gradle version your project pins.

```yaml
  - task: SdkmanInstall@0
    inputs:
      candidates: java 21.0.5-tem
  - script: ./gradlew build
```

## Choosing identifiers and versions

An identifier is `<version>-<vendor suffix>`. To see what is available, run `sdk list` through `SdkmanRun`:

```yaml
- task: SdkmanRun@0
  inputs:
    commands: |
      list java
      list gradle
```

| Vendor | Suffix | Example (listed by `sdk list java` on 2026-10-17) |
| ------ | ------ | ------------------------------------------------- |
| Eclipse Temurin | `-tem` | `21.0.5-tem` |
| Azul Zulu | `-zulu` | `17.0.20+1.1-zulu` |
| Amazon Corretto | `-amzn` | `21.0.4.0+7-amzn` |
| GraalVM Community | `-graalce` | `21.0.2-graalce` |
| Microsoft | `-ms` | `21.0.0.0-ms` |
| Liberica | `-librca` | `21.0.12+1.1-librca` |

Identifiers are not uniform (some carry build numbers such as `+7` or flavours such as `.crac`/`.fx`) and they change as vendors publish builds, so **copy the exact identifier from `list java`**. A version that does not exist for the agent's platform fails immediately, without retries, and the error tells you to run `sdk list <candidate>`.

## Other tools

Any SDKMAN candidate works the same way. The names you write in `candidates` are lowercase: `maven`, `gradle`, `kotlin`, `groovy`, `scala`, `springboot`, `quarkus`, `micronaut`, `jbang`, `ant`, `sbt`, `tomcat`... (`sdk list` shows them all).

```yaml
- task: SdkmanInstall@0
  inputs:
    candidates: |
      java 21.0.5-tem
      kotlin
      springboot
- script: |
    kotlinc -version
    spring --version
```

Installed and run this way: `kotlinc` for Kotlin and `spring` for the Spring Boot CLI. Without a version, the current default of each candidate is installed (here Kotlin 2.4.21 and Spring Boot 4.1.0 on 2026-10-17): pin versions in real pipelines.

# More examples

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

An installed version is detected on disk, so a restored cache means no download. This exact example is checked by this repository's Azure pipeline: the second run restores the cache and downloads nothing. `SdkmanInstall` retries failed downloads twice.

## Using task outputs

```yaml
steps:
  - task: SdkmanInstall@0
    name: tools
    inputs:
      candidates: java 21.0.5-tem
  - script: echo '$(tools.sdkmanInstalled)'   # [{"candidate":"java","version":"21.0.5-tem","home":"...","installedNow":true,"active":true}]
```


# Troubleshooting

| Message (or symptom) | Cause | What to do |
| -------------------- | ----- | ---------- |
| `SDKMAN requires bash 4 or newer. Found /bin/bash (bash 3)...` | macOS ships bash 3.2 | Add the `brew install bash` prerequisite step ([Requirements](#requirements)). |
| `SDKMAN needs zip on the agent...` | `zip` or `unzip` is missing from the agent (Git Bash on Windows has no `zip`) | Install it; the message includes the command for your system. |
| `... failed (exit code 1) and retrying will not help` | That version, candidate or local path does not exist for this agent's platform | Run `SdkmanRun` with `list <candidate>` and use an identifier from the list. |
| `... failed (exit code 1) after 3 attempt(s). Check access to api.sdkman.io...` | The network blocked `api.sdkman.io` or the vendor's download host | Allow them, or use a mirror (`installUrl`, `candidatesApi`). |
| `... is not installed and offline mode is on` | `offline: true` and the version is not in `SDKMAN_DIR` | Restore `SDKMAN_DIR` from a cache, or turn offline mode off. |
| `SDKMAN was not found in ... automatic installation is disabled` | `autoInstallSdkman: false` and no `SdkmanSetup` step | Add `SdkmanSetup@0` or enable `autoInstallSdkman`. |
| Warning: `JAVA_HOME was '...' and is now '...'` | The agent had its own Java; the task replaced `JAVA_HOME` for the following steps | Nothing: that is the intended effect. Pin the version you want. |
| `sdk current` shows a different version than `java -version` | `sdk current` reports SDKMAN's *default*; the job uses the version the task activated | Use `JAVA_HOME` / `java -version` as the source of truth. |
| `SDKMAN does not support Cygwin` | The agent's bash is Cygwin's | Use Git Bash (`bashPath`). |

Run the pipeline with `system.debug: true` for the tasks' internal messages and SDKMAN's own debug output.


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

Workflows are locked down for forks and outside pull requests: PRs only run `ci.yml` (read-only token, no secrets, no `pull_request_target`), the Azure pipeline does not build PRs (`pr: none`), and documentation-only changes do not trigger CI. A check in `npm test` enforces these rules. Details: [`docs/DESIGN.md`](docs/DESIGN.md) ("Modelo de seguridad de CI", in Spanish).

- **GitHub Actions** (`.github/workflows`): `ci.yml` runs tests and typecheck on Linux, Windows and macOS and builds a dev `.vsix`; `validate-tasks.yml` runs the four bundled tasks end to end (real SDKMAN, real JDK downloads) on Linux, macOS and Windows runners; `release.yml` releases on pushes to `trunk` that change code.
- **Azure Pipelines** (`azure-pipelines.yml`): the same validation on Azure hosted agents (Linux, macOS and Windows). It has been run on Azure hosted agents and passes, including the macOS and Windows prerequisite steps above.

# Disclaimer

Community project, provided as is, without warranty or support. It is not affiliated with or endorsed by SDKMAN! or Microsoft. You are responsible for what runs on your agents: review the code before installing it.
