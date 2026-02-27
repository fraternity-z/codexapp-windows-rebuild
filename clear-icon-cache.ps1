# 清除 Windows 图标缓存
Write-Host "正在清除 Windows 图标缓存..." -ForegroundColor Yellow

# 停止 Windows 资源管理器
Write-Host "停止 explorer.exe..." -ForegroundColor Cyan
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 删除图标缓存文件
$iconCachePaths = @(
    "$env:LOCALAPPDATA\IconCache.db",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db"
)

foreach ($path in $iconCachePaths) {
    if (Test-Path $path) {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
        Write-Host "已删除: $path" -ForegroundColor Green
    } else {
        $files = Get-ChildItem -Path (Split-Path $path) -Filter (Split-Path $path -Leaf) -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            Remove-Item $file.FullName -Force -ErrorAction SilentlyContinue
            Write-Host "已删除: $($file.FullName)" -ForegroundColor Green
        }
    }
}

# 重启 Windows 资源管理器
Write-Host "重启 explorer.exe..." -ForegroundColor Cyan
Start-Process explorer.exe

Write-Host "`n图标缓存已清除！请重新运行 Codex 应用查看效果。" -ForegroundColor Green
Write-Host "如果图标仍未更新，请尝试：" -ForegroundColor Yellow
Write-Host "1. 完全卸载旧版本 Codex" -ForegroundColor White
Write-Host "2. 重启电脑" -ForegroundColor White
Write-Host "3. 重新安装新版本" -ForegroundColor White
