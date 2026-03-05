# AutoAntigravity Quick Reload Script
# 소스 수정 후 이 스크립트를 실행하면 즉시 반영됨

# 1. VSIX 패키지 빌드
Write-Host "📦 Building VSIX package..." -ForegroundColor Cyan
npx -y @vscode/vsce package --no-dependencies --baseContentUrl "." --baseImagesUrl "." --allow-star-activation 2>&1 | Out-Null

# 2. 생성된 최신 VSIX 파일 찾기
$vsix = Get-ChildItem "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $vsix) {
    Write-Host "❌ VSIX file not found! Trying without --no-dependencies..." -ForegroundColor Red
    npx -y @vscode/vsce package --baseContentUrl "." --baseImagesUrl "." --allow-star-activation 2>&1 | Out-Null
    $vsix = Get-ChildItem "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $vsix) {
        Write-Host "❌ VSIX build failed!" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✅ Built: $($vsix.Name)" -ForegroundColor Green

# 3. Antigravity CLI로 설치 (antigravity 또는 code 커맨드 사용)
Write-Host "📥 Installing extension..." -ForegroundColor Cyan

# antigravity CLI가 있으면 사용, 없으면 code CLI 사용
$cliName = "antigravity"
$cliPath = Get-Command $cliName -ErrorAction SilentlyContinue
if (-not $cliPath) {
    $cliName = "code"
    $cliPath = Get-Command $cliName -ErrorAction SilentlyContinue
}

if ($cliPath) {
    & $cliName --install-extension $vsix.FullName --force 2>$null
    Write-Host "✅ Extension installed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔄 Now press Ctrl+Shift+P → 'Developer: Reload Window' to apply!" -ForegroundColor Yellow
} else {
    Write-Host "⚠️  CLI not found. Please install manually:" -ForegroundColor Yellow
    Write-Host "   Extensions → ... → Install from VSIX → $($vsix.Name)" -ForegroundColor Yellow
}

# 4. 이전 VSIX 파일 정리 (최신 1개만 유지)
$oldVsix = Get-ChildItem "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 1
if ($oldVsix) {
    $oldVsix | Remove-Item -Force
    Write-Host "🧹 Cleaned up $($oldVsix.Count) old VSIX file(s)" -ForegroundColor Gray
}
