# ============================================================
# Handyman Pro — dependency-free API server (pure PowerShell)
# Serves the web app + implements the same REST API as the
# Node backend, so the app works with zero downloads.
# Demo data is stored in psdata.json next to this script.
# Commission: 18% platform / 82% handyman.
# ============================================================
param([int]$Port = 4000)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataFile = Join-Path $root 'psdata.json'
$indexFile = Join-Path $root 'public\index.html'
$landingFile = Join-Path $root 'public\landing.html'
$pricingFile = Join-Path $root 'public\pricing.html'

# ---------- helpers ----------
function ConvertTo-Hashtable {
  param($obj)
  if ($null -eq $obj) { return $null }
  if ($obj -is [System.Management.Automation.PSCustomObject]) {
    $h = @{}
    foreach ($p in $obj.PSObject.Properties) { $h[$p.Name] = ConvertTo-Hashtable $p.Value }
    return $h
  }
  if (($obj -is [System.Collections.IEnumerable]) -and ($obj -isnot [string])) {
    $arr = @()
    foreach ($i in $obj) { $arr += ,(ConvertTo-Hashtable $i) }
    return ,$arr
  }
  return $obj
}

function Hash-Password($pw) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$pw))
  return ([BitConverter]::ToString($bytes) -replace '-','').ToLower()
}

function Round2($n) { return [math]::Round([double]$n, 2) }

function New-SeedDb {
  $now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  return @{
    seq = 5
    nextJobId = 1
    nextPayId = 1
    nextReviewId = 1
    tokens = @{}
    users = @(
      @{ id=1; email='admin@handyman.app'; password_hash=(Hash-Password 'admin123'); role='admin'; full_name='Platform Admin'; phone=''; address=''; created_at=$now },
      @{ id=2; email='bob@builder.com'; password_hash=(Hash-Password 'password123'); role='handyman'; full_name='Bob Builder'; phone='+1 555 0102'; address='Austin, TX'; created_at=$now },
      @{ id=3; email='mary@mason.com'; password_hash=(Hash-Password 'password123'); role='handyman'; full_name='Mary Mason'; phone='+1 555 0103'; address='Austin, TX'; created_at=$now },
      @{ id=4; email='carl@tiler.com'; password_hash=(Hash-Password 'password123'); role='handyman'; full_name='Carl Tiler'; phone='+1 555 0104'; address='Round Rock, TX'; created_at=$now }
    )
    profiles = @(
      @{ user_id=2; category='Plumbing'; hourly_rate=75; bio='Licensed plumber, 10 years'; experience_years=10; is_available=1; rating=4.8; total_jobs=23; stripe_account_id=$null },
      @{ user_id=3; category='Electrical'; hourly_rate=85; bio='Certified electrician'; experience_years=8; is_available=1; rating=4.6; total_jobs=17; stripe_account_id=$null },
      @{ user_id=4; category='Carpentry'; hourly_rate=60; bio='Custom woodwork & repairs'; experience_years=12; is_available=1; rating=4.9; total_jobs=31; stripe_account_id=$null }
    )
    jobs = @()
    payments = @()
    reviews = @()
  }
}

function Get-Db {
  if (Test-Path $dataFile) {
    $raw = Get-Content $dataFile -Raw -Encoding UTF8
    if ($raw -and $raw.Trim()) {
      try { return ConvertTo-Hashtable ($raw | ConvertFrom-Json) } catch { }
    }
  }
  $db = New-SeedDb
  Save-Db $db
  return $db
}

function Save-Db($db) {
  $db | ConvertTo-Json -Depth 12 | Set-Content -Path $dataFile -Encoding UTF8
}

function Send-Json($res, [int]$status, $data) {
  $json = if ($null -eq $data) { '{}' } else { $data | ConvertTo-Json -Depth 10 }
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  try { $res.Headers.Add('Access-Control-Allow-Origin', '*') } catch {}
  $res.StatusCode = $status
  $res.ContentType = 'application/json; charset=utf-8'
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.Close()
}

function Send-Err($res, [int]$status, [string]$msg) { Send-Json $res $status @{ error = $msg } }

function Get-AuthUser($db, $req) {
  $h = $req.Headers['Authorization']
  if (-not $h) { return $null }
  $parts = $h.Split(' ')
  if ($parts.Count -lt 2) { return $null }
  $token = $parts[1]
  if (-not $db.tokens.ContainsKey($token)) { return $null }
  $uid = [int]$db.tokens[$token]
  return ($db.users | Where-Object { $_.id -eq $uid } | Select-Object -First 1)
}

function Get-PubUser($u) {
  return @{ id=$u.id; email=$u.email; role=$u.role; full_name=$u.full_name; phone=$u.phone; address=$u.address; created_at=$u.created_at }
}

function Get-DecoratedJob($db, $j) {
  $c = $db.users | Where-Object { $_.id -eq $j.client_id } | Select-Object -First 1
  $h = $db.users | Where-Object { $_.id -eq $j.handyman_id } | Select-Object -First 1
  $out = @{} + $j
  $out['client_name'] = if ($c) { $c.full_name } else { $null }
  $out['handyman_name'] = if ($h) { $h.full_name } else { $null }
  return $out
}

function New-Token($db, $userId) {
  $t = 'ps_' + [guid]::NewGuid().ToString('N')
  $db.tokens[$t] = $userId
  return $t
}

# ---------- request handler ----------
function Handle-Request($db, $req, $res) {
  $method = $req.HttpMethod
  $path = $req.Url.AbsolutePath

  if ($method -eq 'OPTIONS') {
    try {
      $res.Headers.Add('Access-Control-Allow-Origin', '*')
      $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    } catch {}
    $res.StatusCode = 204
    $res.Close()
    return
  }

  $body = @{}
  if ($req.HasEntityBody) {
    $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
    $txt = $reader.ReadToEnd()
    $reader.Close()
    if ($txt -and $txt.Trim()) {
      try { $body = ConvertTo-Hashtable ($txt | ConvertFrom-Json) } catch { $body = @{} }
    }
  }

  $user = Get-AuthUser $db $req

  # --- static pages ---
  if ($method -eq 'GET') {
    $pageFile = $null
    if ($path -eq '/' -or $path -eq '/landing.html') { $pageFile = $landingFile }
    elseif ($path -eq '/pricing' -or $path -eq '/pricing.html') { $pageFile = $pricingFile }
    elseif ($path -eq '/app' -or $path -eq '/index.html') { $pageFile = $indexFile }
    if ($pageFile) {
      $content = [IO.File]::ReadAllBytes($pageFile)
      $res.StatusCode = 200
      $res.ContentType = 'text/html; charset=utf-8'
      $res.ContentLength64 = $content.Length
      $res.OutputStream.Write($content, 0, $content.Length)
      $res.Close()
      return
    }
  }

  # --- health & config ---
  if ($path -eq '/health') { Send-Json $res 200 @{ status = 'ok' }; return }
  if ($path -eq '/api/config') { Send-Json $res 200 @{ demoMode = $true; commission = 0.18; appName = 'Handyman Pro'; googleClientId = '' }; return }

  # --- auth ---
  if ($method -eq 'POST' -and $path -eq '/api/auth/register') {
    if (-not $body.email -or -not $body.password -or -not $body.full_name -or -not $body.role) { Send-Err $res 400 'Missing required fields'; return }
    if ($body.role -notin @('client','handyman')) { Send-Err $res 400 'Invalid role'; return }
    if ($db.users | Where-Object { $_.email -eq $body.email }) { Send-Err $res 409 'Email already registered'; return }
    $u = @{
      id = [int]$db.seq; email = [string]$body.email; password_hash = (Hash-Password $body.password);
      role = [string]$body.role; full_name = [string]$body.full_name;
      phone = [string]$body.phone; address = [string]$body.address;
      created_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    }
    $db.seq = [int]$db.seq + 1
    $db.users += ,$u
    if ($u.role -eq 'handyman') {
      $rate = if ($body.hourly_rate) { [double]$body.hourly_rate } else { 50 }
      $years = if ($body.experience_years) { [int]$body.experience_years } else { 0 }
      $cat = if ($body.category) { [string]$body.category } else { 'General Handyman' }
      $db.profiles += ,@{ user_id=$u.id; category=$cat; hourly_rate=$rate; bio=$body.bio; experience_years=$years; is_available=1; rating=0; total_jobs=0; stripe_account_id=$null }
    }
    $token = New-Token $db $u.id
    Save-Db $db
    Send-Json $res 201 @{ token=$token; user=(Get-PubUser $u); stripeAccountId=$null }
    return
  }

  if ($method -eq 'POST' -and $path -eq '/api/auth/login') {
    if (-not $body.email -or -not $body.password) { Send-Err $res 400 'Email and password required'; return }
    $hash = Hash-Password $body.password
    $u = $db.users | Where-Object { $_.email -eq $body.email -and $_.password_hash -eq $hash } | Select-Object -First 1
    if (-not $u) { Send-Err $res 401 'Invalid credentials'; return }
    $token = New-Token $db $u.id
    Save-Db $db
    Send-Json $res 200 @{ token=$token; user=(Get-PubUser $u) }
    return
  }

  if ($method -eq 'POST' -and $path -eq '/api/auth/google') {
    $email = 'google.demo@handyman.app'
    $u = $db.users | Where-Object { $_.email -eq $email } | Select-Object -First 1
    if (-not $u) {
      $u = @{
        id = [int]$db.seq; email = $email; password_hash = (Hash-Password ([guid]::NewGuid().ToString()));
        role = 'client'; full_name = 'Google Demo User'; phone = ''; address = '';
        created_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
      }
      $db.seq = [int]$db.seq + 1
      $db.users += ,$u
    }
    $token = New-Token $db $u.id
    Save-Db $db
    Send-Json $res 200 @{ token=$token; user=(Get-PubUser $u) }
    return
  }

  if ($method -eq 'GET' -and $path -eq '/api/auth/me') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    Send-Json $res 200 @{ user = (Get-PubUser $user) }
    return
  }

  # --- handymen ---
  if ($method -eq 'GET' -and $path -eq '/api/users/handymen') {
    $cat = $req.QueryString['category']
    $list = @()
    foreach ($p in $db.profiles) {
      $u = $db.users | Where-Object { $_.id -eq $p.user_id } | Select-Object -First 1
      if (-not $u) { continue }
      $list += ,@{ id=$u.id; full_name=$u.full_name; phone=$u.phone; address=$u.address; category=$p.category; hourly_rate=$p.hourly_rate; bio=$p.bio; experience_years=$p.experience_years; is_available=$p.is_available; rating=$p.rating; total_jobs=$p.total_jobs }
    }
    if ($cat) { $list = @($list | Where-Object { $_.category -eq $cat }) }
    $list = @($list | Sort-Object -Property rating -Descending)
    Send-Json $res 200 @{ handymen = $list }
    return
  }

  if ($method -eq 'GET' -and $path -match '^/api/users/handymen/(\d+)$') {
    $hid = [int]$Matches[1]
    $p = $db.profiles | Where-Object { $_.user_id -eq $hid } | Select-Object -First 1
    if (-not $p) { Send-Err $res 404 'Handyman not found'; return }
    $u = $db.users | Where-Object { $_.id -eq $hid } | Select-Object -First 1
    Send-Json $res 200 @{ handyman = @{ id=$u.id; full_name=$u.full_name; phone=$u.phone; address=$u.address; category=$p.category; hourly_rate=$p.hourly_rate; bio=$p.bio; experience_years=$p.experience_years; is_available=$p.is_available; rating=$p.rating; total_jobs=$p.total_jobs } }
    return
  }

  # --- jobs ---
  if ($method -eq 'POST' -and $path -eq '/api/jobs') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    if ($user.role -ne 'client') { Send-Err $res 403 'Insufficient permissions'; return }
    if (-not $body.handyman_id -or -not $body.title -or -not $body.address -or -not $body.scheduled_at -or -not $body.total_amount) { Send-Err $res 400 'Missing required fields'; return }
    $total = [double]$body.total_amount
    $job = @{
      id = [int]$db.nextJobId; client_id = $user.id; handyman_id = [int]$body.handyman_id; category_id = $null;
      title = [string]$body.title; description = $body.description; address = [string]$body.address;
      scheduled_at = [string]$body.scheduled_at; status = 'pending'; total_amount = $total;
      platform_fee = (Round2 ($total * 0.18)); handyman_earning = (Round2 ($total * 0.82));
      stripe_payment_intent_id = $null;
      created_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    }
    $db.nextJobId = [int]$db.nextJobId + 1
    $db.jobs += ,$job
    Save-Db $db
    Send-Json $res 201 @{ job = (Get-DecoratedJob $db $job) }
    return
  }

  if ($method -eq 'GET' -and $path -eq '/api/jobs') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    $list = @()
    if ($user.role -eq 'client') { $list = @($db.jobs | Where-Object { $_.client_id -eq $user.id }) }
    elseif ($user.role -eq 'handyman') { $list = @($db.jobs | Where-Object { $_.handyman_id -eq $user.id }) }
    else { $list = @($db.jobs) }
    $list = @($list | Sort-Object -Property id -Descending | ForEach-Object { Get-DecoratedJob $db $_ })
    Send-Json $res 200 @{ jobs = $list }
    return
  }

  if ($method -eq 'GET' -and $path -match '^/api/jobs/(\d+)$') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    $jid = [int]$Matches[1]
    $j = $db.jobs | Where-Object { $_.id -eq $jid } | Select-Object -First 1
    if (-not $j) { Send-Err $res 404 'Job not found'; return }
    if ($user.role -ne 'admin' -and $user.id -ne $j.client_id -and $user.id -ne $j.handyman_id) { Send-Err $res 403 'Not authorized to view this job'; return }
    Send-Json $res 200 @{ job = (Get-DecoratedJob $db $j) }
    return
  }

  if ($method -eq 'PATCH' -and $path -match '^/api/jobs/(\d+)/status$') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    $status = [string]$body.status
    if ($status -notin @('pending','accepted','in_progress','completed','cancelled')) { Send-Err $res 400 'Invalid status'; return }
    $jid = [int]$Matches[1]
    $j = $db.jobs | Where-Object { $_.id -eq $jid } | Select-Object -First 1
    if (-not $j) { Send-Err $res 404 'Job not found'; return }
    if ($user.role -eq 'handyman' -and $user.id -ne $j.handyman_id) { Send-Err $res 403 'Not your job'; return }
    if ($user.role -eq 'client' -and $user.id -ne $j.client_id) { Send-Err $res 403 'Not your job'; return }
    if ($user.role -eq 'client' -and $status -ne 'cancelled') { Send-Err $res 403 'Clients can only cancel jobs'; return }
    $j.status = $status
    Save-Db $db
    Send-Json $res 200 @{ message = "Job status updated to $status" }
    return
  }

  # --- payments ---
  if ($method -eq 'POST' -and $path -eq '/api/payments/create-intent') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    if ($user.role -ne 'client') { Send-Err $res 403 'Insufficient permissions'; return }
    $jid = [int]$body.job_id
    $j = $db.jobs | Where-Object { $_.id -eq $jid -and $_.client_id -eq $user.id } | Select-Object -First 1
    if (-not $j) { Send-Err $res 404 'Job not found or not yours'; return }
    if ($j.status -ne 'pending' -and $j.status -ne 'accepted') { Send-Err $res 400 'Job is not awaiting payment'; return }
    $n = [int]$db.nextPayId
    $db.nextPayId = $n + 1
    $intentId = 'ps_pi_' + $n
    $db.payments += ,@{ id=$n; job_id=$j.id; amount=$j.total_amount; status='pending'; stripe_payment_intent_id=$intentId }
    Save-Db $db
    Send-Json $res 200 @{ clientSecret='ps_secret'; paymentIntentId=$intentId; demo=$true; breakdown=@{ total=$j.total_amount; platform_fee=$j.platform_fee; handyman_earning=$j.handyman_earning } }
    return
  }

  if ($method -eq 'POST' -and $path -eq '/api/payments/confirm') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    if ($user.role -ne 'client') { Send-Err $res 403 'Insufficient permissions'; return }
    $p = $db.payments | Where-Object { $_.stripe_payment_intent_id -eq $body.payment_intent_id } | Select-Object -First 1
    if (-not $p) { Send-Err $res 404 'Payment not found'; return }
    $p.status = 'completed'
    $j = $db.jobs | Where-Object { $_.id -eq [int]$body.job_id } | Select-Object -First 1
    if ($j) {
      $j.status = 'completed'
      $prof = $db.profiles | Where-Object { $_.user_id -eq $j.handyman_id } | Select-Object -First 1
      if ($prof) { $prof.total_jobs = [int]$prof.total_jobs + 1 }
    }
    Save-Db $db
    Send-Json $res 200 @{ status='completed'; message='Payment simulated (demo). Handyman credited 82%; platform kept 18%.' }
    return
  }

  if ($method -eq 'GET' -and $path -eq '/api/payments/earnings') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    if ($user.role -ne 'handyman') { Send-Err $res 403 'Insufficient permissions'; return }
    $rows = @($db.jobs | Where-Object { $_.handyman_id -eq $user.id })
    $done = @($rows | Where-Object { $_.status -eq 'completed' })
    $pend = @($rows | Where-Object { $_.status -ne 'completed' -and $_.status -ne 'cancelled' })
    $total = 0.0; foreach ($r in $done) { $total += [double]$r.handyman_earning }
    $pending = 0.0; foreach ($r in $pend) { $pending += [double]$r.handyman_earning }
    $comm = 0.0; foreach ($r in $done) { $comm += [double]$r.platform_fee }
    $jobsOut = @($rows | Sort-Object -Property id -Descending | ForEach-Object { Get-DecoratedJob $db $_ })
    Send-Json $res 200 @{ jobs=$jobsOut; total_earnings=(Round2 $total); pending_earnings=(Round2 $pending); commission_paid=(Round2 $comm) }
    return
  }

  # --- reviews ---
  if ($method -eq 'POST' -and $path -eq '/api/reviews') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    if ($user.role -ne 'client') { Send-Err $res 403 'Insufficient permissions'; return }
    $rating = [int]$body.rating
    if (-not $body.job_id -or $rating -lt 1 -or $rating -gt 5) { Send-Err $res 400 'Job ID and rating (1-5) are required'; return }
    $jid = [int]$body.job_id
    $j = $db.jobs | Where-Object { $_.id -eq $jid -and $_.client_id -eq $user.id -and $_.status -eq 'completed' } | Select-Object -First 1
    if (-not $j) { Send-Err $res 403 'Job not found, not yours, or not completed'; return }
    if ($db.reviews | Where-Object { $_.job_id -eq $jid }) { Send-Err $res 409 'Review already exists for this job'; return }
    $db.reviews += ,@{ id=[int]$db.nextReviewId; job_id=$jid; client_id=$user.id; handyman_id=$j.handyman_id; rating=$rating; comment=$body.comment; created_at=(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }
    $db.nextReviewId = [int]$db.nextReviewId + 1
    $prof = $db.profiles | Where-Object { $_.user_id -eq $j.handyman_id } | Select-Object -First 1
    $newRating = $null
    if ($prof) {
      $rs = @($db.reviews | Where-Object { $_.handyman_id -eq $j.handyman_id })
      $sum = 0.0
      foreach ($rr in $rs) { $sum += [double]$rr.rating }
      if ($rs.Count -gt 0) { $prof.rating = (Round2 ($sum / $rs.Count)) }
      $newRating = $prof.rating
    }
    Save-Db $db
    Send-Json $res 201 @{ message='Review submitted'; rating=$newRating }
    return
  }

  if ($method -eq 'GET' -and $path -match '^/api/reviews/handyman/(\d+)$') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    $hid = [int]$Matches[1]
    $rows = @($db.reviews | Where-Object { $_.handyman_id -eq $hid } | Sort-Object -Property id -Descending)
    $out = @()
    foreach ($r in $rows) {
      $c = $db.users | Where-Object { $_.id -eq $r.client_id } | Select-Object -First 1
      $cn = 'Client'
      if ($c) { $cn = $c.full_name }
      $out += ,@{ id=$r.id; job_id=$r.job_id; client_id=$r.client_id; handyman_id=$r.handyman_id; rating=$r.rating; comment=$r.comment; created_at=$r.created_at; client_name=$cn }
    }
    Send-Json $res 200 @{ reviews = $out }
    return
  }

  # --- admin ---
  if ($path -match '^/api/admin/') {
    if (-not $user) { Send-Err $res 401 'Access token required'; return }
    if ($user.role -ne 'admin') { Send-Err $res 403 'Insufficient permissions'; return }

    if ($method -eq 'GET' -and $path -eq '/api/admin/stats') {
      $completed = @($db.jobs | Where-Object { $_.status -eq 'completed' })
      $rev = 0.0; foreach ($r in $completed) { $rev += [double]$r.platform_fee }
      Send-Json $res 200 @{
        users = $db.users.Count
        handymen = @($db.users | Where-Object { $_.role -eq 'handyman' }).Count
        clients = @($db.users | Where-Object { $_.role -eq 'client' }).Count
        jobs = $db.jobs.Count
        completed = $completed.Count
        pending = @($db.jobs | Where-Object { $_.status -eq 'pending' }).Count
        platform_revenue = (Round2 $rev)
      }
      return
    }

    if ($method -eq 'GET' -and $path -eq '/api/admin/users') {
      $list = @($db.users | Sort-Object -Property id -Descending | ForEach-Object { Get-PubUser $_ })
      Send-Json $res 200 @{ users = $list }
      return
    }

    if ($method -eq 'GET' -and $path -eq '/api/admin/jobs') {
      $list = @($db.jobs | Sort-Object -Property id -Descending | ForEach-Object { Get-DecoratedJob $db $_ })
      Send-Json $res 200 @{ jobs = $list }
      return
    }

    if ($method -eq 'PATCH' -and $path -match '^/api/admin/users/(\d+)/role$') {
      $role = [string]$body.role
      if ($role -notin @('client','handyman','admin')) { Send-Err $res 400 'Invalid role'; return }
      $uid = [int]$Matches[1]
      $u = $db.users | Where-Object { $_.id -eq $uid } | Select-Object -First 1
      if (-not $u) { Send-Err $res 404 'User not found'; return }
      $u.role = $role
      Save-Db $db
      Send-Json $res 200 @{ message = 'Role updated' }
      return
    }
  }

  Send-Err $res 404 'Not found'
}

# ---------- main loop ----------
$db = Get-Db
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Handyman Pro (PowerShell server) running at http://localhost:$Port"

while ($listener.IsListening) {
  $ctx = $null
  try { $ctx = $listener.GetContext() } catch { break }
  try {
    Handle-Request $db $ctx.Request $ctx.Response
  } catch {
    try { Send-Err $ctx.Response 500 ('Server error: ' + $_.Exception.Message) } catch {}
  }
}
