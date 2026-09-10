$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1
if (!$installer) { throw 'No Windows installer found' }
$install = Start-Process -FilePath $installer.FullName -ArgumentList '/S' -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Installer failed: $($install.ExitCode)" }
$exe = Join-Path $env:LOCALAPPDATA 'GEX Cockpit/gex-cockpit.exe'
if (!(Test-Path $exe)) { throw "Installed app not found: $exe" }
$app = Start-Process -FilePath $exe -PassThru
try {
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 500
    $app.Refresh()
    if ($app.HasExited) { throw "Installed app exited: $($app.ExitCode)" }
  } until ($app.MainWindowHandle -ne 0 -or (Get-Date) -gt $deadline)
  if ($app.MainWindowHandle -eq 0) { throw 'Installed app did not open a window' }
  Write-Output 'Installer completed and the installed Windows app opened a native window.'
  Write-Output 'Live provider data and visible notification delivery still require user acceptance on Windows.'
} finally {
  $app.CloseMainWindow() | Out-Null
  if (!$app.WaitForExit(10000)) { $app.Kill(); throw 'App did not stop when its window closed' }
}
