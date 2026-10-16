# Diseño de SDKMAN Manager

Extensión de Azure DevOps (publisher `hendamm`, id `sdkman-manager`) para **instalar SDKMAN!, instalar y configurar herramientas del ecosistema JVM** (Java, Gradle, Maven, Kotlin, Scala, Groovy, Spring Boot CLI, etc.) y ejecutar comandos con ellas en pipelines. Es el equivalente de [`azdevops-extension-uvpy-manager`](https://github.com/henryd24/azdevops-extension-uvpy-manager) pero para `sdk`.

## Por qué SDKMAN en pipelines

- Un solo mecanismo para cientos de herramientas (`sdk list`) en vez de una tarea por herramienta (`JavaToolInstaller`, `GradleInstaller`, ...).
- Distribuciones de Java intercambiables por *identifier* (`21.0.5-tem`, `21-zulu`, `17-amzn`, `graalce`...), imposibles de cubrir con las tareas nativas.
- `.sdkmanrc` en el repo = la misma versión en local y en CI (`sdk env`).
- Instalaciones concurrentes de varias versiones y selección por job.

## Lo que hay que respetar de SDKMAN

| Hecho | Consecuencia de diseño |
| ----- | ---------------------- |
| `sdk` es una **función de bash** definida al hacer `source $SDKMAN_DIR/bin/sdkman-init.sh`, no un binario. | Cada invocación va en `bash -c 'source init && sdk "$@"' _ <args>`. Args como parámetros posicionales: **sin interpolación de strings, sin inyección**. |
| Cada paso de Azure Pipelines es un proceso nuevo: lo que `sdk use` exporta se pierde. | No dependemos de `sdk use`. Resolvemos la ruta de la versión instalada y exportamos `<CANDIDATE>_HOME` + `PATH` con `##vso[task.setvariable]` / `prependPath`. |
| El instalador oficial (`get.sdkman.io`) exige **bash ≥ 4**, `curl`, `zip`, `unzip`. | Pre-chequeo de requisitos (incluida la versión de bash) con mensaje claro antes de instalar. |
| El instalador modifica `~/.bashrc`, `~/.zshrc`... | Se descarga `https://get.sdkman.io?rcupdate=false` (verificado: no toca los rc; sin el parámetro sí). |
| Pregunta cosas de forma interactiva (`Do you want to set X as default? (Y/n)`). | Stdin cerrado (`exec </dev/null`): los `read` de SDKMAN toman su valor por defecto. **No** se pueden forzar `sdkman_auto_answer`/colores por entorno: `sdk()` recarga `etc/config` en cada llamada (verificado en la implementación; el spike lo había dado por bueno por error). Colores y barra de curl se limpian en Node. |
| Solo corre en shells POSIX. Windows: sin soporte nativo; el instalador **rechaza Cygwin** y la doc oficial pide MSYS+MinGW o WSL. | Linux y macOS son ciudadanos de primera. **Windows fuera de v1** (ver resultados de la Fase 0). |
| `current` es un symlink que **`sdk install` mueve siempre** a la versión recién instalada (aunque `auto_answer=false`, con stdin cerrado responde Y). | Usamos la ruta explícita `$SDKMAN_DIR/candidates/<c>/<version>` para exportar. Si se instalan varias versiones, al final se ejecuta `sdk default` con la elegida para que `current` sea coherente. |
| Datos vienen de `api.sdkman.io` y de los vendors (Temurin, Azul, GraalVM, Apache...). | Inputs para timeouts, reintentos y modo offline; documentar dominios a permitir en firewalls. |

## Tareas (4, como en uvpy)

| Tarea | Qué hace |
| ----- | -------- |
| `SdkmanSetup` | Verifica requisitos, instala SDKMAN (o reutiliza el existente / cacheado), fija `SDKMAN_DIR` y expone outputs `sdkmanDir`, `sdkmanVersion`, `sdkmanCacheHit`. Opcional: las demás pueden auto-instalarlo. |
| `SdkmanInstall` | Instala uno o varios candidates (`java 21.0.5-tem`, `gradle 8.11`, `maven latest`...), elige el *default* del job y exporta `*_HOME` y `PATH`. |
| `SdkmanEnv` | Lee `.sdkmanrc` (o archivo indicado), instala lo que falta y activa esas versiones (`sdk env install` equivalente, pero con export persistente entre pasos). |
| `SdkmanRun` | Ejecuta uno o varios comandos `sdk` (`list`, `upgrade`, `flush`, `current`, `home`...) o comandos arbitrarios dentro del entorno SDKMAN. |

> `SdkmanSetup` + `SdkmanInstall` cubren el 90 % de los casos; `SdkmanEnv` es el modo "el repo manda"; `SdkmanRun` es la válvula de escape.

### Inputs principales (borrador, se cierran en `task.json`)

**SdkmanSetup**: `sdkmanDir` (def. `$(Agent.ToolsDirectory)/sdkman`), `autoUpdate` (false), `installUrl` (mirror / `https://get.sdkman.io`), `candidatesApi` (override de `SDKMAN_CANDIDATES_API`), `cache` (usar tool cache del agente), `insecureSsl`, `connectTimeout`, `maxTime`.

**SdkmanInstall**: `candidates` (multilínea `java 21.0.5-tem` / `gradle 8.11`; una por línea), `defaults` (qué versión queda activa; por defecto la primera de cada candidate), `setHomeVariables` (true), `addToPath` (true), `autoInstallSdkman` (true), `failIfMissing`, `localPath` (para `sdk install java 21-custom /path`), `offline`.

**SdkmanEnv**: `sdkmanrcPath` (def. `.sdkmanrc`), `installMissing` (true), `strict` (falla si el archivo no existe).

**SdkmanRun**: `commands` (multilínea; cada línea = `sdk <línea>`), `mode` (`sdk` | `shell`), `workingDirectory`, `env`, `failOnError`.

### Outputs / variables

`sdkmanDir`, `sdkmanVersion`, `sdkmanCacheHit`; por candidate: `JAVA_HOME`, `GRADLE_HOME`, `MAVEN_HOME`, ... (variable de pipeline + env de pasos siguientes), y `sdkman.<candidate>.version` / `sdkman.<candidate>.home` como outputs.

## Arquitectura

Misma estructura que uvpy (probada):

```
src/
  shared/
    platform.ts      # SO/arch, ruta de bash, conversión de rutas (cygpath en Windows)
    sdkman.ts        # ensureSdkman(), runSdk(), resolveCandidateHome(), exportCandidate()
    args.ts          # tokenizador de líneas (reutilizable de uvpy)
    inputs.ts        # parseo de listas multilínea "candidate version"
    sdkmanrc.ts      # parser de .sdkmanrc
    output.ts        # grupos de log, tablas, resumen markdown
  tasks/<tarea>/     # task.json, src/<tarea>.ts, src/utils/, tests
scripts/             # run-task.js, expect.js, tasks.js (copiar de uvpy)
tests/fixtures/      # .sdkmanrc de ejemplo, proyecto Gradle/Maven mínimo
```

Flujo común:

```
cada tarea ──► ensureSdkman()
                1. tool cache  2. SDKMAN_DIR existente con sdkman-init.sh  3. requisitos -> instalar -> cachear
          ──► runSdk(["install","java","21.0.5-tem"])   # bash -c, args posicionales
          ──► exportCandidate("java")                   # *_HOME + PATH + outputs
```

Contrato de `runSdk`: `bash --noprofile --norc -c 'source "$SDKMAN_DIR/bin/sdkman-init.sh" >/dev/null 2>&1; sdk "$@"' sdk <args>` con env limpio de SDKMAN (`SDKMAN_DIR`, `sdkman_auto_answer=true`, ...). Devuelve `{exitCode, stdout}`.

## Decisiones

1. **Nombres de tarea**: `SdkmanSetup`, `SdkmanInstall`, `SdkmanEnv`, `SdkmanRun` (cortos y legibles en YAML, mismo criterio que `Uv*`).
2. **Sin `sdk use`/`sdk default` para propagar estado**: se exporta explícitamente. Es más predecible y funciona igual con `sdk default` desactivado (no tocamos `candidates/*/current` salvo input `setAsDefault`).
3. **Comandos sin shell del usuario**: `SdkmanRun` en modo `sdk` nunca concatena strings; modo `shell` es opt-in y documentado como inseguro con inputs no confiables.
4. **Reproducibilidad**: se recomienda fijar identifiers exactos (`21.0.5-tem`); `latest` solo por comodidad. El resumen markdown lista lo realmente instalado.
5. **Cache**: `SDKMAN_DIR` en `Agent.ToolsDirectory` (persistente en self-hosted). Para hosted, doc con `Cache@2` sobre `$(SDKMAN_DIR)/candidates` y `archives` (clave = hash de `.sdkmanrc` / candidates).
6. **Idioma**: salida de tareas, `task.json` y `README.md` en inglés; `README.es.md`, comentarios internos y `docs/` en español (igual que uvpy).

## Resultados de la Fase 0 (spikes)

Ejecutados en Linux x64 (ubuntu, bash 5.2) con `HOME` y `SDKMAN_DIR` aislados. Script de apoyo: el patrón `run.sh` descrito en "Contrato de `runSdk`".

| # | Pregunta | Resultado |
| - | -------- | --------- |
| 1 | ¿Instala sin tocar los rc? | **Sí** con `?rcupdate=false` (hash de `.bashrc`/`.zshrc` idéntico). Sin el parámetro, `.bashrc` crece. Instalación completa en ~2 s. |
| 2 | ¿Se puede fijar `SDKMAN_DIR`? | **Sí**, el script respeta `SDKMAN_DIR` exportado. |
| 3 | ¿Cuál es la versión del CLI y se puede fijar? | La versión está **hardcodeada en el script servido** (`SDKMAN_VERSION=5.23.2`, y un CLI nativo `0.7.34`, descargados de `api.sdkman.io/2/broker/download/sdkman/install/<v>/<plataforma>`). No hay parámetro para fijarla. Opciones: (a) aceptar "última estable", (b) sustituir `SDKMAN_VERSION` en el script descargado antes de ejecutarlo (el broker sirve versiones antiguas, 5.18.2 → 200, inexistente → 404). Recomendación v1: (a) con la versión instalada visible en outputs; (b) como input avanzado. |
| 4 | ¿`sdk install` es no interactivo? | **Sí con stdin cerrado** (EOF → respuesta por defecto). Con stdin abierto y `auto_answer` sin efecto, el segundo JDK cuelga esperando "set as default? (Y/n)" (visto en la primera prueba e2e). |
| 5 | Códigos de salida | Éxito y "ya instalada" → 0. Versión inexistente → 1. Candidate inválido → 1. Sin red (`SDKMAN_CANDIDATES_API` roto) → 1 con "Internet unreachable". Se puede confiar en `exitCode`. |
| 6 | Estructura en disco | `candidates/<c>/<versión>/bin/...` (java, javac; mvn, mvnDebug) más symlink `current`. `sdk home <c> <v>` devuelve la ruta directa (exit 0). Con `JAVA_HOME` + `PATH` explícitos, `java -version` funciona sin cargar SDKMAN. |
| 7 | `.sdkmanrc` | `sdk env install` instala lo que falta y activa **solo en esa shell** (confirma que hay que exportar nosotros). |
| 8 | Colores / auto_answer | **Corrección tras implementar**: ni `sdkman_colour_enable` ni `sdkman_auto_answer` se respetan por entorno ni asignados tras el `source`, porque `sdk()` recarga `etc/config` en cada llamada (el spike 8 original concluyó mal que `NO_COLOR` funcionaba: ese test ya tenía el config modificado). Lo que sí funciona: stdin cerrado, y limpiar la salida en Node. |
| 9 | Override de API | `SDKMAN_CANDIDATES_API` se respeta (definido en `sdkman-init.sh`); sirve para mirrors y para simular caída. |
| 10 | Tiempos | `sdk install java 21.0.5-tem` ≈ 40 s en este entorno; maven, pocos segundos. Timeouts por defecto de tarea: setup 120 s, install 600 s. |
| 11 | macOS (**verificado en Fase 7**: `macos-latest` solo trae `/bin/bash` 3.2; sin brew bash la tarea falla con el mensaje `brew install bash`; con él pasa todo) |
| 11-orig | macOS | El instalador **exige bash ≥ 4** (aborta con mensaje) y macOS trae 3.2. No pude probar los runners hosted de macOS: si no traen bash ≥ 4 en el PATH, la tarea debe fallar con instrucción `brew install bash` o localizarlo en `/opt/homebrew/bin` / `/usr/local/bin`. Pendiente de verificar en la Fase 7. |
| 12 | Windows (**verificado en Fase 7 en `windows-latest`**: Git Bash 5.3 en `C:\Program Files\Git\bin\bash.exe`, `uname -s` = `MINGW64_NT` (no choca con la guarda de Cygwin), `unzip` y `curl` presentes, **`zip` ausente**; instalándolo con MSYS2 pacman y copiándolo a Git `usr\bin`, Setup + Install funcionan, incluida la conversión de rutas con `cygpath`; `JAVA_HOME` sale como `C:\hostedtoolcache\windows\sdkman\candidates\java\21.0.5-tem`). Decisión revisada: **Windows soportado con prerrequisito documentado (zip)**; ya no está fuera de v1) |
| 12-orig | Windows | No probado aquí; la documentación oficial indica que no hay soporte nativo (Git Bash + MinGW/MSYS o WSL), que Git Bash no trae `zip`/`unzip` y que el instalador rechaza Cygwin. **Decisión: Windows fuera de v1**; la tarea falla pronto con un mensaje claro ("SDKMAN no soporta agentes Windows; usa Linux/macOS o WSL"). Se reevalúa después de v1 con un spike en `windows-latest`. |

### Cambios que esto introduce en el diseño

- F1.2 incluye la comprobación de **bash ≥ 4** y, en macOS, búsqueda de un bash moderno.
- La tarea ejecuta todo con stdin cerrado y limpia la salida (colores, barra de progreso).
- `setAsDefault` deja de ser un interruptor: `sdk install` siempre mueve `current`; solo reordenamos con `sdk default` al final para coherencia.
- F1.7 (fijar versión del CLI) pasa a P2 y se implementa sustituyendo `SDKMAN_VERSION` en el script.
- Windows: la decisión original (fuera de v1) se revisó tras la Fase 7: funciona con `zip` instalado en Git Bash (documentado en el README).

## Riesgos que siguen abiertos

| Riesgo | Plan |
| ------ | ---- |
| Bash ≥ 4 en macOS hosted. | Verificar en la Fase 7; fallback de búsqueda de bash en rutas de Homebrew. |
| Rate limits / indisponibilidad de `api.sdkman.io` o de un vendor. | Reintentos con backoff en `runSdk install`, mensajes que nombren el dominio que falló. |
| Alpine/musl: faltan `bash`, `curl`, `zip`, `unzip` y no todos los candidates tienen build musl. | Chequeo de requisitos + doc; caso Alpine tarde. |
| Agentes sin internet. | `installUrl`, `candidatesApi` (verificado) y `offline`; doc de mirror interno. |
| Colisión con `JAVA_HOME` previo del agente (`JAVA_HOME_17_X64`, `JavaToolInstaller`). | `SdkmanInstall` sobrescribe `JAVA_HOME` solo para el job; warning con el valor anterior. |
| Proxy corporativo: `JAVA_TOOL_OPTIONS` de este entorno aparece en la salida de `java -version`. | Los tests de `expect.js` deben comparar con `includes`, no con igualdad. |

## Ideas para después (fuera de v1)

- Tarea `SdkmanUse` para múltiples JDKs en el mismo job (matrix de toolchains, `JAVA_HOME_<n>`).
- Integración con Azure Artifacts para Maven/Gradle (settings.xml / init.gradle).
- Publicar versiones disponibles como picklist dinámico en el editor de pipelines.
- Soporte `sdk install` desde mirror propio de binarios.
