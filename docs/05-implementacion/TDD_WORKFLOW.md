# Flujo TDD-First + Scope Lock — InvitacionesPremium

**Objetivo:** ChatGPT escribe las pruebas y los límites; Codex/Gemini implementan únicamente el comportamiento probado. Usar TDD para cambios funcionales verificables. L0 CSS/copy se valida mediante criterios visuales.

## 1. Crear tarea RED (ChatGPT, GitHub)

Crear rama `tdd/<ID>` desde `main` y, en **un mismo commit inicial**, añadir el contrato `tdd/contracts/<ID>.json` y sus pruebas RED. Nunca subir pruebas fallidas a `main`.

Ejemplo de contrato (sólo ilustrativo):

```json
{
  "schemaVersion": 1,
  "taskId": "IP-TDD-001",
  "executor": "codex",
  "risk": "L2",
  "testPaths": ["apps/api/src/example/example.spec.ts"],
  "implementationPaths": ["apps/api/src/example/example.service.ts"],
  "qaCommands": [
    ["pnpm", "--filter", "@invitaciones/api", "exec", "vitest", "run", "src/example/example.spec.ts"],
    ["pnpm", "--filter", "@invitaciones/api", "typecheck"]
  ],
  "acceptance": ["Comportamiento esperado verificado por example.spec.ts."]
}
```

Para L3 añadir `"independentReviewRequired": true` y cubrir casos negativos/regresiones de seguridad. Usar sólo archivos exactos, o prefijos `ruta/**` si son inevitables y están justificados.

## 2. Sincronizar en VS Code o Antigravity

```bash
git status --short
git fetch origin
git switch --track origin/tdd/<ID>
```

Si la rama existe localmente: `git switch tdd/<ID>` y `git pull --ff-only`. No descartar cambios ajenos. El prompt contendrá el **SHA RED de 40 caracteres**.

## 3. Ejecutar contrato

```bash
pnpm qa:tdd -- --contract=tdd/contracts/<ID>.json --baseline=<SHA_RED>
pnpm qa:tdd -- --contract=tdd/contracts/<ID>.json --baseline=<SHA_RED> --dry-run
# Después de observar RED por funcionalidad pendiente e implementar código:
pnpm qa:tdd -- --contract=tdd/contracts/<ID>.json --baseline=<SHA_RED> --run
```

El guard compara el diff con el commit RED, verifica que tests/contrato no se alteraron y ejecuta sólo `qaCommands`. Los logs están en `var/tdd/`. El ejecutor no modifica pruebas para forzar PASS.

## 4. Integración

Al pasar GREEN, hacer commit sobre la rama, abrir PR a `main`, verificar gate TDD y `quality` en CI. En L3 exigir revisión independiente. Si falta una prueba/archivo imprescindible, reportar `BLOCKED`; ChatGPT debe preparar contrato y baseline revisados.

**Límite:** el guard detecta cambios de archivos fuera de alcance, pero no controla todos los comandos del agente. Se necesita protección de `main` y revisión para impedir integraciones deliberadamente indebidas. Un PR con pruebas RED todavía fallidas no debe integrarse.
