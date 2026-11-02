[CmdletBinding()]
param(
  [ValidateSet('start', 'stop', 'status', 'logs', 'smoke')]
  [string]$Command = 'start',
  [string]$HostIp,
  [int]$WaitSeconds = 180
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $repositoryRoot 'compose.yaml'
$projectName = 'invitacionespremium-docs'
$servicePorts = @(3000, 5173, 5174, 5175, 5176)

function Invoke-Compose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & docker compose --project-name $projectName --file $composeFile @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed with exit code $LASTEXITCODE."
  }
}

function Assert-DockerAvailable {
  & docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop is not available. Start Docker Desktop and retry.'
  }
}

function Test-LanIp {
  param([Parameter(Mandatory = $true)][string]$Candidate)

  $parsed = [System.Net.IPAddress]::None
  if (-not [System.Net.IPAddress]::TryParse($Candidate, [ref]$parsed) -or $parsed.AddressFamily -ne 'InterNetwork') {
    return $false
  }

  return $Candidate -ne '0.0.0.0' -and -not $Candidate.StartsWith('127.') -and -not $Candidate.StartsWith('169.254.')
}

function Resolve-LanIp {
  param([string]$RequestedIp)

  if ($RequestedIp) {
    if (-not (Test-LanIp $RequestedIp)) {
      throw "-HostIp must be a reachable non-loopback IPv4 address. Received '$RequestedIp'."
    }
    return $RequestedIp
  }

  $candidates = @()
  try {
    $candidates = @(
      Get-NetIPConfiguration |
        Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
        ForEach-Object { $_.IPv4Address.IPAddress } |
        Where-Object { Test-LanIp $_ }
    )
  } catch {
    # The fallback below also works on Windows editions without the NetTCPIP cmdlets.
  }

  if (-not $candidates) {
    $candidates = @(
      [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
        Where-Object {
          $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up -and
          $_.NetworkInterfaceType -ne [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback
        } |
        ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
        ForEach-Object { $_.Address.ToString() } |
        Where-Object { Test-LanIp $_ }
    )
  }

  $selected = @($candidates | Select-Object -Unique | Select-Object -First 1)[0]
  if (-not $selected) {
    throw 'No reachable IPv4 address was found. Connect to the local network or pass -HostIp explicitly.'
  }

  return $selected
}

function Set-LanEnvironment {
  param([Parameter(Mandatory = $true)][string]$IpAddress)

  $origins = @()
  foreach ($port in 5173..5176) {
    $origins += "http://localhost:$port"
    $origins += "http://127.0.0.1:$port"
    $origins += "http://${IpAddress}:$port"
  }

  $env:CORS_ORIGINS = ($origins | Select-Object -Unique) -join ','
  $env:PUBLIC_INVITATION_BASE_URL = "http://${IpAddress}:5173/invitacion"
  $env:VITE_API_BASE_URL = "http://${IpAddress}:3000/api/v1"
  $env:VITE_SOCKET_URL = "http://${IpAddress}:3000"
  $env:VITE_CLIENT_APP_URL = "http://${IpAddress}:5173"
  $env:VITE_ADMIN_APP_URL = "http://${IpAddress}:5174"
  $env:VITE_SCANNER_APP_URL = "http://${IpAddress}:5175"
  $env:VITE_LANDING_URL = "http://${IpAddress}:5176"
  $env:VITE_APP_URL = "http://${IpAddress}:5176"
}

function Wait-ForHttp {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        return
      }
    } catch {
      # Startup includes migrations and idempotent local seeds; retry until the bounded deadline.
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Url after $TimeoutSeconds seconds. Inspect logs with: .\\run\\local-lan.ps1 logs"
}

function Invoke-LanSmoke {
  param([Parameter(Mandatory = $true)][string]$IpAddress)

  $apiBase = "http://${IpAddress}:3000/api/v1"
  Wait-ForHttp -Url "$apiBase/health" -TimeoutSeconds $WaitSeconds

  $origins = @("http://${IpAddress}:5173", "http://${IpAddress}:5174", "http://${IpAddress}:5175", "http://${IpAddress}:5176")
  foreach ($origin in $origins) {
    $response = Invoke-WebRequest -Uri "$apiBase/health" -Headers @{ Origin = $origin } -UseBasicParsing -TimeoutSec 10
    if ($response.Headers['Access-Control-Allow-Origin'] -ne $origin) {
      throw "The API did not authorize LAN origin $origin."
    }
    if ($response.Headers['Access-Control-Allow-Credentials'] -ne 'true') {
      throw "The API did not enable credentialed requests for $origin."
    }
  }

  foreach ($port in 5173..5176) {
    $response = Invoke-WebRequest -Uri "http://${IpAddress}:$port" -UseBasicParsing -TimeoutSec 10
    if ($response.Content -notmatch 'id="root"') {
      throw "The frontend on port $port did not return its application shell."
    }
  }

  Write-Host 'LAN smoke check passed.' -ForegroundColor Green
}

Assert-DockerAvailable

switch ($Command) {
  'start' {
    $resolvedIp = Resolve-LanIp $HostIp
    Set-LanEnvironment $resolvedIp
    Invoke-Compose up --build --detach
    Invoke-LanSmoke $resolvedIp

    Write-Host ''
    Write-Host "Local network URL: http://${resolvedIp}:5173" -ForegroundColor Green
    Write-Host "Admin:             http://${resolvedIp}:5174"
    Write-Host "Scanner:           http://${resolvedIp}:5175"
    Write-Host "Landing:           http://${resolvedIp}:5176"
    Write-Host "API health:        http://${resolvedIp}:3000/api/v1/health"
    Write-Host 'Open the URL from a device connected to the same Wi-Fi/LAN.'
    Write-Host 'For mobile Scanner camera tests, use HTTPS; browsers do not grant camera access to an HTTP LAN origin.' -ForegroundColor Yellow
  }
  'smoke' {
    $resolvedIp = Resolve-LanIp $HostIp
    Invoke-LanSmoke $resolvedIp
  }
  'stop' { Invoke-Compose down }
  'status' { Invoke-Compose ps }
  'logs' { Invoke-Compose logs --follow }
}
