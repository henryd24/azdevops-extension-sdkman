# Plan de implementación

Referencia: `azdevops-extension-uvpy-manager` (mismas herramientas: TypeScript, `azure-pipelines-task-lib`, `azure-pipelines-tool-lib`, `azde-scripts`, ncc, jest, `tfx-cli`). Features: ver `docs/FEATURES.md`. Decisiones: `docs/DESIGN.md`.

Cada fase termina con **tests en verde + `npm run typecheck` + commit** y deja el repo en un estado utilizable. Orden pensado para que lo más arriesgado (bash, Windows, estado entre pasos) se valide primero.

## Fase 0 · Spikes — HECHA (resultados en `DESIGN.md`)

Objetivo: cerrar las preguntas abiertas de `DESIGN.md` con evidencia, en un pipeline de prueba o contenedores.

1. En ubuntu/macOS: `curl -s "https://get.sdkman.io?rcupdate=false" | SDKMAN_DIR=/tmp/s bash`; confirmar que no toca rc y qué variables/params admite (versión fija de CLI, `SDKMAN_DIR`).
2. `bash -c 'source $SDKMAN_DIR/bin/sdkman-init.sh && sdk install java 21.0.5-tem'` con `sdkman_auto_answer=true`: confirmar que no pregunta nada y revisar exit codes en fallos (versión inexistente, sin red).
3. Confirmar `sdk home java <v>` o ruta directa `candidates/java/<v>`; qué hay en `bin/` para java/gradle/maven/kotlin.
4. **Windows**: decisión tomada por documentación oficial (sin soporte nativo, Cygwin rechazado, Git Bash sin zip/unzip): fuera de v1 con error claro. Spike real pendiente para después de v1. **macOS**: verificar bash ≥ 4 en el runner (Fase 7).
5. Medir tiempos (install SDKMAN, install JDK) para fijar timeouts por defecto.

Entregable (cumplido): sección "Resultados de la Fase 0" en `DESIGN.md`, riesgos actualizados.

## Fase 1 · Esqueleto — HECHA (solo `SdkmanSetup` y `SdkmanInstall` entran en el manifiesto; `SdkmanEnv`/`SdkmanRun` llegan en las Fases 4-5 para no publicar tareas vacías)

- Copiar de uvpy: `package.json` (renombrar a `sdkman-manager`), `tsconfig.json`, `jest.config.js`, `scripts/{tasks,run-task,expect}.js`, `config/{dev,release}.json`, `.gitignore`, `LICENSE`, `.github/workflows/{ci,release}.yml`.
- `vss-extension.json` (`id: sdkman-manager`, `publisher: hendamm`, `public: false`, 4 contributions) e `images/` (logo e icono propios).
- `src/tasks/{sdkman-setup,sdkman-install,sdkman-env,sdkman-run}/` con `task.json` (inputs de DESIGN.md, `Node20_1`), `package.json`, `tsconfig*.json`, `jest.config.js`, `testSetup.js`, `.env-test` y un `index` mínimo que solo valida inputs.
- `src/shared/`: `inputs.ts` (listas multilínea, booleanos), `args.ts` (tokenizador, portado de uvpy), `output.ts` (grupos/tablas/resumen).
- `CLAUDE.md` del proyecto (estructura, comandos, convenciones; adaptado del de uvpy).
- **Hecho cuando**: `npm ci && npm test && npm run typecheck && npm run pack:dev` generan un `.vsix` instalable con las 4 tareas (aún sin lógica).
- Features: base de F5.3, F5.6 (esqueleto de README).

## Fase 2 · Núcleo `shared/sdkman.ts` + `SdkmanSetup` — HECHA

- `platform.ts`: detectar SO/arch, rechazar Windows con mensaje claro, localizar un `bash` ≥ 4 (PATH; en macOS también `/opt/homebrew/bin`, `/usr/local/bin`), verificar requisitos (`curl`, `zip`, `unzip`) y producir el mensaje de error por distro (apt/apk/brew).
- `sdkman.ts`:
  - `ensureSdkman(opts)`: 1) tool cache / `sdkmanDir` con `sdkman-init.sh`, 2) `~/.sdkman` existente, 3) requisitos → descargar script con Node (https, con `installUrl`) → ejecutar con `bash` y `rcupdate=false` → cachear (`tool.cacheDir`) → exportar `SDKMAN_DIR`.
  - `runSdk(args, opts)`: `bash --noprofile --norc -c 'source ... ; sdk "$@"' sdk <args>`, env no interactivo, devuelve `{exitCode, stdout}`; `failOnError`.
  - `sdkmanVersion()` (`sdk version`).
- `SdkmanSetup`: inputs → `ensureSdkman` → outputs + resumen.
- Tests unitarios: parseo de versión, selección de rutas, mensajes de requisitos, construcción del comando (el comando **no** contiene los args interpolados). Prueba real en Linux x64 con `scripts/run-task.js`.
- Features: F1.1–F1.5, F1.8.
- **Hecho cuando**: segunda ejecución da `sdkmanCacheHit=true`; los archivos rc no cambian.

## Fase 3 · `SdkmanInstall` — HECHA (probada en Linux x64 con sdk real; Windows y macOS pendientes de la Fase 7)

- `inputs.ts` de la tarea: parser `candidate [version]`, validación de identifiers (regex `^[A-Za-z0-9._+-]+$`), duplicados.
- `resolveCandidateHome(candidate, version)` → `<SDKMAN_DIR>/candidates/<c>/<v>`; si no se indicó versión, leer la instalada con `sdk current`/directorio resultante.
- Flujo: `ensureSdkman({autoInstall})` → por candidate: ¿ya instalada? → `sdk install <c> <v>` (con reintentos/backoff) → `exportCandidate`: `setVariable(<C>_HOME)`, `prependPath(bin)`, outputs `sdkman.<c>.version/home`.
- Activa = primera versión de cada candidate; al terminar `sdk default <c> <v>` para que `current` coincida (`sdk install` siempre lo mueve).
- Warning si pisa `JAVA_HOME`.
- Tests unitarios + prueba real en Linux: `java 21.0.5-tem` + `maven`, verificando con `scripts/expect.js` que `java -version` y `mvn -v` salen con las rutas esperadas en un paso posterior.
- Features: F2.1–F2.6, F2.9.
- **Hecho cuando**: el ejemplo "caso básico" de FEATURES.md compila un proyecto Maven mínimo en `tests/fixtures/`.

## Fase 4 · `SdkmanEnv` (`.sdkmanrc`) — HECHA (Linux x64)

- `shared/sdkmanrc.ts`: parser (comentarios `#`, `candidate=version`, espacios).
- La tarea reutiliza el flujo de instalación de la Fase 3 con las entradas del archivo.
- `strict` y `sdkmanrcPath`.
- Fixture `tests/fixtures/sample/.sdkmanrc`.
- Features: F3.1–F3.4.
- **Hecho cuando**: un repo con `.sdkmanrc` se construye con `SdkmanEnv` + `./gradlew build` sin otros pasos.

## Fase 5 · `SdkmanRun` — HECHA (Linux x64; el test de no-inyección es de unidad y e2e)

- Modo `sdk` (por defecto): cada línea → tokenizar → `runSdk`. Salida agrupada, `failOnError`, `workingDirectory`, `env`.
- Modo `shell` (opt-in): `bash -c` con el entorno SDKMAN cargado y `*_HOME`/PATH ya exportados.
- Test explícito de no-inyección (`;`, `$(...)`, backticks en args).
- Features: F4.1–F4.4.
- **Hecho cuando**: `sdk list java`, `sdk current`, `sdk flush` funcionan en un pipeline real y un arg malicioso no se ejecuta.

## Fase 6 · Robustez y modos de red

- Mirror (`installUrl`, `candidatesApi`), `insecureSsl`, timeouts, `offline`, versión local (F2.7), `system.debug` → `sdkman_debug_mode`.
- Mensajes de error que nombren el dominio (api.sdkman.io, vendor) ante fallos de red.
- Features: F1.6, F1.7, F2.6–F2.8, F5.2.

## Fase 7 · CI y validación en agentes reales

- `azure-pipelines.yml`: ejecuta los bundles (`tasks/<tarea>/index.js`) en `ubuntu-latest` y `macOS-latest` (comprobar aquí bash ≥ 4); un job en Windows que verifique el error claro, con los fixtures. Mismo enfoque que uvpy: no instala la extensión, ejecuta el bundle desde un paso `script`.
- GitHub Actions: `ci.yml` (test + typecheck en matriz de SO, `pack:dev`), `release.yml` (release automático en push a trunk con cambios de código; variable `EXTENSION_PUBLISHER`).
- Instalar el `.vsix` dev en una organización para probar el parseo de `task.json` y el editor de pipelines.
- Añadir caso Alpine/musl si procede.
- Features: F5.3, F5.4, F5.5.
- **Hecho cuando**: pipeline verde en todos los SO soportados y documentado en `DESIGN.md` (como la sección "Validado" de uvpy).

## Fase 8 · Documentación y release

- `README.md` (EN) y `README.es.md` (ES): tabla de tareas, instalación privada en la organización, quick start, ejemplos (Java+Maven, Gradle matrix, Kotlin, GraalVM, `.sdkmanrc`), guía de caché con `Cache@2`, dominios a permitir en firewalls, disclaimer.
- Revisar `task.json` (help markdown, `helpMarkDown`, ejemplos).
- Primera release `0.1.0`.
- Features: F5.6, F5.7.

## Resumen de hitos

| Hito | Fases | Entrega |
| ---- | ----- | ------- |
| **M0 – Validado** | 0 | Riesgos cerrados con evidencia |
| **M1 – MVP (v0.1)** | 1–3 | `SdkmanSetup` + `SdkmanInstall` en Linux/macOS |
| **M2 – "El repo manda"** | 4–5 | `.sdkmanrc` y `SdkmanRun` |
| **M3 – v1.0** | 6–8 | Mirrors/offline, CI multi-SO, docs, release |

## Orden sugerido para empezar

1. Fase 0 (un solo pipeline/contenedor de prueba, hoy).
2. Fase 1 copiando de uvpy; commit con el `.vsix` vacío compilando.
3. Fase 2 y 3 en la misma sesión: es lo que da valor real (MVP).

Cada fase se puede pedir como una sesión independiente ("implementa la Fase N de `docs/IMPLEMENTATION_PLAN.md`").
