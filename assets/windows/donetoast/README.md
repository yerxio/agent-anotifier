# Vendored: donetoast

The Windows card backend for Codex notifications. It draws its own WPF window, so
it shows up even when Windows notifications or Focus Assist would swallow a native
toast, and the card stays on screen until it is dismissed.

Upstream: [siiplasplas/donetoast](https://github.com/siiplasplas/donetoast) — MIT,
see [LICENSE](LICENSE). Vendored from commit
`a75629d68e49f9a8108120d6febab1fa7771bba9`.

## Why vendored instead of a submodule

anotifier ships on npm, and `npm pack` does not follow a git submodule: a submodule
would publish an empty directory, and every CI job and contributor clone would need
`--recurse-submodules`. The card is also not a drop-in dependency — anotifier needs
the acknowledgement button below, which does not exist upstream — so the scripts are
part of this repo and are edited here.

## Local modifications

Two changes against upstream: a named dismiss button, and click-to-focus.

### Click-to-focus

- `donetoast.ps1` — `-ProjectName`, `-Cwd` and `-ClickToFocus`. It resolves the
  agent's window handle through `../ancestor-hwnd.ps1` and forwards all three to
  the card. The handle has to be resolved *here*: this process is still a
  descendant of the terminal, while the card it starts is detached through
  `Win32_Process.Create` and has WMI for a parent.
- `toast.ps1` — `-ProjectName`, `-Cwd` and `-Hwnd`. Clicking the card body runs
  `../focus-window.ps1` with the same argument the `agentfocus://` protocol
  handler receives, so the window is activated through ShowWindow /
  BringWindowToTop / SwitchToThisWindow / SetForegroundWindow. It runs in the
  card's own process on purpose: the clicked card owns the foreground window, so
  Windows lets it hand focus over, where a detached child would be refused.
  Clicking the acknowledgement button stays dismiss-only.

Window titles alone are not enough to find the window — a terminal tab is
usually named by the shell or the agent, not after the project — which is why
the handle matters. What no backend can do is pick the right *tab*: Windows
Terminal exposes no public mapping from `WT_SESSION` to a window or tab index,
so the target is the window.

- `toast.ps1` — new `-AcknowledgeLabel <text>` parameter. When set, the card widens
  (360×78 instead of 283×70, content inset to 86 px) and renders a `Acknowledge`
  button that closes the card on click. `AutomationProperties.Name` carries the same
  label so UI Automation can find it. Empty label (the default) collapses the button
  and keeps the original card geometry.
- `donetoast.ps1` — accepts `-AcknowledgeLabel` and passes it through to `toast.ps1`
  base64-encoded, the same way it already passes the title and message.

`src/platforms/windows.mjs` calls `donetoast.ps1` with `-AcknowledgeLabel 知道了`
and, unless `toast.clickToFocus` is off, the project name and cwd. When pulling
in a new upstream version, re-apply both changes — the test
`tests/platforms-donetoast.test.mjs` fails if they are missing.

## What ships here

Runtime only:

- `donetoast.ps1` — entry point; starts the card in a hidden, detached process.
- `toast.ps1` — the card itself (WPF).
- `job-runner.ps1` — needed by `donetoast.ps1 -Command`; unused by anotifier.
- `done.wav`, `failed.wav`, `waiting.wav` — card sounds. `toast.ps1` plays them in a
  try/catch, so a missing file costs the sound, not the card.
- `icon.png`, `icons/claude.png`, `icons/codex.png` — the 44 px header avatar.
  `toast.ps1` looks for `icons/<app>.png` and falls back to `icon.png`.

Dropped from upstream: `install.ps1` (it patches `~/.claude/settings.json` itself —
anotifier's own setup owns the hooks), `claude-hook.ps1`, `claude-clear.cmd`,
`make-sounds.ps1` with `sounds/` (sound generation, not runtime), `tools/`, `docs/`
(1.5 MB of demo media) and the upstream README.

## Runtime artifacts

`toast.ps1` appends to `toast.log` next to itself, and the live-progress and
`-Command` paths create `progress/` and `jobs/` there. anotifier only uses the
one-shot card path, so in practice only `toast.log` appears. All three are
gitignored.
