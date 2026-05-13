$ErrorActionPreference = "SilentlyContinue"
$PROJECT_BASE = "C:\Users\wu\.claude\projects"
$TETO_DIR = "$PROJECT_BASE\D--wu----TETO----"
$OTHER_DIR = "$PROJECT_BASE\D--wu-------"

function Get-JsonlFiles {
    param([string]$Dir, [int]$MaxFiles = 15)
    Get-ChildItem -Path $Dir -Filter "*.jsonl" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First $MaxFiles
}

function Extract-BashCommands {
    param([string]$FilePath)
    $commands = @()
    $lines = Get-Content -Path $FilePath -ErrorAction SilentlyContinue
    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            $obj = $line | ConvertFrom-Json -ErrorAction Stop
        } catch { continue }

        $message = $null
        if ($obj.message) { $message = $obj.message }
        elseif ($obj.type -eq "assistant") { $message = $obj }

        if (-not $message) { continue }
        if (-not $message.content) { continue }

        foreach ($item in $message.content) {
            if ($item.type -ne "tool_use") { continue }
            if ($item.name -ne "Bash") { continue }
            $cmd = $null
            if ($item.input.command) { $cmd = $item.input.command }
            elseif ($item.input -is [string]) {
                try {
                    $inpObj = $item.input | ConvertFrom-Json -ErrorAction Stop
                    $cmd = $inpObj.command
                } catch {}
            }
            if ($cmd) { $commands += $cmd }
        }
    }
    return $commands
}

$counter = @{}
$totalFiles = 0
$totalBashCalls = 0

# TETO project
$tetoFiles = Get-JsonlFiles -Dir $TETO_DIR -MaxFiles 15
Write-Host "TETO project: found $($tetoFiles.Count) session files"
foreach ($f in $tetoFiles) {
    Write-Host "  Scanning: $($f.Name)"
    $cmds = Extract-BashCommands -FilePath $f.FullName
    Write-Host "    -> $($cmds.Count) Bash calls"
    $totalBashCalls += $cmds.Count
    foreach ($cmd in $cmds) {
        $pattern = $cmd.Trim() -replace '\s+', ' '
        if ($counter.ContainsKey($pattern)) { $counter[$pattern]++ }
        else { $counter[$pattern] = 1 }
    }
    $totalFiles++
}

# Other projects
$otherFiles = Get-JsonlFiles -Dir $OTHER_DIR -MaxFiles 5
Write-Host "`nOther projects: found $($otherFiles.Count) session files"
foreach ($f in $otherFiles) {
    Write-Host "  Scanning: $($f.Name)"
    $cmds = Extract-BashCommands -FilePath $f.FullName
    Write-Host "    -> $($cmds.Count) Bash calls"
    $totalBashCalls += $cmds.Count
    foreach ($cmd in $cmds) {
        $pattern = $cmd.Trim() -replace '\s+', ' '
        if ($counter.ContainsKey($pattern)) { $counter[$pattern]++ }
        else { $counter[$pattern] = 1 }
    }
    $totalFiles++
}

Write-Host "`n$('=' * 60)"
Write-Host "Total files scanned: $totalFiles"
Write-Host "Total Bash calls: $totalBashCalls"
Write-Host "Unique patterns: $($counter.Count)"
Write-Host "$('=' * 60)`n"

$counter.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
    Write-Host "$($_.Value) | $($_.Key)"
}
