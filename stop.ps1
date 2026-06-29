# stop.ps1 - kill whatever is listening on EC-Agent ports (3000 backend, 5173 frontend).
foreach ($port in 3000, 5173) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $conns.OwningProcess | Sort-Object -Unique | ForEach-Object {
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
  }
}
