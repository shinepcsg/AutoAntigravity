# AutoAntigravity Symlink Dev Setup
# 이 스크립트를 관리자 권한으로 1회 실행하면,
# 이후 소스 수정 → Reload Window만으로 즉시 반영됨
# ⚠️ 관리자 권한 PowerShell에서 실행해야 함!

$extensionsDir = "$env:USERPROFILE\.antigravity\extensions"
$sourceDir = $PSScriptRoot
$packageJson = Get-Content "$sourceDir\package.json" | ConvertFrom-Json
$version = $packageJson.version
$publisher = $packageJson.publisher
$targetDir = "$extensionsDir\$publisher.auto-antigravity-$version"

Write-Host "🔗 Setting up symlink for dev mode..." -ForegroundColor Cyan
Write-Host "   Source: $sourceDir" -ForegroundColor Gray
Write-Host "   Target: $targetDir" -ForegroundColor Gray

# 기존 설치된 확장 폴더 백업/제거
$existingDirs = Get-ChildItem $extensionsDir -Directory -Filter "$publisher.auto-antigravity-*"
foreach ($dir in $existingDirs) {
    if ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        Write-Host "   Removing existing symlink: $($dir.Name)" -ForegroundColor Yellow
        cmd /c rmdir $dir.FullName
    } else {
        $backupName = "$($dir.FullName).bak"
        Write-Host "   Backing up: $($dir.Name) → $($dir.Name).bak" -ForegroundColor Yellow
        if (Test-Path $backupName) { Remove-Item $backupName -Recurse -Force }
        Rename-Item $dir.FullName $backupName
    }
}

# 심볼릭 링크 생성
cmd /c mklink /D "$targetDir" "$sourceDir"

if (Test-Path $targetDir) {
    Write-Host ""
    Write-Host "✅ Symlink created successfully!" -ForegroundColor Green
    Write-Host "   이제부터 소스 수정 후 Ctrl+Shift+P → 'Reload Window'만 하면 즉시 반영됩니다!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Failed! 관리자 권한 PowerShell에서 다시 실행해주세요." -ForegroundColor Red
}
