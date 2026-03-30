const cp = require("child_process");
const targetPort = 9559;
const psContent = `
$flag = "--remote-debugging-port=${targetPort}"
$WshShell = New-Object -comObject WScript.Shell
$paths = @(
    "$env:USERPROFILE\\\\Desktop",
    "$env:PUBLIC\\\\Desktop",
    "$env:APPDATA\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs",
    "$env:ALLUSERSPROFILE\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs",
    "$env:APPDATA\\\\Microsoft\\\\Internet Explorer\\\\Quick Launch\\\\User Pinned\\\\TaskBar"
)
$patched = $false
$manualFixNeeded = $false
$patchedLnk = $null

foreach ($dir in $paths) {
    if (Test-Path $dir) {
        $files = Get-ChildItem -Path $dir -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            try {
                $shortcut = $WshShell.CreateShortcut($file.FullName)
                if ($file.Name -match "Antigravity" -or $shortcut.TargetPath -match "Antigravity") {
                    if ($shortcut.Arguments -match "--remote-debugging-port=") {
                        if ($shortcut.Arguments -notmatch $flag) {
                            $manualFixNeeded = $true
                        } else {
                            if (-not $patchedLnk) { $patchedLnk = $file.FullName }
                        }
                    } else {
                        $shortcut.Arguments = ("$($shortcut.Arguments) " + $flag).Trim()
                        $shortcut.Save()
                        $patched = $true
                        if (-not $patchedLnk) { $patchedLnk = $file.FullName }
                    }
                }
            } catch { 
                Write-Output "DEBUG: Error reading $($file.FullName)"
            }
        }
    }
}
if ($manualFixNeeded) { Write-Output "MANUAL_NEEDED" }
elseif ($patched -or $patchedLnk) { Write-Output "SUCCESS|$patchedLnk" }
else { Write-Output "NOT_FOUND" }
`;
const base64Script = Buffer.from(psContent, "utf16le").toString("base64");
cp.exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64Script}`, (err, stdout, stderr) => {
    console.log("OUT:", stdout.trim());
    if (err) console.log("ERR:", err);
});
