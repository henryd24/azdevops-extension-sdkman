<p align="center"><img src="images/logo.png" alt="Logo de SDKMAN Manager" width="160"></p>

# SDKMAN Manager

🇬🇧 [English](README.md) · 🇪🇸 Español

Extensión de Azure DevOps para instalar y configurar herramientas JVM en tus pipelines con [SDKMAN!](https://sdkman.io): Java (cualquier distribución), Gradle, Maven, Kotlin, Scala, Groovy, Spring Boot CLI... todo lo que muestra `sdk list`.

Sin una tarea instaladora por herramienta y sin scripts a mano: cuatro tareas pequeñas que se encadenan.

| Tarea | Qué hace |
| ----- | -------- |
| `SdkmanSetup` | Instala SDKMAN (o reutiliza una instalación existente) sin tocar los perfiles de shell y expone `SDKMAN_DIR`. Opcional: `SdkmanInstall` puede hacerlo solo. |
| `SdkmanInstall` | Instala candidates (`java 21.0.5-tem`, `gradle 8.11.1`, `maven`...) y exporta `JAVA_HOME`, `GRADLE_HOME`... y el `PATH` para los pasos siguientes. |

| `SdkmanEnv` | Lee un `.sdkmanrc`, instala lo que lista y lo activa para los pasos siguientes: el repositorio decide las versiones, en local y en CI. |
| `SdkmanRun` | Ejecuta comandos `sdk` (`list`, `current`, `flush`, `home`...) o cualquier comando con SDKMAN cargado. |

> **No está publicada en el Marketplace.** Es un proyecto comunitario distribuido como código fuente. Constrúyela con tu propio publisher e instálala de forma privada en tu organización (ver el [README en inglés](README.md#install-in-your-organization)). Se ofrece tal cual, sin soporte.

# Requisitos

**Respuesta corta:** en agentes Ubuntu hospedados por Microsoft no necesitas nada. En macOS y Windows hospedados añades un paso de prerrequisito (abajo). **No** necesitas Java, Maven, Gradle ni SDKMAN en el agente de antemano: eso es lo que instalan las tareas.

## Qué necesita un agente

SDKMAN es un programa de bash, así que el agente necesita:

| Requisito | Notas |
| --------- | ----- |
| **bash 4 o superior** | Linux: el de serie. macOS trae bash 3.2 (ver abajo). Windows: Git Bash. |
| `curl`, `zip`, `unzip` | El instalador de SDKMAN los comprueba y `sdk install` desempaqueta los JDK con ellos. |
| Acceso de red a `get.sdkman.io`, `api.sdkman.io` y a los hosts de descarga de los vendors | SDKMAN redirige cada descarga al host del vendor. Tras un firewall, usa un mirror interno ([Mirrors, proxies y agentes sin red](#mirrors-proxies-y-agentes-sin-red)) o una lista de permitidos. |
| Un `SDKMAN_DIR` con permiso de escritura | Por defecto `<Agent.ToolsDirectory>/sdkman`; cambia `sdkmanDir` para moverlo. |
| Espacio en disco | Unos 200 MB por descarga de JDK, más el JDK desempaquetado. Añade `Cache@2` ([Caché entre ejecuciones](#caché-entre-ejecuciones)) para no repetirlo. |

El agente de Azure Pipelines ya trae Node.js, que es todo lo que necesitan las propias tareas. La tarea falla pronto con un mensaje accionable cuando falta algo.

## Agentes hospedados por Microsoft

Comprobado en agentes hospedados de Azure Pipelines (y en las imágenes equivalentes de GitHub):

| Agente | Qué falta | Paso de prerrequisito |
| ------ | --------- | --------------------- |
| `ubuntu-latest` | nada | ninguno |
| `macOS-latest` | solo hay bash 3.2 | `brew install bash` y añadir `$(brew --prefix)/bin` al PATH |
| `windows-latest` | Git Bash trae `unzip` y `curl`, pero **no `zip`** | instalar `zip` en Git Bash |

Añade estos pasos **antes** de las tareas de SDKMAN (se omiten en los otros sistemas):

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

Los **agentes Windows** funcionan a través de **Git Bash** (Git for Windows, en `C:\Program Files\Git\bin\bash.exe`) y necesitan **`zip` y `unzip`** dentro de Git Bash. SDKMAN no soporta Cygwin ni el bash de WSL como shell del agente: la tarea nunca elige `C:\Windows\System32\bash.exe` (usa el input `bashPath` para indicar un Git Bash concreto).

## Agentes self-hosted

Linux, con los paquetes que necesita SDKMAN (Debian/Ubuntu):

```bash
apt-get update && apt-get install -y --no-install-recommends bash curl zip unzip ca-certificates
```

(Alpine: `apk add bash curl zip unzip`; Alpine/musl no lo cubren las pruebas de este proyecto.) En macOS instala un bash moderno con `brew install bash`; en Windows instala Git for Windows y añade `zip` a `usr\bin` de Git (por ejemplo desde MSYS2 o GnuWin32).

# Instalar en tu organización

Una extensión de Azure DevOps está ligada a su publisher, así que la construyes con *tu* publisher y la instalas de forma *privada* en *tu* organización.

1. **Crea un publisher** (gratis) en <https://marketplace.visualstudio.com/manage> y anota su ID, por ejemplo `my-publisher`.
2. **Obtén el código**: haz fork o clona este repositorio.
3. **Construye el `.vsix`** (Node.js 20+):

   ```bash
   npm ci
   npm run pack -- --publisher my-publisher
   ```
4. **Súbelo** (sigue siendo privado) y compártelo con tu organización, en el portal (*New extension → Azure DevOps → upload → Share*) o con la CLI y un PAT con el alcance **Marketplace (Manage)**:

   ```bash
   npx tfx extension publish --vsix my-publisher.sdkman-manager-*.vsix --share-with my-organization --token <PAT>
   ```
5. **Instálala** en *Organization settings → Extensions → Shared*.

En un fork, define la variable de repositorio `EXTENSION_PUBLISHER` y cada push a `trunk` que cambie código crea un GitHub Release con el `.vsix` construido para tu publisher.

# Inicio rápido

```yaml
steps:
  - task: SdkmanInstall@0
    inputs:
      candidates: |
        java 21.0.5-tem
        maven 3.9.9
  - script: mvn -B verify
```

`java` y `mvn` quedan en el PATH y se definen `JAVA_HOME` y `MAVEN_HOME` para todos los pasos siguientes. Si SDKMAN no está en el agente, la tarea lo instala. Cada línea de `candidates` es `<candidate> <versión>`: `java` es la herramienta y `21.0.5-tem` el identifier de SDKMAN (`-tem` = Eclipse Temurin).

> Fija identifiers exactos (`21.0.5-tem`) para builds reproducibles. Sin versión se usa el default actual de SDKMAN y tus builds cambian cuando cambia ese default.

## Cómo se usa, paso a paso

1. **Instala la extensión** en tu organización ([Instalar en tu organización](#instalar-en-tu-organización)).
2. **Revisa el agente** ([Requisitos](#requisitos)): Ubuntu hospedado no necesita nada; en macOS y Windows añade el paso de prerrequisito.
3. **Añade `SdkmanInstall@0`** con las herramientas que necesites, como arriba. Una línea por herramienta.
4. **Usa las herramientas en los pasos siguientes** como si estuvieran instaladas en el agente: `mvn`, `gradle`, `java`, `$JAVA_HOME`.
5. *(Opcional)* Pon las versiones en un `.sdkmanrc` y usa `SdkmanEnv@0`, así desarrolladores y pipeline comparten versiones ([El repositorio manda](#el-repositorio-manda-sdkmanrc)).

# Ejemplos completos

La instalación de herramientas y las compilaciones Maven/Gradle de abajo las ejercita la propia validación de este repositorio: instala estas versiones exactas y compila los proyectos de ejemplo de [`tests/fixtures/maven-app`](tests/fixtures/maven-app) y [`tests/fixtures/gradle-app`](tests/fixtures/gradle-app) en agentes hospedados de Linux, macOS y Windows. Los pasos de publicación (`PublishTestResults`, `publish`) son pasos estándar de Azure Pipelines y no forman parte de esa prueba.

## Java 21 + Maven

```yaml
trigger:
  branches:
    include: [main]

pool:
  vmImage: ubuntu-latest

steps:
  - task: SdkmanInstall@0
    displayName: Java 21 y Maven
    inputs:
      candidates: |
        java 21.0.5-tem
        maven 3.9.9

  - script: mvn -B verify
    displayName: Compilar y probar

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
    displayName: Java 21 y Gradle
    inputs:
      candidates: |
        java 21.0.5-tem
        gradle 8.11.1

  - script: gradle --no-daemon build
    displayName: Compilar y probar
```

Si tu repositorio tiene el **wrapper de Gradle** (`gradlew`), instala solo Java y ejecuta `./gradlew build`: el wrapper descarga la versión de Gradle que fija tu proyecto.

```yaml
  - task: SdkmanInstall@0
    inputs:
      candidates: java 21.0.5-tem
  - script: ./gradlew build
```

## Elegir identifiers y versiones

Un identifier es `<versión>-<sufijo del vendor>`. Para ver qué hay disponible, ejecuta `sdk list` con `SdkmanRun`:

```yaml
- task: SdkmanRun@0
  inputs:
    commands: |
      list java
      list gradle
```

| Vendor | Sufijo | Ejemplo (listado por `sdk list java` el 2026-10-17) |
| ------ | ------ | --------------------------------------------------- |
| Eclipse Temurin | `-tem` | `21.0.5-tem` |
| Azul Zulu | `-zulu` | `17.0.20+1.1-zulu` |
| Amazon Corretto | `-amzn` | `21.0.4.0+7-amzn` |
| GraalVM Community | `-graalce` | `21.0.2-graalce` |
| Microsoft | `-ms` | `21.0.0.0-ms` |
| Liberica | `-librca` | `21.0.12+1.1-librca` |

Los identifiers no son uniformes (algunos llevan números de build como `+7` o variantes como `.crac`/`.fx`) y cambian cuando los vendors publican builds, así que **copia el identifier exacto de `list java`**. Una versión que no existe para la plataforma del agente falla al instante, sin reintentos, y el error te indica ejecutar `sdk list <candidate>`.

## Otras herramientas

Cualquier candidate de SDKMAN funciona igual. Los nombres que escribes en `candidates` van en minúsculas: `maven`, `gradle`, `kotlin`, `groovy`, `scala`, `springboot`, `quarkus`, `micronaut`, `jbang`, `ant`, `sbt`, `tomcat`... (`sdk list` los muestra todos).

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

Instaladas y ejecutadas así: `kotlinc` para Kotlin y `spring` para la CLI de Spring Boot. Sin versión se instala el default actual de cada candidate (aquí Kotlin 2.4.21 y Spring Boot 4.1.0 el 2026-10-17): fija versiones en pipelines reales.

# Más ejemplos

## Varios JDK (el primero listado de cada candidate es el activo)

```yaml
steps:
  - task: SdkmanInstall@0
    inputs:
      candidates: |
        java 21.0.5-tem
        java 17.0.13-tem
        gradle 8.11
  - script: ./gradlew build
```

Cada versión queda en `$(SDKMAN_DIR)/candidates/<candidate>/<versión>`.

## Usar `sdk` en un paso `script`

```yaml
steps:
  - task: SdkmanSetup@0
  - bash: |
      source "$SDKMAN_DIR/bin/sdkman-init.sh"
      sdk list java | head
```

## El repositorio manda: `.sdkmanrc`

Versiona un `.sdkmanrc` (el mismo archivo que lee `sdk env` en local):

```
java=21.0.5-tem
gradle=8.11
```

y el pipeline solo lo sigue:

```yaml
steps:
  - task: SdkmanEnv@0
  - script: ./gradlew build
```

En un monorepo indica la ruta: `sdkmanrcPath: services/api/.sdkmanrc`. Con `strict: false`, un archivo ausente solo avisa y omite el paso.

## Ejecutar comandos `sdk`

```yaml
steps:
  - task: SdkmanRun@0
    inputs:
      commands: |
        version
        list java
        home java 21.0.5-tem
```

Cada línea llega a `sdk` **como argumentos**, nunca interpolada en un string de shell: valores con `;`, `$(...)` o comillas son inertes. Para comandos libres con SDKMAN cargado usa `mode: shell`; cada línea la interpreta bash, así que no pongas valores no confiables (por ejemplo variables del pipeline que vengan de títulos de pull requests):

```yaml
  - task: SdkmanRun@0
    inputs:
      mode: shell
      commands: |
        java -version
        mvn -v
```

En ambos modos los comandos ven el mismo `JAVA_HOME` y `PATH` que los pasos siguientes (las versiones activadas por `SdkmanInstall` / `SdkmanEnv`). Ojo: `sdk current` informa los *defaults* de SDKMAN, que pueden diferir de los activados para el job si instalaste varias versiones.

## Mirrors, proxies y agentes sin red

| Situación | Qué configurar |
| --------- | -------------- |
| Sin acceso a `get.sdkman.io` | `installUrl`: tu copia interna del instalador (conserva `rcupdate=false` en la URL). |
| Sin acceso a `api.sdkman.io` | `candidatesApi`: un mirror de la API de SDKMAN (`SDKMAN_CANDIDATES_API`). |
| Proxy lento | `connectTimeout` / `maxTime` (segundos). |
| Proxy que re-firma TLS | `insecureSsl: true` (omite la verificación de certificados en el curl de `sdk`; no afecta a la descarga inicial del instalador). Mejor arreglar el almacén de confianza del agente. |
| Sin red | `offline: true`: solo se usan versiones ya presentes en `SDKMAN_DIR` (restáuralo desde una caché), cada candidate necesita versión explícita y no se descarga ni instala nada. |

`connectTimeout`, `maxTime`, `insecureSsl` y `system.debug` solo se pueden aplicar mediante `etc/config` de SDKMAN, así que la tarea los escribe ahí **solo cuando los indicas** y restaura el archivo original al terminar cada comando. Con `system.debug: true` se activa la salida de depuración de SDKMAN.

Las descargas fallidas se reintentan dos veces. Los fallos que no mejoran (versión inexistente para la plataforma, candidate desconocido, ruta local inválida) fallan al instante; si se agotan los reintentos, el error nombra `api.sdkman.io` y el host de descarga del vendor.

## Una carpeta local como versión

Un JDK que ya existe en el agente puede registrarse como versión de SDKMAN con una tercera palabra:

```yaml
- task: SdkmanInstall@0
  inputs:
    candidates: |
      java 21-custom /opt/jdk-21
```

Entrecomilla las rutas con espacios. En Windows usa rutas POSIX (`/c/tools/jdk-21`).

## Caché entre ejecuciones

SDKMAN guarda lo que instala en `SDKMAN_DIR`. En agentes hospedados, cachéalo con `Cache@2` para no descargar los JDK en cada ejecución:

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

Una versión instalada se detecta en disco, así que con la caché restaurada no hay descarga. `SdkmanInstall` reintenta dos veces las descargas fallidas.

## Usar los outputs de las tareas

```yaml
steps:
  - task: SdkmanInstall@0
    name: tools
    inputs:
      candidates: java 21.0.5-tem
  - script: echo '$(tools.sdkmanInstalled)'   # [{"candidate":"java","version":"21.0.5-tem","home":"...","installedNow":true,"active":true}]
```

# Resolución de problemas

| Mensaje (o síntoma) | Causa | Qué hacer |
| ------------------- | ----- | --------- |
| `SDKMAN requires bash 4 or newer. Found /bin/bash (bash 3)...` | macOS trae bash 3.2 | Añade el paso de prerrequisito `brew install bash` ([Requisitos](#requisitos)). |
| `SDKMAN needs zip on the agent...` | Falta `zip` o `unzip` en el agente (Git Bash en Windows no trae `zip`) | Instálalo; el mensaje incluye el comando para tu sistema. |
| `... failed (exit code 1) and retrying will not help` | Esa versión, candidate o ruta local no existe para la plataforma del agente | Ejecuta `SdkmanRun` con `list <candidate>` y usa un identifier de la lista. |
| `... failed (exit code 1) after 3 attempt(s). Check access to api.sdkman.io...` | La red bloqueó `api.sdkman.io` o el host de descarga del vendor | Permítelos o usa un mirror (`installUrl`, `candidatesApi`). |
| `... is not installed and offline mode is on` | `offline: true` y la versión no está en `SDKMAN_DIR` | Restaura `SDKMAN_DIR` desde una caché o desactiva el modo offline. |
| `SDKMAN was not found in ... automatic installation is disabled` | `autoInstallSdkman: false` y no hay paso `SdkmanSetup` | Añade `SdkmanSetup@0` o activa `autoInstallSdkman`. |
| Aviso: `JAVA_HOME was '...' and is now '...'` | El agente tenía su propio Java; la tarea reemplazó `JAVA_HOME` para los pasos siguientes | Nada: es el efecto buscado. Fija la versión que quieras. |
| `sdk current` muestra una versión distinta de `java -version` | `sdk current` informa el *default* de SDKMAN; el job usa la versión que activó la tarea | Usa `JAVA_HOME` / `java -version` como fuente de verdad. |
| `SDKMAN does not support Cygwin` | El bash del agente es el de Cygwin | Usa Git Bash (`bashPath`). |

Ejecuta el pipeline con `system.debug: true` para ver los mensajes internos de las tareas y la salida de depuración de SDKMAN.

# Referencia de tareas

## SdkmanSetup

| Input | Por defecto | Descripción |
| ----- | ----------- | ----------- |
| `sdkmanDir` | | `SDKMAN_DIR`. Vacío = el fijado por un paso anterior, un `~/.sdkman` existente o `<Agent.ToolsDirectory>/sdkman`. |
| `installUrl` | `https://get.sdkman.io?rcupdate=false` | URL del instalador (mirror). Conserva `rcupdate=false` para no modificar `~/.bashrc`. |
| `candidatesApi` | | Sustituye `SDKMAN_CANDIDATES_API` (por defecto `https://api.sdkman.io/2`). |
| `bashPath` | | Un ejecutable de bash 4+ concreto. |
| `offline`, `connectTimeout`, `maxTime`, `insecureSsl` | | Opciones de red, ver [Mirrors, proxies y agentes sin red](#mirrors-proxies-y-agentes-sin-red). Las cuatro tareas las aceptan. |

Outputs: `sdkmanDir`, `sdkmanVersion`, `sdkmanCacheHit`.

## SdkmanInstall

| Input | Por defecto | Descripción |
| ----- | ----------- | ----------- |
| `candidates` | (obligatorio) | Uno por línea: `<candidate> [<versión> [<ruta local>]]`. `#` inicia un comentario. Repite un candidate para instalar varias versiones; la primera es la activa. |
| `autoInstallSdkman` | `true` | Instala SDKMAN si falta. |
| `setHomeVariables` | `true` | Exporta `JAVA_HOME`, `GRADLE_HOME`, `MAVEN_HOME`... (`<CANDIDATE>_HOME`). |
| `addToPath` | `true` | Antepone al PATH la carpeta `bin` de cada versión activa. |
| `sdkmanDir`, `installUrl`, `candidatesApi`, `bashPath` | | Igual que en `SdkmanSetup`. |

Outputs: `sdkmanDir`, `sdkmanInstalled` (JSON). Variables para los pasos siguientes: `<CANDIDATE>_HOME` y `SDKMAN_<CANDIDATE>_VERSION`.

- La instalación es idempotente: una versión que ya está en disco no se vuelve a descargar.
- `sdk install` siempre mueve el enlace `current` de SDKMAN a la versión recién instalada; si pides varias versiones de un candidate, la tarea devuelve `current` a la primera.
- La tarea no modifica tus perfiles de shell y no lee stdin, así que no puede quedarse bloqueada en una pregunta.

## SdkmanEnv

| Input | Por defecto | Descripción |
| ----- | ----------- | ----------- |
| `sdkmanrcPath` | `.sdkmanrc` | Relativo al directorio de trabajo. |
| `strict` | `true` | Falla si el archivo falta o está vacío. Si se desactiva, el paso se omite con un aviso. |
| `autoInstallSdkman`, `setHomeVariables`, `addToPath` | `true` | Como en `SdkmanInstall`. |
| `sdkmanDir`, `installUrl`, `candidatesApi`, `bashPath` | | Como en `SdkmanSetup`. |

Formato: un `candidate=versión` por línea, comentarios con `#`. La versión es obligatoria y cada candidate aparece una vez. Outputs: `sdkmanDir`, `sdkmanInstalled` (JSON).

## SdkmanRun

| Input | Por defecto | Descripción |
| ----- | ----------- | ----------- |
| `commands` | (obligatorio) | Uno por línea. En modo `sdk` el prefijo `sdk` es opcional. Cada línea se ejecuta por separado. |
| `mode` | `sdk` | `sdk`: argumentos pasados a `sdk` de forma segura. `shell`: cada línea la interpreta bash con SDKMAN cargado. |
| `workingDirectory` | `$(System.DefaultWorkingDirectory)` | Dónde se ejecutan. |
| `env` | | `KEY=VALUE` por línea para los comandos. |
| `failOnError` | `true` | Se detiene en el primer comando que falla y falla la tarea; si se desactiva, corre todos y termina con avisos. |

Output: `exitCode` (0, o el del primer comando que falló).

# CI / CD

- **GitHub Actions** (`.github/workflows`): `ci.yml` ejecuta tests y typecheck en Linux, Windows y macOS y construye un `.vsix` de desarrollo; `validate-tasks.yml` ejecuta las cuatro tareas de punta a punta (SDKMAN real, descargas reales de JDK) en runners de Linux, macOS y Windows; `release.yml` publica una release en cada push a `trunk` que cambie código.
- **Azure Pipelines** (`azure-pipelines.yml`): la misma validación en agentes hospedados de Azure (Linux, macOS y Windows). Se ha ejecutado en agentes hospedados de Azure y pasa, incluidos los pasos de prerrequisito de macOS y Windows.

# Aviso

Proyecto comunitario, ofrecido tal cual, sin garantía ni soporte. No está afiliado ni respaldado por SDKMAN! ni por Microsoft. Eres responsable de lo que se ejecuta en tus agentes: revisa el código antes de instalarlo.
