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
| El instalador oficial (`get.sdkman.io`) exige `bash`, `curl`, `zip`, `unzip` (y `tar`, `sed`...). | Pre-chequeo de requisitos con mensaje claro antes de instalar. |
| El instalador modifica `~/.bashrc`, `~/.zshrc`... | Se usa `rcupdate=false`: el agente no se ensucia. |
| Pregunta cosas de forma interactiva (`Do you want to set X as default? (Y/n)`). | `sdkman_auto_answer=true` + `sdkman_auto_selfupdate=false` + `sdkman_colour_enable=false` siempre. |
| Solo corre en shells POSIX; en Windows requiere Git Bash / MSYS2 / WSL. | Linux y macOS son ciudadanos de primera. Windows: soporte **experimental**, tras un spike (ver riesgos). |
| `current` es un symlink; en Git Bash puede no ser un symlink real. | Usamos la ruta explícita `$SDKMAN_DIR/candidates/<c>/<version>`, nunca `current`. |
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

## Riesgos y preguntas abiertas (resolver en la Fase 0)

| Riesgo | Plan |
| ------ | ---- |
| **Windows**: Git Bash trae `bash`/`curl` pero normalmente no `zip`/`unzip`; symlinks; rutas `/c/...` vs `C:\...`. | Spike en `windows-latest`. Si no es viable, declarar Windows no soportado en v1 con error claro, no un fallo críptico. |
| Cómo fijar la versión de SDKMAN CLI (el instalador baja la última estable). | Verificar en el spike qué parámetros admite `get.sdkman.io` y el broker (`api.sdkman.io/2/broker/download/sdkman/...`); si no se puede fijar, documentarlo. |
| Rate limits / indisponibilidad de `api.sdkman.io` o de un vendor. | Reintentos con backoff en `runSdk install`, mensajes que nombren el dominio que falló. |
| Alpine/musl: SDKMAN exige `bash`, `curl`, `zip`, `unzip` y no todos los candidates tienen build musl. | Chequeo de requisitos + doc; caso Alpine tarde (como en uvpy). |
| Agentes sin internet. | `installUrl`, `candidatesApi` y `offline`; doc de mirror interno. |
| Colisión con `JAVA_HOME` previo del agente (`JAVA_HOME_17_X64`, tarea `JavaToolInstaller`). | `SdkmanInstall` sobrescribe `JAVA_HOME` solo para el job; el resumen avisa del valor anterior. |

## Ideas para después (fuera de v1)

- Tarea `SdkmanUse` para múltiples JDKs en el mismo job (matrix de toolchains, `JAVA_HOME_<n>`).
- Integración con Azure Artifacts para Maven/Gradle (settings.xml / init.gradle).
- Publicar versiones disponibles como picklist dinámico en el editor de pipelines.
- Soporte `sdk install` desde mirror propio de binarios.
