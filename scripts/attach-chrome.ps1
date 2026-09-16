# Chrome 136+ ignores --remote-debugging-port on the default User Data folder.
# Copy "your chrome" into a separate debug directory, then attach DevTools there.

$ErrorActionPreference = "Stop"
$port = 9222
$cdp = "http://127.0.0.1:$port"
$wantedName = if ($env:CHROME_PROFILE_NAME) { $env:CHROME_PROFILE_NAME } else { "your chrome" }
$debugDir = Join-Path $env:LOCALAPPDATA "WhatsAppInboxAgent\Chrome"

function Test-Cdp {
  try {
    $r = Invoke-WebRequest -Uri "$cdp/json/version" -UseBasicParsing -TimeoutSec 2
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Get-ChromeExe {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  throw "Chrome was not found."
}

function Get-ChromeAccounts {
  $userData = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
  if (-not (Test-Path $userData)) {
    throw "No Chrome user data folder at $userData"
  }

  $accounts = @()
  $localStatePath = Join-Path $userData "Local State"
  if (Test-Path $localStatePath) {
    $state = Get-Content -LiteralPath $localStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($prop in $state.profile.info_cache.PSObject.Properties) {
      if ($prop.Name -match "^(Guest Profile|System Profile)$") { continue }
      $v = $prop.Value
      $accounts += [pscustomobject]@{
        Dir      = $prop.Name
        Name     = [string]$v.name
        Gaia     = [string]$v.gaia_name
        Email    = [string]$v.user_name
        Shortcut = [string]$v.shortcut_name
        Active   = [double]$v.active_time
        SignedIn = -not [string]::IsNullOrWhiteSpace([string]$v.user_name)
      }
    }
  }
  return @{ UserData = $userData; Accounts = $accounts }
}

function Select-Account($accounts, [string]$want) {
  $want = $want.Trim()
  $matches = @($accounts | Where-Object {
    $_.Name -eq $want -or $_.Shortcut -eq $want -or $_.Dir -eq $want -or
    $_.Name -like "*$want*" -or $_.Shortcut -like "*$want*"
  })
  if ($matches.Count -eq 0) { return $null }
  return $matches |
    Sort-Object -Property @{ Expression = "SignedIn"; Descending = $true }, @{ Expression = "Active"; Descending = $true } |
    Select-Object -First 1
}

function Stop-Chrome {
  Get-Process -Name chrome, crashpad_handler, GoogleCrashHandler, GoogleCrashHandler64 -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Process -Name chrome -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
  }
  Start-Sleep -Seconds 2
}

function Sync-DebugProfile([string]$srcRoot, [string]$dstRoot, [string]$profileDir) {
  New-Item -ItemType Directory -Force -Path $dstRoot | Out-Null
  $srcProfile = Join-Path $srcRoot $profileDir
  $dstProfile = Join-Path $dstRoot $profileDir
  if (-not (Test-Path $srcProfile)) {
    throw "Chrome profile folder not found: $srcProfile"
  }

  Write-Host "Copying '$profileDir' into a debug Chrome folder (keeps WhatsApp login)..."
  $null = & robocopy.exe $srcProfile $dstProfile /E /XO /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP `
    /XD Cache "Code Cache" GPUCache Crashpad ShaderCache "Service Worker\CacheStorage" `
    /XF SingletonLock SingletonSocket SingletonCookie DevToolsActivePort lockfile
  if ($LASTEXITCODE -ge 8) {
    throw "Could not copy Chrome profile (robocopy exit $LASTEXITCODE)."
  }

  $localState = Join-Path $srcRoot "Local State"
  if (Test-Path $localState) {
    Copy-Item -LiteralPath $localState -Destination (Join-Path $dstRoot "Local State") -Force
  }
}

function Start-DebugChrome([string]$exe, [string]$userDataDir, [string]$profileDir) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.UseShellExecute = $false
  $psi.Arguments = @(
    "--remote-debugging-port=$port",
    "--remote-debugging-address=127.0.0.1",
    "--remote-allow-origins=*",
    "--user-data-dir=`"$userDataDir`"",
    "--profile-directory=`"$profileDir`"",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=ProfilePickerOnStartup",
    "https://web.whatsapp.com"
  ) -join " "
  Write-Host "Launch: $($psi.FileName) $($psi.Arguments)"
  [void][System.Diagnostics.Process]::Start($psi)
}

$chrome = Get-ChromeExe
$data = Get-ChromeAccounts

Write-Host "Detected Chrome accounts:"
if ($data.Accounts.Count -eq 0) {
  Write-Host "  (none found in Local State)"
} else {
  foreach ($a in $data.Accounts) {
    $label = if ($a.Name) { $a.Name } else { $a.Dir }
    $who = if ($a.Email) { $a.Email } else { "local / not signed in" }
    Write-Host ("  {0,-14} {1}  ({2})" -f $a.Dir, $label, $who)
  }
}

$account = Select-Account $data.Accounts $wantedName
if (-not $account) {
  Write-Host ""
  Write-Host "Could not find the account named '$wantedName'."
  Write-Host "Set CHROME_PROFILE_NAME to one of the names above, then try again."
  exit 1
}

Write-Host ""
Write-Host "Opening: $($account.Name)  [$($account.Dir)]  $($account.Email)"

if (Get-Process -Name chrome -ErrorAction SilentlyContinue) {
  Write-Host "Closing other Chrome windows..."
  Stop-Chrome
} else {
  Stop-Chrome
}

Sync-DebugProfile -srcRoot $data.UserData -dstRoot $debugDir -profileDir $account.Dir
Start-DebugChrome -exe $chrome -userDataDir $debugDir -profileDir $account.Dir

$ok = $false
$portFile = Join-Path $debugDir "DevToolsActivePort"
for ($i = 0; $i -lt 60; $i++) {
  if (Test-Cdp) { $ok = $true; break }
  if (Test-Path $portFile) {
    $written = (Get-Content -LiteralPath $portFile -TotalCount 1 -ErrorAction SilentlyContinue)
    if ($written -and $written -ne "$port") {
      Write-Host "Chrome opened DevTools on port $written instead of $port."
    }
  }
  Start-Sleep -Milliseconds 500
}

if (-not $ok) {
  Write-Host "Could not attach to Chrome DevTools at $cdp."
  Write-Host "Chrome 136+ only enables debugging on a copied profile, which this script just created at:"
  Write-Host "  $debugDir"
  Write-Host "Close Chrome from the system tray, run ONLY .\chrome.cmd (not all three at once), then .\agent.cmd."
  exit 1
}

Set-Content -LiteralPath (Join-Path $debugDir "agent-profile.txt") -Value $account.Dir -Encoding ASCII

Write-Host "Attached to '$($account.Name)' at $cdp"
Write-Host "Leave this Chrome window open."
exit 0
