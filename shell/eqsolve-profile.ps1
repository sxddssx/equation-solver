# eqsolve profile helper -- append this file to your PowerShell profile
#   %USERPROFILE%\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
# CLI script: <EQ_SOLVER_ROOT>\cli.js   (see $defaultRoot below)
# GUI app (--web or double-click): the single-file HTML next to cli.js, whose
# Chinese file name means "equation solver calculator".
#
# NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 reads a
# BOM-less .ps1 as ANSI (gb2312 on this machine), and non-ASCII bytes inside a
# comment can swallow the following newline and merge two lines together.
# The Chinese file name is therefore built from Unicode code points.
function eqsolve {
    <#
    .SYNOPSIS
        Solves one-variable linear and quadratic equations (exact roots + steps).
    .DESCRIPTION
        Without arguments the equation is taken from the command line or, in
        batch mode, from the pipeline (one equation per line).

        -s (--short) prints only the solution set.
        -w (--web)   opens the graphical version in the default browser
                     instead of running the command-line solver.

        Always quote the equation so that ^, ( , ) and + survive the shell.
    .EXAMPLE
        eqsolve "2x + 3 = 5x - 9"
    .EXAMPLE
        eqsolve -s "x^2 - 5x + 6 = 0"
    .EXAMPLE
        eqsolve --web
    .EXAMPLE
        Get-Content .\examples\equations.txt | eqsolve -s
    #>
    # Where this checkout lives -- the folder that contains cli.js.
    # Priority: the EQ_SOLVER_ROOT environment variable, then $defaultRoot.
    # Edit $defaultRoot only if you would rather not set the env var.
    $defaultRoot = 'C:\path\to\equation-solver'
    $eqRoot = $env:EQ_SOLVER_ROOT
    if (-not $eqRoot) { $eqRoot = $defaultRoot }
    $eqRoot = $eqRoot.TrimEnd('\')

    $cliPath = Join-Path $eqRoot 'cli.js'

    # The single-file build is index.html (ASCII name, so no encoding tricks).
    $htmlName = 'index.html'
    $htmlDirs = @($eqRoot, (Split-Path -Parent $eqRoot))

    $eqArgs = @($args)
    $wantWeb = $false
    $rest = @()
    foreach ($a in $eqArgs) {
        if ($a -eq '--web' -or $a -eq '-w') { $wantWeb = $true } else { $rest += $a }
    }

    # --web / -w: open the single-file HTML app in the default browser.
    if ($wantWeb) {
        $htmlPath = $null
        foreach ($d in $htmlDirs) {
            $candidate = Join-Path $d $htmlName
            if (Test-Path -LiteralPath $candidate) { $htmlPath = $candidate; break }
        }
        if (-not $htmlPath) {
            # Fall back to whatever HTML build sits in the project folder.
            $found = Get-ChildItem -LiteralPath $eqRoot -Filter '*.html' -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($found) { $htmlPath = $found.FullName }
        }
        if (-not $htmlPath) {
            Write-Host ('[eqsolve] Web build not found. Run: node ' + (Join-Path $eqRoot 'build.js')) -ForegroundColor Red
            return
        }
        if ($rest.Count -gt 0) {
            Write-Host '[eqsolve] --web opens the GUI; the other arguments were ignored.' -ForegroundColor Yellow
        }
        Start-Process -FilePath $htmlPath
        Write-Host ('[eqsolve] Opening ' + $htmlPath)
        return
    }

    if (-not (Test-Path -LiteralPath $cliPath)) {
        Write-Host "[eqsolve] Solver script not found: $cliPath" -ForegroundColor Red
        return
    }

    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $nodeExe) { $nodeExe = 'C:\Program Files\nodejs\node.exe' }
    if (-not (Test-Path -LiteralPath $nodeExe)) {
        Write-Host '[eqsolve] node.exe not found. Install Node.js or add it to PATH.' -ForegroundColor Red
        return
    }

    # node writes UTF-8, while Windows PowerShell 5.1 decodes native-command output
    # with the console code page (936 here) and encodes piped input with
    # $OutputEncoding (ASCII by default). Switch both to UTF-8 for the call,
    # then restore them, so Chinese output and piped superscripts survive.
    $oldOut = [Console]::OutputEncoding
    $oldPipe = $OutputEncoding
    try {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $OutputEncoding = [System.Text.Encoding]::UTF8

        $lines = @($input)

        if ($lines.Count -gt 0) {
            # Piped input: hand the lines to node on stdin (batch mode).
            ($lines -join "`r`n") | & $nodeExe $cliPath @rest
        }
        elseif ($rest.Count -eq 0) {
            if ([Console]::IsInputRedirected) {
                & $nodeExe $cliPath
            }
            else {
                & $nodeExe $cliPath --help
            }
        }
        else {
            & $nodeExe $cliPath @rest
        }
    }
    finally {
        [Console]::OutputEncoding = $oldOut
        $OutputEncoding = $oldPipe
    }
}