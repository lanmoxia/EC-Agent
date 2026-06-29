' stop-silent.vbs - run stop.ps1 hidden, then confirm with a small dialog
Set sh = CreateObject("Wscript.Shell")
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""E:\EC-Agent\stop.ps1""", 0, True
MsgBox "EC-Agent backend/frontend stopped.", 64, "EC-Agent"
