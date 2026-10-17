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

## Decisiones de la Fase 6

- **Ajustes solo por `etc/config`**: `sdk()` lo recarga en cada llamada, así que timeouts, `insecureSsl` y `sdkman_debug_mode` se escriben ahí temporalmente (solo si el usuario los pide o `system.debug` es true) y se restaura el archivo original al terminar cada comando (`withConfigOverrides`). Limitación: el instalador inicial se descarga con Node, así que `insecureSsl` no lo afecta.
- **Reintentos con criterio**: los fallos con texto permanente (`is not available. Possible causes`, `is not a valid candidate`, `Invalid path!`) no se reintentan (antes tardaban ~20 s en fallar); el resto se reintenta 2 veces y el error final nombra `api.sdkman.io` y el host del vendor.
- **`offline` propio**: comprueba disco en vez de usar `sdk offline enable`; falla con mensaje claro si falta SDKMAN, una versión o la versión explícita.
- **F1.7 (fijar versión del CLI de SDKMAN)** sigue como P2: requeriría sustituir `SDKMAN_VERSION` en el script de instalación.

## Validación en Azure Pipelines (HECHA)

Pipeline `azdevops-extension-sdkman` (id 81, proyecto `education`, organización `henrydanielmm`, YAML `/azure-pipelines.yml`, conexión de GitHub existente). Primer run, **1918** sobre la rama `claude/optimistic-faraday-0oxar8` (commit `1e12beb`): **succeeded**, con Build (tests, typecheck, empaquetado, artefacto `tasks`) y Validate en **Linux, macOS y Windows** hospedados de Azure: 64 pasos correctos, 0 fallidos, 6 omitidos (los pasos propios de otro sistema operativo). Confirma en Azure lo que antes solo se había verificado en los mismos runners vía GitHub Actions: `download: current` + `TASKS_DIR`, la propagación de `##vso[task.prependpath]` entre pasos `script`, los prerrequisitos (brew bash en macOS, `zip` en PowerShell en Windows) y las 4 tareas con descargas reales de JDK.

Antes de ejecutarlo se revisó contra Microsoft Learn y se corrigió:

- `Agent.OS` usa `Windows_NT` / `Darwin` / `Linux` (correcto).
- Una `condition:` propia **reemplaza** el `succeeded()` por defecto: todas las condiciones del pipeline son `and(succeeded(), ...)`.
- Un `script:` de Windows es un `.cmd` temporal: solo cuenta el exit code de la última línea, y invocar un `.cmd`/`npm` sin `call` corta el paso. Por eso el prerrequisito de zip usa `powershell:` con comprobaciones, y los pasos de tareas solo invocan `node` (un `.exe`).
- Los comandos de las tareas usan `\n` literal (no `%0A`, que cmd interpretaría) y comillas dobles (portables a cmd y bash).

El `trigger`/`pr` del archivo solo apuntan a `trunk`: para otras ramas hay que lanzarlo a mano (*Run pipeline* → rama).


## Modelo de seguridad de CI (forks y PRs ajenos)

**Amenaza:** cualquiera puede hacer fork y abrir un PR. Su código (incluidos `package.json`, los scripts de npm y los propios workflows del PR) correría en nuestros runners; en Azure, además, una build de PR ejecuta el YAML mezclado del PR, así que un fork podría cambiar qué se ejecuta.

**Medidas en el repositorio (comprobadas en cada `npm test` por `scripts/check-workflows.js`, reglas en `scripts/workflow-lint.js`, con tests):**

- Solo `pull_request`, nunca `pull_request_target` ni `workflow_run`: en un PR de fork el token es de solo lectura y no hay secretos.
- `permissions: contents: read` en el nivel superior de cada workflow; la escritura solo en el job de `release`, que no se dispara con PRs (únicamente push a `trunk` y `workflow_dispatch`).
- Ningún workflow disparado por `pull_request` referencia `secrets.*`.
- `actions/checkout` con `persist-credentials: false` (el token no queda en `.git/config`).
- Nada de `${{ ... }}` dentro de `run:` salvo `matrix.*`/`runner.*`/`strategy.*`: los valores (`inputs`, `vars`, salidas de pasos, datos del evento) pasan por `env:` y se usan como variables de shell (evita la inyección de comandos).
- `timeout-minutes` en todos los jobs (acota el abuso de minutos).
- Acciones de terceros solo fijadas por SHA de commit (hoy todas son `actions/*`).
- Azure: `pr: none` (la validación de PRs la hace GitHub Actions) y toda `condition:` conserva `succeeded()`.
- `validate-tasks.yml` solo se dispara con push y a mano, nunca con PRs.
- `.github/CODEOWNERS` pide revisión del propietario para `.github/`, `azure-pipelines.yml`, `scripts/` y los `package*.json` (efectivo con la protección de rama «Require review from Code Owners»).

**Exclusiones de triggers (menos ejecuciones):** el CI ignora documentación, markdown, licencia e imágenes; `validate-tasks.yml` solo corre si cambia código, scripts, fixtures o dependencias (no con tests unitarios ni con el linter); Azure excluye markdown, `docs`, `images`, `.github`, `LICENSE` y `.gitignore`. Contrapartida: con protección de rama que *exija* el check `CI`, un PR solo de documentación se queda con el check pendiente (GitHub no lo marca como omitido); si ocurre, quitar `paths-ignore` de `ci.yml` o no exigir ese check.

**Ajustes que no están en el repositorio y conviene activar a mano (no se pueden fijar desde los workflows):**

- GitHub → Settings → Actions → General → *Fork pull request workflows from outside collaborators*: **Require approval for all outside collaborators**.
- GitHub → Settings → Actions → General → *Workflow permissions*: **Read repository contents and packages permissions**.
- GitHub → protección de rama en `trunk`: exigir PR, revisión de Code Owners y el check `CI`.
- Azure DevOps (organización o proyecto): *Securely build pull requests from forked repositories*. Con `pr: none` el pipeline no construye PRs, pero conviene dejarlo activo por si algún día se añade un trigger de PR; si se añade, usar agentes hospedados por Microsoft, no activar *Make secrets available to builds of forks* y exigir comentario de un miembro del equipo.

**Riesgos que se aceptan y por qué:** las tareas ejecutan el instalador oficial de SDKMAN (`curl | bash` de `get.sdkman.io`) y descargan JDK de los vendors; es inherente a lo que hace la extensión. Los `uses: actions/*` van por etiqueta mayor (`@v4`), no por SHA: las acciones de primera parte se consideran de confianza (el linter obliga a SHA para cualquier acción de terceros).

## Ejemplos de la documentación verificados en Azure (runs 1919 y 1920)

- **Maven y Gradle** (`tests/fixtures/maven-app`, `gradle-app`): compilan con el JDK activo en Linux, macOS y Windows hospedados de Azure (run 1919).
- **Caché con `Cache@2`** (ejemplo del README): job `cache_example` del `azure-pipelines.yml`. En el run 1919 la caché estaba vacía (el paso de comprobación se omite) y se guardó; en el run 1920 se restauró y el paso «Cache hit means nothing was downloaded» **pasó**, es decir, los JDK ya estaban en disco y `SdkmanInstall` no descargó nada.

## La rama `trunk`

Los triggers de `ci.yml` (PR a `trunk`), `release.yml` (push a `trunk`) y `azure-pipelines.yml` (push a `trunk`) apuntan a `trunk`. Se creó a partir de `claude/optimistic-faraday-0oxar8` (commit `2ae17ed`) y el pipeline de Azure (id 81) tiene `trunk` como rama por defecto.

- **Pendiente a mano:** cambiar la rama por defecto del repositorio de GitHub a `trunk` (*Settings → Branches → Default branch → Switch to another branch → `trunk` → Update*). No se puede hacer desde las herramientas de la sesión; mientras tanto la rama por defecto de GitHub sigue siendo `claude/optimistic-faraday-0oxar8`.
- **Crear una rama ya no publica nada:** `release.yml` lleva la guarda `if: github.event_name != 'push' || !github.event.created`. Sin ella, crear `trunk` habría publicado una release `v1.0.0` (sin tags previos, la primera versión calculada es `1.0.0`).
- **Los cambios llegan a `trunk` por PR/merge:** `trunk` es una foto del momento en que se creó; lo que se siga haciendo en la rama de trabajo no está en `trunk` hasta que se fusione. El primer push a `trunk` con cambios de código dispara `release.yml` y publica una release (versión `1.0.0` si no hay tags: `release.yml` calcula `1.0.0` cuando no existe ningún tag `vX.Y.Z`, no `0.1.0`).
