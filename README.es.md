<p align="center"><img src="images/logo.png" alt="Logo de SDKMAN Manager" width="160"></p>

# SDKMAN Manager

🇬🇧 [English](README.md) · 🇪🇸 Español

Extensión de Azure DevOps para instalar y configurar herramientas JVM en tus pipelines con [SDKMAN!](https://sdkman.io): Java (cualquier distribución), Gradle, Maven, Kotlin, Scala, Groovy, Spring Boot CLI... todo lo que muestra `sdk list`.

Sin una tarea instaladora por herramienta y sin scripts a mano: cuatro tareas pequeñas que se encadenan.

| Tarea | Qué hace |
| ----- | -------- |
| `SdkmanSetup` | Instala SDKMAN (o reutiliza una instalación existente) sin tocar los perfiles de shell y expone `SDKMAN_DIR`. Opcional: `SdkmanInstall` puede hacerlo solo. |
| `SdkmanInstall` | Instala candidates (`java 21.0.5-tem`, `gradle 8.11`, `maven`...) y exporta `JAVA_HOME`, `GRADLE_HOME`... y el `PATH` para los pasos siguientes. |

| `SdkmanEnv` | Lee un `.sdkmanrc`, instala lo que lista y lo activa para los pasos siguientes: el repositorio decide las versiones, en local y en CI. |
| `SdkmanRun` | Ejecuta comandos `sdk` (`list`, `current`, `flush`, `home`...) o cualquier comando con SDKMAN cargado. |

> **No está publicada en el Marketplace.** Es un proyecto comunitario distribuido como código fuente. Constrúyela con tu propio publisher e instálala de forma privada en tu organización (ver el [README en inglés](README.md#install-in-your-organization)). Se ofrece tal cual, sin soporte.

# Requisitos

SDKMAN es un programa de bash, así que el agente necesita:

| Requisito | Notas |
| --------- | ----- |
| **bash 4 o superior** | Linux: el de serie. **macOS trae bash 3.2**: la tarea usa el bash de Homebrew (`/opt/homebrew/bin/bash`, `/usr/local/bin/bash`) si existe; si no, ejecuta `brew install bash`. |
| `curl`, `zip`, `unzip` | Debian/Ubuntu: `apt-get install -y curl zip unzip`. Alpine: `apk add bash curl zip unzip`. |
| Acceso a `get.sdkman.io`, `api.sdkman.io` y a los hosts de descarga de los vendors | O usa los inputs `installUrl` / `candidatesApi` con un mirror interno. |

**Agentes hospedados** (comprobado en las imágenes `macos-latest` y `windows-latest` de GitHub, que son las mismas que hospeda Azure Pipelines):

| Agente | Qué falta | Paso de prerrequisito |
| ------ | --------- | --------------------- |
| `ubuntu-latest` | nada | ninguno |
| `macOS-latest` | solo hay bash 3.2 | `brew install bash` y añadir `$(brew --prefix)/bin` al PATH |
| `windows-latest` | Git Bash trae `unzip` y `curl`, pero **no `zip`** | instalar `zip` en Git Bash |

Los pasos de YAML exactos están en el [README en inglés](README.md#requirements).

Los **agentes Windows** funcionan a través de **Git Bash** (Git for Windows, en `C:\Program Files\Git\bin\bash.exe`) y necesitan **`zip` y `unzip`** dentro de Git Bash. `unzip` también lo necesita el propio agente de Azure Pipelines para desempaquetar herramientas. SDKMAN no soporta Cygwin ni el bash de WSL como shell del agente: la tarea nunca elige `C:\Windows\System32\bash.exe` (usa el input `bashPath` para indicar un Git Bash concreto). En agentes Windows self-hosted instala `zip` y `unzip` en `usr\bin` de Git (por ejemplo desde MSYS2 o GnuWin32).

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

En agentes hospedados, cachea `SDKMAN_DIR` con `Cache@2` para no descargar los JDK en cada ejecución (ejemplo completo en el [README en inglés](README.md#caching-between-runs)). Una versión instalada se detecta en disco: con la caché restaurada no hay descarga.

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

# Aviso

Proyecto comunitario, ofrecido tal cual, sin garantía ni soporte. No está afiliado ni respaldado por SDKMAN! ni por Microsoft. Eres responsable de lo que se ejecuta en tus agentes: revisa el código antes de instalarlo.
