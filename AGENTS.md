# Reglas para agentes y Codex

1. Leer `README.md` y la documentación obligatoria en `/docs` antes de editar.
2. `docs/04-tecnico/MONOREPO_ARCHITECTURE.md` define límites entre apps y packages.
3. No inventar entidades, roles, estados, permisos, rutas ni reglas.
4. Las reglas de negocio viven en `apps/api`; los frontends no las duplican.
5. Una app no importa código fuente de otra app.
6. Código compartido solo vive en `packages/*`.
7. `packages/ui` no contiene reglas de negocio ni llamadas API.
8. `packages/api-client` se generará desde OpenAPI; no mantener DTOs duplicados manualmente.
9. Cada cambio debe ejecutar lint, typecheck, tests y build.
10. No agregar secretos ni credenciales al repositorio.
