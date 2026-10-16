<p align="center"><img src="images/logo.png" alt="Logo de SDKMAN Manager" width="160"></p>

# SDKMAN Manager

🇬🇧 [English](README.md) · 🇪🇸 Español

Extensión de Azure DevOps para instalar y configurar herramientas JVM en tus pipelines con [SDKMAN!](https://sdkman.io): Java (cualquier distribución), Gradle, Maven, Kotlin, Scala, Groovy, Spring Boot CLI... todo lo que muestra `sdk list`.

Sin una tarea instaladora por herramienta y sin scripts a mano: dos tareas pequeñas que se encadenan.

| Tarea | Qué hace |
| ----- | -------- |
| `SdkmanSetup` | Instala SDKMAN (o reutiliza una instalación existente) sin tocar los perfiles de shell y expone `SDKMAN_DIR`. Opcional: `SdkmanInstall` puede hacerlo solo. |
| `SdkmanInstall` | Instala candidates (`java 21.0.5-tem`, `gradle 8.11`, `maven`...) y exporta `JAVA_HOME`, `GRADLE_HOME`... y el `PATH` para los pasos siguientes. |

> Próximamente: `SdkmanEnv` (instalar lo que pida un `.sdkmanrc`) y `SdkmanRun` (ejecutar comandos `sdk`). Ver [`docs/`](docs/).

> **No está publicada en el Marketplace.** Es un proyecto comunitario distribuido como código fuente. Constrúyela con tu propio publisher e instálala de forma privada en tu organización (ver el [README en inglés](README.md#install-in-your-organization)). Se ofrece tal cual, sin soporte.

# Requisitos

SDKMAN es un programa de bash, así que el agente necesita:

| Requisito | Notas |
| --------- | ----- |
| **bash 4 o superior** | Linux: el de serie. **macOS trae bash 3.2**: la tarea usa el bash de Homebrew (`/opt/homebrew/bin/bash`, `/usr/local/bin/bash`) si existe; si no, ejecuta `brew install bash`. |
| `curl`, `zip`, `unzip` | Debian/Ubuntu: `apt-get install -y curl zip unzip`. Alpine: `apk add bash curl zip unzip`. |
| Acceso a `get.sdkman.io`, `api.sdkman.io` y a los hosts de descarga de los vendors | O usa los inputs `installUrl` / `candidatesApi` con un mirror interno. |

Los **agentes Windows** funcionan a través de **Git Bash** (Git for Windows). Deben tener además **`zip` y `unzip`** disponibles dentro de Git Bash (no los trae; instálalos, por ejemplo desde MSYS2 o GnuWin32, en `usr\bin` o `mingw64\bin` de Git). `unzip` ya lo necesita el agente de Azure Pipelines para desempaquetar herramientas. SDKMAN no soporta Cygwin ni el bash de WSL como shell del agente; la tarea nunca elige `C:\Windows\System32\bash.exe` (usa el input `bashPath` para indicar un Git Bash concreto). El soporte de Windows es de mejor esfuerzo: aún no lo cubren las pruebas automáticas de este repositorio.

La tarea falla pronto con un mensaje accionable cuando falta algo.

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

`java` y `mvn` quedan en el PATH y se definen `JAVA_HOME` y `MAVEN_HOME`. Si SDKMAN no está en el agente, la tarea lo instala.

> Fija identifiers exactos (`21.0.5-tem`) para builds reproducibles; `sdk list java` los muestra. Sin versión se usa el default actual de SDKMAN.

# Ejemplos

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

## Caché entre ejecuciones

En agentes hospedados, cachea `SDKMAN_DIR` con `Cache@2` para no descargar los JDK en cada ejecución (ejemplo completo en el [README en inglés](README.md#caching-between-runs)). Una versión instalada se detecta en disco: con la caché restaurada no hay descarga.

# Referencia de tareas

## SdkmanSetup

| Input | Por defecto | Descripción |
| ----- | ----------- | ----------- |
| `sdkmanDir` | | `SDKMAN_DIR`. Vacío = el fijado por un paso anterior, un `~/.sdkman` existente o `<Agent.ToolsDirectory>/sdkman`. |
| `installUrl` | `https://get.sdkman.io?rcupdate=false` | URL del instalador (mirror). Conserva `rcupdate=false` para no modificar `~/.bashrc`. |
| `candidatesApi` | | Sustituye `SDKMAN_CANDIDATES_API` (por defecto `https://api.sdkman.io/2`). |
| `bashPath` | | Un ejecutable de bash 4+ concreto. |

Outputs: `sdkmanDir`, `sdkmanVersion`, `sdkmanCacheHit`.

## SdkmanInstall

| Input | Por defecto | Descripción |
| ----- | ----------- | ----------- |
| `candidates` | (obligatorio) | Uno por línea: `<candidate> [<versión>]`. `#` inicia un comentario. Repite un candidate para instalar varias versiones; la primera es la activa. |
| `autoInstallSdkman` | `true` | Instala SDKMAN si falta. |
| `setHomeVariables` | `true` | Exporta `JAVA_HOME`, `GRADLE_HOME`, `MAVEN_HOME`... (`<CANDIDATE>_HOME`). |
| `addToPath` | `true` | Antepone al PATH la carpeta `bin` de cada versión activa. |
| `sdkmanDir`, `installUrl`, `candidatesApi`, `bashPath` | | Igual que en `SdkmanSetup`. |

Outputs: `sdkmanDir`, `sdkmanInstalled` (JSON). Variables para los pasos siguientes: `<CANDIDATE>_HOME` y `SDKMAN_<CANDIDATE>_VERSION`.

- La instalación es idempotente: una versión que ya está en disco no se vuelve a descargar.
- `sdk install` siempre mueve el enlace `current` de SDKMAN a la versión recién instalada; si pides varias versiones de un candidate, la tarea devuelve `current` a la primera.
- La tarea no modifica tus perfiles de shell y no lee stdin, así que no puede quedarse bloqueada en una pregunta.

# Aviso

Proyecto comunitario, ofrecido tal cual, sin garantía ni soporte. No está afiliado ni respaldado por SDKMAN! ni por Microsoft. Eres responsable de lo que se ejecuta en tus agentes: revisa el código antes de instalarlo.
