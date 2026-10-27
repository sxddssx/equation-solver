# Verifies the eqsolve function installed in the Windows PowerShell profile.
# Loads the profile explicitly, because hosts may run with -NoProfile.
# ASCII-only on purpose (see the note in eqsolve-profile.ps1). Chinese strings
# are built from Unicode code points, so a wrong code page cannot fake a result.
$ErrorActionPreference = 'Continue'

# Repository root = the parent of this script's folder (this file lives in shell\).
$repoRoot = Split-Path -Parent $PSScriptRoot
# Point the profile function at this checkout, whatever path it was installed with.
$env:EQ_SOLVER_ROOT = $repoRoot

$prof = Join-Path $env:USERPROFILE 'Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1'
if (-not (Test-Path -LiteralPath $prof)) { Write-Host 'profile not found'; exit 1 }
. $prof

$script:pass = 0
$script:fail = 0
function Check {
    param([bool]$Ok, [string]$Name)
    if ($Ok) { $script:pass++; Write-Host ('  PASS  ' + $Name) }
    else { $script:fail++; Write-Host ('  FAIL  ' + $Name) }
}
# U builds a string from Unicode code points (keeps this file ASCII-only).
function U { param([int[]]$Cp) return (-join ($Cp | ForEach-Object { [char]$_ })) }
function CodesOf { param([string]$S) return (($S.ToCharArray() | ForEach-Object { [int]$_ } | Select-Object -First 16) -join ',') }

$sYiXiang  = U 0x79FB, 0x9879          # yi xiang   (transposition step)
$sPanBie   = U 0x5224, 0x522B          # pan bie shi (discriminant)
$sFenMu    = U 0x5206, 0x6BCD          # fen mu     (denominator)
$sYongFa   = U 0x7528, 0x6CD5          # yong fa    (usage)
$sYuanFang = U 0x539F, 0x65B9, 0x7A0B  # yuan fang cheng (original equation)
$sRoot     = [char]0x221A              # square root sign
$sComma    = [char]0xFF0C              # fullwidth comma

Write-Host '== eqsolve profile check =='
Write-Host ('        profile: ' + $prof)
Check ([bool](Get-Command eqsolve -ErrorAction SilentlyContinue)) 'eqsolve is defined after loading the profile'

# 1) -s (short) mode: solution set only, decoded as real UTF-8 text
$oShort = (eqsolve -s 'x^2 - 2 = 0' | Out-String)
$oFull = (eqsolve 'x^2 - 2 = 0' | Out-String)
Write-Host ('        short codes: ' + (CodesOf $oShort))
Check ($oShort.Contains($sRoot)) 'short output keeps the radical sign (UTF-8 decoded)'
Check ($oShort.Contains($sComma)) 'short output keeps the fullwidth comma (UTF-8 decoded)'
Check (-not $oShort.Contains($sYuanFang)) 'short mode does not print the report header'
Check ($oFull.Contains($sYuanFang)) 'full report does print the report header'
Check ($oShort -match '1\.414214') 'decimal approximation present'
Check ($oShort.Length -lt $oFull.Length) 'short output is shorter than the full report'

# 2) full report is real Chinese, not mojibake
$oLin = (eqsolve '2x + 3 = 5x - 9' | Out-String)
Check ($oLin.Contains($sYiXiang)) 'linear report shows the transposition step (Chinese decoded)'
Check ($oLin -match 'x = 4') '2x + 3 = 5x - 9 solved as x = 4'
$oQuad = (eqsolve 'x^2 - 5x + 6 = 0' | Out-String)
Check ($oQuad.Contains($sPanBie)) 'quadratic report shows the discriminant section (Chinese decoded)'
Write-Host ('        quadratic codes: ' + (CodesOf $oQuad))

# 3) pipeline input -> batch mode
$oBatch = (@('x^2-5x+6=0', '2x+3=5x-9', 'x^2+x+1=0') | eqsolve -s | Out-String)
$headers = @($oBatch -split "`r?`n" | Where-Object { $_ -match '^>' })
Check ($headers.Count -eq 3) ('pipeline batch solved 3 equations (got ' + $headers.Count + ')')
Check ($oBatch -match 'x = 4') 'batch output contains x = 4'
Check ($oBatch.Contains($sRoot)) 'batch output keeps radicals (piped I/O uses UTF-8)'

# 4) file input
$oFile = (Get-Content (Join-Path $repoRoot 'examples\equations.txt') | eqsolve -s | Out-String)
Check ($oFile -match 'x = 4') 'file input via Get-Content works'

# 5) --help reaches the CLI
$oHelp = (eqsolve --help | Out-String)
Check ($oHelp.Contains($sYongFa)) 'eqsolve --help reaches the CLI'

# 6) friendly error + exit code
$oErr = (eqsolve -s '1/x = 2' | Out-String)
Check ($oErr.Contains($sFenMu)) 'invalid equation shows the friendly error'
Check ($LASTEXITCODE -eq 1) ('exit code is 1 for a failed equation (got ' + $LASTEXITCODE + ')')

# 7) the function must restore the session encoding
$encBefore = [Console]::OutputEncoding.CodePage
$null = (eqsolve -s 'x^2-9=0' | Out-String)
$encAfter = [Console]::OutputEncoding.CodePage
Check ($encBefore -eq $encAfter) ('console output encoding restored (' + $encBefore + ' -> ' + $encAfter + ')')

# 8) --web / -w open the single-file HTML build.
#    Start-Process is shadowed in this script scope so no browser actually opens:
#    the stub records the path instead.
$script:launched = $null
function Start-Process { param([string]$FilePath) $script:launched = $FilePath }

$htmlName = 'index.html'
# 6>&1 captures Write-Host output (information stream), which does not travel
# down the normal pipeline.
$oWeb = (eqsolve --web 6>&1 | Out-String)
Check ($null -ne $script:launched) 'eqsolve --web calls Start-Process'
Check ((Split-Path $script:launched -Leaf) -eq $htmlName) ('--web opens the HTML build (got: ' + $script:launched + ')')
Check (Test-Path -LiteralPath $script:launched) 'the opened HTML file exists'
Check ($oWeb.Contains($htmlName)) '--web reports the path it opened'
Check (-not $oWeb.Contains($sYuanFang)) '--web does not run the CLI solver'

$script:launched = $null
$null = (eqsolve -w | Out-String)
Check ($null -ne $script:launched) '-w works the same as --web'

$script:launched = $null
$oWeb2 = (eqsolve --web 'x^2 - 1 = 0' 6>&1 | Out-String)
Check ($null -ne $script:launched) '--web with an extra argument still opens the page'
Check ($oWeb2 -match 'ignored') 'extra arguments are reported as ignored'

# 9) the HTML build must be the current single-file build
$htmlText = [System.IO.File]::ReadAllText($script:launched, [System.Text.Encoding]::UTF8)
Check ($htmlText.Contains('__EqSolver')) 'the HTML build contains the inlined solver'
Check (-not ($htmlText -match '<script src=')) 'the HTML build has no external script references'

Write-Host ('== RESULT: pass=' + $script:pass + ' fail=' + $script:fail + ' ==')
if ($script:fail -gt 0) { exit 1 } else { exit 0 }