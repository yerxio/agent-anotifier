# Record the handle of the window that is in front right now, for the card's
# "jump to window" button (src/agent-window.mjs spawns this detached from the
# turn-start hook).
#
# It runs at the moment the user submits a prompt, when the agent's own
# terminal — the window they just typed into — is the foreground window. That
# is the one reliable instant to identify it: by the time the agent finishes
# and the notification fires, the user may be on another virtual desktop, and
# Windows Terminal hosts every window in one process, so the process chain
# cannot tell which window (or desktop) the agent is on. The foreground window
# at submit time can.
#
# Usage: capture-window.ps1 -Out <path>
# Writes {"hwnd":<n>,"at":<unixMs>} to <path>, atomically. Empty foreground
# writes nothing, leaving any earlier capture in place.
param([Parameter(Mandatory)][string]$Out)
try {
  Add-Type -ErrorAction Stop -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AANForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
  $h = [AANForeground]::GetForegroundWindow()
  if ($h -eq [IntPtr]::Zero) { return }
  $ms = [long][Math]::Floor(([DateTimeOffset]::UtcNow).ToUnixTimeMilliseconds())
  $json = '{{"hwnd":{0},"at":{1}}}' -f ([int64]$h), $ms
  $tmp = "$Out.tmp"
  [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding $false))
  [IO.File]::Copy($tmp, $Out, $true)
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
} catch {}
