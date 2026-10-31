# Matriz consolidada CALCA-06

Dictamen **BLOCKED**. Fuentes y tiempos: [JSON](./scenario-matrix.json), [tiempos](./timings.json), [ledger](./qa/execution-ledger.json). Un FAIL del consumidor no invalida la observación separada de construcción; sí bloquea la recomendación de piloto.

| Escenario                            | Resultado | Construcción | Evidencia                                      |
| ------------------------------------ | --------- | ------------ | ---------------------------------------------- |
| Manual-Trace-label-gaps              | PASS      | —            | [attempt-5](attempts/attempt-5/results.json)   |
| occupied-protection                  | PASS      | —            | [attempt-5](attempts/attempt-5/results.json)   |
| released-seat-conflict-probe         | FAIL      | —            | [attempt-5](attempts/attempt-5/results.json)   |
| landscape-1440                       | FAIL      | PASS         | [attempt-5](attempts/attempt-5/results.json)   |
| portrait-1440                        | FAIL      | PASS         | [attempt-5](attempts/attempt-5/results.json)   |
| square-1440                          | FAIL      | PASS         | [attempt-5](attempts/attempt-5/results.json)   |
| svg-200-1440                         | FAIL      | PASS         | [attempt-5](attempts/attempt-5/results.json)   |
| landscape-1024                       | FAIL      | PASS         | [attempt-6](attempts/attempt-6/results.json)   |
| portrait-1024                        | FAIL      | PASS         | [attempt-6](attempts/attempt-6/results.json)   |
| square-1024                          | FAIL      | PASS         | [attempt-6](attempts/attempt-6/results.json)   |
| svg-200-1024                         | FAIL      | PASS         | [attempt-6](attempts/attempt-6/results.json)   |
| TABLE-50-1440                        | PASS      | —            | [attempt-7](attempts/attempt-7/results.json)   |
| TABLE-50-1024                        | PASS      | —            | [attempt-7](attempts/attempt-7/results.json)   |
| TABLE-100-1440                       | PASS      | —            | [attempt-7](attempts/attempt-7/results.json)   |
| TABLE-100-1024                       | FAIL      | —            | [attempt-7](attempts/attempt-7/results.json)   |
| TABLE-200-1440                       | FAIL      | —            | [attempt-7](attempts/attempt-7/results.json)   |
| TABLE-200-1024                       | FAIL      | —            | [attempt-7](attempts/attempt-7/results.json)   |
| TABLE-consumers                      | PASS      | —            | [attempt-7](attempts/attempt-7/results.json)   |
| SVG-100-1440                         | PASS      | —            | [attempt-8](attempts/attempt-8/results.json)   |
| SVG-100-1024                         | PASS      | —            | [attempt-8](attempts/attempt-8/results.json)   |
| SVG-200-1440                         | PASS      | —            | [attempt-8](attempts/attempt-8/results.json)   |
| SVG-200-1024                         | PASS      | —            | [attempt-8](attempts/attempt-8/results.json)   |
| SVG-security-negatives               | PASS      | —            | [attempt-8](attempts/attempt-8/results.json)   |
| SVG-replacement-preservation         | PASS      | —            | [attempt-8](attempts/attempt-8/results.json)   |
| recovery-1440                        | PASS      | —            | [attempt-9](attempts/attempt-9/results.json)   |
| recovery-1024                        | PASS      | —            | [attempt-9](attempts/attempt-9/results.json)   |
| PHYSICAL_QR-restriction-1440         | FAIL      | —            | [attempt-9](attempts/attempt-9/results.json)   |
| PHYSICAL_QR-restriction-1024         | FAIL      | —            | [attempt-9](attempts/attempt-9/results.json)   |
| ANONYMOUS-TABLE-only                 | PASS      | —            | [attempt-9](attempts/attempt-9/results.json)   |
| SEAT-capacity-after-mode-change-1440 | FAIL      | —            | [attempt-10](attempts/attempt-10/results.json) |
| SEAT-capacity-after-mode-change-1024 | FAIL      | —            | [attempt-10](attempts/attempt-10/results.json) |
| assign-seats-http-status             | FAIL      | —            | [attempt-7](attempts/attempt-7/results.json)   |

Los campos de cada escenario describen su alcance. Las regresiones de volumen gráfico no amplían límites comerciales. Las suites unitarias/DOM son evidencia complementaria, no sustituyen el navegador real.
