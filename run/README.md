# Ejecución local en red

Estos scripts levantan la API, PostgreSQL y los cuatro frontends en Docker para hacer pruebas desde dispositivos que estén en la misma red local. La configuración de red se mantiene solamente durante la ejecución: no modifica `.env`, no añade secretos y no se usa para staging ni producción.

## Requisitos

- Docker Desktop iniciado y con acceso a la red local;
- PowerShell 7 o Windows PowerShell (Windows), o Docker Compose v2 y `curl` (macOS/Linux);
- el equipo y los dispositivos de prueba conectados a la misma Wi-Fi o LAN;
- puertos locales `3000`, `5173`, `5174`, `5175`, `5176` y `5432` disponibles.

## Windows: inicio recomendado

Desde la raíz del repositorio:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\run\local-lan.ps1 start
```

El script elige una IPv4 con gateway predeterminado, configura en memoria `CORS_ORIGINS`, las URLs públicas `VITE_*` y `PUBLIC_INVITATION_BASE_URL`, construye las imágenes y espera a que API, CORS y las cuatro aplicaciones respondan.

Si hay adaptadores VPN, Docker, Ethernet y Wi-Fi a la vez, elija explícitamente la IP mostrada por `ipconfig`:

```powershell
.\run\local-lan.ps1 start -HostIp 192.168.1.25
```

El resultado imprime las URLs reales. Normalmente son:

| Superficie | URL en la red local |
| --- | --- |
| Client / Planner | `http://IP_DEL_EQUIPO:5173` |
| Admin | `http://IP_DEL_EQUIPO:5174` |
| Scanner | `http://IP_DEL_EQUIPO:5175` |
| Landing | `http://IP_DEL_EQUIPO:5176` |
| API health | `http://IP_DEL_EQUIPO:3000/api/v1/health` |

Los datos locales se inicializan de forma idempotente. Las credenciales de desarrollo permanecen en [README.md](../README.md#inicio-local-con-docker): `admin@example.com`, `planner@example.com` y la contraseña local configurada.

## Operación diaria

```powershell
# Ver contenedores y health
.\run\local-lan.ps1 status

# Repetir comprobación de API, CORS y shells desde la IP LAN
.\run\local-lan.ps1 smoke -HostIp 192.168.1.25

# Seguir logs (Ctrl+C sólo deja de seguirlos)
.\run\local-lan.ps1 logs

# Detener contenedores; conserva volúmenes de PostgreSQL y FileAssets
.\run\local-lan.ps1 stop
```

El lanzador reutiliza el proyecto Docker local del repositorio, `invitacionespremium-docs`; por ello no crea una base paralela ni compite por los puertos con `docker compose` normal. Para iniciar desde cero se debe hacer intencionadamente:

```powershell
docker compose --project-name invitacionespremium-docs --file .\compose.yaml down --volumes
```

Ese último comando elimina únicamente los volúmenes locales de este repositorio, incluidos PostgreSQL y los FileAssets locales.

## macOS / Linux

```bash
chmod +x run/local-lan.sh
./run/local-lan.sh start

# Si la detección no elige la interfaz correcta:
LAN_HOST_IP=192.168.1.25 ./run/local-lan.sh start
```

Los equivalentes son `status`, `smoke`, `logs` y `stop`.

## Acceso desde teléfono o tablet

1. Desactive el aislamiento de clientes/AP isolation en la Wi-Fi de pruebas si está activo.
2. Abra la URL `Client / Planner` impresa por el script, sustituyendo `IP_DEL_EQUIPO` por la IP real.
3. Si Windows muestra una solicitud de firewall para Docker/Node, permita redes privadas. Si no aparece, cree reglas de entrada privadas para los puertos publicados:

   ```powershell
   New-NetFirewallRule -DisplayName 'InvitacionesPremium LAN dev' -Direction Inbound -Action Allow -Profile Private -Protocol TCP -LocalPort 3000,5173,5174,5175,5176
   ```

   Para retirarla después:

   ```powershell
   Remove-NetFirewallRule -DisplayName 'InvitacionesPremium LAN dev'
   ```

4. Verifique primero `API health` desde el teléfono. Si no abre, revise firewall, red de invitados, VPN o que se eligió la IPv4 correcta.

## Alcance y seguridad

- Es un entorno de desarrollo HTTP de red local, no un despliegue ni un reemplazo de staging.
- Los orígenes CORS se limitan a `localhost`, `127.0.0.1` y la única IPv4 LAN elegida; no se usan comodines.
- Las cookies de desarrollo siguen siendo `SameSite=Lax` y las superficies usan el mismo host/IP con puertos distintos, por lo que login y Socket.IO conservan el contrato local.
- La cámara del Scanner requiere un contexto seguro en navegadores móviles. Una URL HTTP con IP LAN permite validar UI, API y navegación, pero no autoriza `getUserMedia`. Para QR/cámara real use staging HTTPS o una solución HTTPS de desarrollo con un certificado confiado por cada dispositivo; no desactive la seguridad del navegador.
- Nunca exponga estos puertos a Internet ni reutilice este entorno para datos reales.
