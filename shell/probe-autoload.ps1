# Proves that a plain PowerShell host (no -NoProfile, no manual dot-sourcing)
# picks up eqsolve from the profile automatically. ASCII-only.
$o = (eqsolve -s 'x^2 - 2 = 0' | Out-String)
Write-Host ('eqsolve available via profile auto-load: ' + [bool](Get-Command eqsolve -ErrorAction SilentlyContinue))
Write-Host ('arguments reached node: ' + ($o -match '1\.414214'))
Write-Host ('output decoded as UTF-8 (radical sign): ' + $o.Contains([char]0x221A))
Write-Host ('output decoded as UTF-8 (fullwidth comma): ' + $o.Contains([char]0xFF0C))
Write-Host ('raw codes: ' + ((($o.Trim().ToCharArray()) | ForEach-Object { [int]$_ } | Select-Object -First 20) -join ','))