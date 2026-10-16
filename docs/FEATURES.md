# Features de SDKMAN Manager

Cada feature tiene un ID para referenciarla en el plan de implementación (`docs/IMPLEMENTATION_PLAN.md`). Prioridad: **P0** = MVP (v0.1), **P1** = v1.0, **P2** = después.

## F1 · Instalación de SDKMAN (`SdkmanSetup`)

| ID | Feature | Prio | Criterio de aceptación |
| -- | ------- | ---- | ---------------------- |
| F1.1 | Instalar SDKMAN en `sdkmanDir` sin tocar `~/.bashrc`/`~/.zshrc` (`rcupdate=false`). | P0 | Tras la tarea existe `<dir>/bin/sdkman-init.sh` y los rc del usuario no cambian. |
| F1.2 | Pre-chequeo de requisitos (**bash ≥ 4**, `curl`, `zip`, `unzip`) con lista de los que faltan y cómo instalarlos; en macOS busca un bash moderno de Homebrew. | P0 | En una imagen sin `zip` el error nombra `zip` y sugiere `apt-get/apk/brew`; con bash 3.2 sugiere `brew install bash`. |
| F1.3 | Reutilizar SDKMAN existente (en `SDKMAN_DIR`, tool cache o `~/.sdkman`). | P0 | Segunda ejecución: `sdkmanCacheHit=true` y sin descarga. |
| F1.4 | Outputs `sdkmanDir`, `sdkmanVersion`, `sdkmanCacheHit` y variable `SDKMAN_DIR` para pasos siguientes. | P0 | Visibles con `name:` de la tarea. |
| F1.5 | Config no interactiva forzada (`sdkman_auto_answer=true`, `auto_selfupdate=false`, `NO_COLOR=1`). | P0 | Ningún comando se queda esperando stdin. |
| F1.6 | Mirror del instalador y override de `SDKMAN_CANDIDATES_API`; `insecureSsl`, `connectTimeout`, `maxTime`. | P1 | Agente con proxy/mirror instala sin llegar a `get.sdkman.io`. |
| F1.7 | Fijar versión de SDKMAN CLI sustituyendo `SDKMAN_VERSION` en el script de instalación. | P2 | `sdk version` informa la versión pedida. |
| F1.8 | `autoInstall: false`: falla con mensaje claro si SDKMAN no está. | P1 | Mensaje accionable. |

## F2 · Instalación de candidates (`SdkmanInstall`)

| ID | Feature | Prio | Criterio de aceptación |
| -- | ------- | ---- | ---------------------- |
| F2.1 | Lista multilínea `candidate [version]` (`java 21.0.5-tem`, `gradle 8.11`). Sin versión = default de SDKMAN. | P0 | Se instalan todas, en orden, con el resultado en el resumen. |
| F2.2 | Idempotencia: si la versión ya está instalada, se reutiliza. | P0 | Segunda ejecución no descarga. |
| F2.3 | Exportar `<CANDIDATE>_HOME` y prepend de `bin` al PATH sin depender de `sdk use`. | P0 | Un paso `script` posterior ve `java -version` y `$JAVA_HOME` correctos. |
| F2.4 | Primera versión de cada candidate = activa (se exporta su ruta); al final se ejecuta `sdk default` con ella para que `current` sea coherente (`sdk install` siempre mueve `current`). | P0 | Con dos versiones de java, la activa es la indicada. |
| F2.5 | Validación de inputs antes de ejecutar (formato de identifier, candidates duplicados). | P0 | Error de input claro, sin llamar a la red. |
| F2.6 | Reintentos con backoff en descargas fallidas; error que nombra el dominio caído. | P1 | Un fallo transitorio no rompe el pipeline. |
| F2.7 | Instalar versión local (`sdk install java 21-custom /ruta`). | P1 | La ruta queda enlazada y exportada. |
| F2.8 | Modo `offline` (`sdk offline enable`) y fallo claro si la versión no está en `archives`. | P1 | Funciona con caché restaurada y sin red. |
| F2.9 | Avisar si se sobrescribe un `JAVA_HOME` previo del agente. | P1 | Línea de warning con valor anterior y nuevo. |
| F2.10 | Múltiples versiones activas a la vez (`JAVA_HOME_17`, `JAVA_HOME_21`). | P2 | Ver "ideas para después" en DESIGN. |

## F3 · `.sdkmanrc` (`SdkmanEnv`)

| ID | Feature | Prio | Criterio de aceptación |
| -- | ------- | ---- | ---------------------- |
| F3.1 | Parser de `.sdkmanrc` (`candidate=version`, comentarios, líneas vacías). | P0 | Tests con archivos válidos e inválidos. |
| F3.2 | Instalar lo que falta y activar (equivale a `sdk env install` pero con export persistente). | P0 | Mismo resultado que `SdkmanInstall` con esas líneas. |
| F3.3 | `strict`: falla si el archivo no existe; si no, warning y no-op. | P0 | Ambos modos probados. |
| F3.4 | Ruta configurable (monorepos: `services/api/.sdkmanrc`). | P1 | `sdkmanrcPath` respeta rutas relativas al repo. |

## F4 · Ejecución (`SdkmanRun`)

| ID | Feature | Prio | Criterio de aceptación |
| -- | ------- | ---- | ---------------------- |
| F4.1 | Uno o más comandos `sdk` (`list java`, `current`, `upgrade`, `flush`, `home java 21.0.5-tem`). | P0 | Salida agrupada por comando (`##[group]`). |
| F4.2 | Args pasados como array/posicionales, nunca interpolados en un string de shell. | P0 | Test: un arg con `;`/`$(...)` no se ejecuta. |
| F4.3 | `failOnError`, `workingDirectory`, `env` adicionales. | P0 | Igual que `UvRun`. |
| F4.4 | Modo `shell`: ejecutar comandos libres con el entorno SDKMAN cargado (para `./gradlew`, `mvn`, `java`). | P1 | Opt-in, documentado el riesgo. |
| F4.5 | Captura de stdout como output (`sdkmanOutput`) para el último comando. | P2 | |

## F5 · Transversales

| ID | Feature | Prio | Criterio de aceptación |
| -- | ------- | ---- | ---------------------- |
| F5.1 | Resumen markdown de la ejecución (candidates, versiones, rutas, cache hit, tiempo). | P0 | Visible en la pestaña *Extensions* del run. |
| F5.2 | `system.debug` activa `sdkman_debug_mode` y logs extra. | P1 | |
| F5.3 | Compatibilidad: Linux x64/arm64 y macOS (Intel/ARM) hosted y self-hosted. | P0 | CI verde en ubuntu y macOS. |
| F5.4 | Windows: v1 falla pronto con mensaje claro (sin soporte oficial de SDKMAN); reevaluar con spike en `windows-latest`. | P0 (error) / P2 (soporte) | Un agente Windows produce un error accionable, no un fallo críptico. |
| F5.5 | Alpine/musl con requisitos documentados. | P2 | |
| F5.6 | README.md (EN) y README.es.md (ES) con ejemplos: Java+Maven, Java+Gradle matrix, Kotlin, GraalVM native-image, `.sdkmanrc`. | P0 | Ejemplos validados en el pipeline de CI. |
| F5.7 | Guía de caché con `Cache@2` para hosted agents. | P1 | Ejemplo con clave basada en hash. |

## Ejemplos objetivo (UX deseada)

```yaml
# Caso básico
steps:
  - task: SdkmanInstall@1
    inputs:
      candidates: |
        java 21.0.5-tem
        maven 3.9.9
  - script: mvn -B verify

# El repo manda (.sdkmanrc)
steps:
  - task: SdkmanEnv@1
  - script: ./gradlew build

# Matrix de JDKs
strategy:
  matrix:
    jdk17: { jdk: 17.0.13-tem }
    jdk21: { jdk: 21.0.5-tem }
steps:
  - task: SdkmanInstall@1
    inputs:
      candidates: java $(jdk)
  - script: ./gradlew test
```
