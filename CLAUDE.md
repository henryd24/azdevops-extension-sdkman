# SDKMAN Manager — contexto para Claude

Extensión de Azure DevOps (publisher `hendamm`) que instala **SDKMAN!** y herramientas JVM (Java, Gradle, Maven, Kotlin...) en agentes Linux/macOS (Windows vía Git Bash; requiere `zip`, ver README). Basada en el patrón de `azdevops-extension-uvpy-manager`. Idioma de trabajo con el usuario: español. Lo público va en inglés: `README.md` (principal), `task.json` y toda la salida de las tareas; `README.es.md` es la versión en español y debe mantenerse en paralelo. Comentarios internos y `docs/` en español.

## Estado

Fases 1-6 de `docs/IMPLEMENTATION_PLAN.md` hechas: `SdkmanSetup`, `SdkmanInstall`, `SdkmanEnv` (.sdkmanrc), `SdkmanRun` (modos `sdk` y `shell`). Fase 7 hecha: `azure-pipelines.yml` ejecutado y verde en Azure (pipeline id 81, proyecto `education`, run 1918: Linux, macOS y Windows). Pendiente: docs finales y primera release (Fase 8). Decisiones y resultados de los spikes: `docs/DESIGN.md`.

## Estructura

- `src/shared/` — `platform.ts` (bash >= 4, requisitos, mensajes), `sdkman.ts` (`ensureSdkman`, `runSdk`, `fetchDefaultVersion`), `candidates.ts` (parsers `candidate [version]` y `.sdkmanrc`), `install.ts` (instalación idempotente con reintentos, pura), `config.ts` (ajustes temporales de `etc/config`), `activate.ts` (`installAndActivate`: instala + exporta `*_HOME`/PATH + resumen; lo usan SdkmanInstall y SdkmanEnv), `args.ts` (`splitArgs`, `parseEnv`), `inputs.ts`, `output.ts` (grupos del log, tablas, resumen markdown).
- `src/tasks/<tarea>/` — `sdkman-setup`, `sdkman-install`, `sdkman-env`, `sdkman-run`. Cada una: `task.json`, `src/<tarea>.ts`, `src/utils/`, tests en `src/__tests__/`.
- `scripts/run-task.js` ejecuta un bundle como el agente (`INPUT_*`, defaults de `task.json`); `scripts/expect.js` comprueba la salida de un comando.
- Los `inputs.ts` de cada tarea importan `shared/inputs` / `shared/candidates` directamente (no el barrel `shared`), para que los tests no carguen `tool-lib`.

## Comandos

```bash
npm ci                   # instala raíz y tareas (postinstall)
npm test                 # jest de src/shared + cada tarea
npm run typecheck
npm run package:tasks    # bundles ncc en ./tasks
npm run pack:dev         # .vsix de desarrollo
node scripts/run-task.js sdkman-install "candidates=java 21.0.5-tem"   # tras package:tasks
```

## Reglas aprendidas (verificadas, no las rompas)

- `sdk` es una función de bash: se invoca con `bash --noprofile --norc -c '<SDK_SCRIPT>' sdk <args>`; los args van **posicionales**, nunca dentro del string.
- `sdk()` **recarga `etc/config` en cada llamada** (`sdkman-main.sh`) y pisa cualquier variable `sdkman_*` (`auto_answer`, `colour_enable`...) que fijes por entorno o tras el `source`. No funciona forzarlas; y el config puede ser del usuario (`~/.sdkman`), así que no se escribe.
- `azure-pipelines-task-lib` no tiene opción `input` ni cierra stdin: `SDK_SCRIPT` hace `exec </dev/null`, de modo que los `read` de SDKMAN reciben EOF y toman su valor por defecto (verificado: "set as default? (Y/n)" -> Y). Si añades otra invocación de bash, ciérrala igual. Sin esto, un segundo JDK cuelga el paso.
- Modo `shell` de SdkmanRun: `sdkman-init.sh` reescribe el entorno (PATH con `candidates/*/current/bin`, `JAVA_HOME=.../current`). `SHELL_SCRIPT` guarda `export -p` antes del `source` y lo restaura después; así el comando ve lo mismo que los pasos siguientes y `sdk` sigue siendo una función. Verificado: sin esto `$JAVA_HOME` salía como `.../java/current`.
- `connectTimeout`/`maxTime`/`insecureSsl`/debug solo funcionan escribiendo `etc/config`: `withConfigOverrides` lo hace **solo si el usuario lo pide** y restaura el original tras cada comando (en `runBash`). Sin overrides, el archivo no se toca (hay test).
- Fallos de `sdk install` permanentes (no reintentar): `is not available. Possible causes`, `is not a valid candidate`, `Invalid path!` (`isPermanentFailure`, texto verificado con SDKMAN 5.23). `RunSdkResult.output` junta stdout+stderr porque SDKMAN usa ambos.
- Versión local: `sdk install <c> <v> <ruta>` crea el symlink `candidates/<c>/<v>`; en `.sdkmanrc` no existe esa sintaxis.
- Los colores y la barra de progreso de curl no se pueden desactivar: `cleanSdkOutput` los quita del log (`runSdk` imprime la salida limpia y devuelve `stdout` sin tocar).
- `sdk install` siempre mueve `current`; se exportan rutas explícitas `candidates/<c>/<v>` y, con varias versiones, se restaura `current` con `sdk default`.
- El instalador se descarga de `https://get.sdkman.io?rcupdate=false` (sin el parámetro modifica `~/.bashrc`) y exige bash >= 4 (macOS trae 3.2).
- Rutas con `path.join` explícito (los tests corren en Windows). Nunca `rm -rf` sobre variables de entorno sin resolver al probar en local: usa directorios nuevos.

## Validación en runners reales

`.github/workflows/validate-tasks.yml` ejecuta las 4 tareas en ubuntu/macOS/Windows (mismas imágenes que Azure hosted) y aplica los `##vso` con `scripts/apply-vso.js`. Hechos verificados: macOS hospedado solo trae bash 3.2 (hace falta `brew install bash`); Windows hospedado tiene Git Bash con `unzip`/`curl` pero sin `zip` (MSYS2 `pacman -S zip` + copiar `zip.exe` a `C:\Program Files\Git\usr\bin`). `azure-pipelines.yml` se ejecutó en Azure con éxito (ver `docs/DESIGN.md`, «Validación en Azure Pipelines»).
- Pasar `npm test` completo antes de subir: `jest` falla si una tarea no tiene tests (`sdkman-setup` lo hizo en CI); no filtres la salida con `grep` sin mirar el exit code.
- En `azure-pipelines.yml`: toda `condition:` debe llevar `and(succeeded(), ...)` (una condición propia sustituye al `succeeded()` por defecto); en Windows un `script:` es un `.cmd` donde solo cuenta la última línea: usa `powershell:` para varios comandos que deban fallar el paso, y `call` antes de cualquier `.cmd`/`npm`.
