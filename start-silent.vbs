' start-silent.vbs - run start.ps1 fully hidden (0 = no window, no flash)
CreateObject("Wscript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""E:\EC-Agent\start.ps1""", 0, False
