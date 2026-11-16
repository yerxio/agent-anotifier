# Dot-source this to get Get-AncestorWindowHandle.
#
# The window handle of the terminal or IDE that started the agent, found by
# walking the parent-process chain from this process upward and taking the
# first ancestor that owns a window. The notification process itself is a
# descendant of the agent, which is a descendant of the shell, which is hosted
# by the terminal window — so the chain is the only thing that reliably
# identifies the right window. A window TITLE cannot: a Windows Terminal tab
# shows whatever the shell or the agent set it to, which is usually not the
# project folder name.
#
# It must run while the chain is still intact. donetoast.ps1 qualifies (it is a
# direct child of the notify.mjs hook); the card process does not, because it
# is created detached through Win32_Process.Create and its parent is WMI.
#
# Built from a single Toolhelp32 snapshot rather than per-process
# Get-CimInstance Win32_Process calls: on some machines WMI takes ~2-3s per
# query, and a handful of them blows the hook's budget (the card never fires).
#
# Known limit, shared with the native toast backend: Windows Terminal hosts
# every window in ONE process, so MainWindowHandle is that process's main
# window, which may be a different Terminal window than the one holding the
# agent's tab. Windows Terminal exposes no public mapping from WT_SESSION to a
# window or tab, so there is nothing more precise to use.
function Get-AncestorWindowHandle {
  try {
    if (-not ([System.Management.Automation.PSTypeName]'AANProcMap').Type) {
      Add-Type -ErrorAction Stop -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public static class AANProcMap {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct PROCESSENTRY32 {
    public uint dwSize; public uint cntUsage; public uint th32ProcessID;
    public IntPtr th32DefaultHeapID; public uint th32ModuleID; public uint cntThreads;
    public uint th32ParentProcessID; public int pcPriClassBase; public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
  }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll")] static extern bool Process32First(IntPtr h, ref PROCESSENTRY32 e);
  [DllImport("kernel32.dll")] static extern bool Process32Next(IntPtr h, ref PROCESSENTRY32 e);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static Dictionary<uint, uint> ParentMap() {
    var map = new Dictionary<uint, uint>();
    IntPtr snap = CreateToolhelp32Snapshot(2u, 0u); // TH32CS_SNAPPROCESS
    if (snap == IntPtr.Zero || snap == new IntPtr(-1)) { return map; }
    var e = new PROCESSENTRY32(); e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
    if (Process32First(snap, ref e)) { do { map[e.th32ProcessID] = e.th32ParentProcessID; } while (Process32Next(snap, ref e)); }
    CloseHandle(snap); return map;
  }
}
'@
    }
    $map = [AANProcMap]::ParentMap()
    $id = [uint32]$PID
    for ($i = 0; $i -lt 20; $i++) {
      if (-not $map.ContainsKey($id)) { break }
      $parent = $map[$id]
      if ($parent -le 0) { break }
      $proc = Get-Process -Id $parent -ErrorAction SilentlyContinue
      if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
        return [int64]$proc.MainWindowHandle
      }
      $id = $parent
    }
  } catch {}
  return 0
}
