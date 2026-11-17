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

Two changes against upstream: a named dismiss button, and one larger card size.

### Dismiss button

- `toast.ps1` — new `-AcknowledgeLabel <text>` parameter. When set, the card
  renders an `Acknowledge` button that closes it on click, and the text column's
  right inset grows to clear the button. `AutomationProperties.Name` carries the
  same label so UI Automation can find it. Empty label (the default) collapses
  the button.
- `donetoast.ps1` — accepts `-AcknowledgeLabel` and passes it through to `toast.ps1`
  base64-encoded, the same way it already passes the title and message.

### One card size: 480×160

Upstream's card is 283×70 with a single ellipsized message line, which showed
about 40 of the 180 characters anotifier sends. Every card is now 480×160 —
whatever the tool, the state, or the options — with a 56 px avatar, slightly
larger type, and a message that wraps to five lines before it ends in an
ellipsis. The size is a constant in `toast.ps1` (`$cardWidth` / `$cardHeight`),
not derived from the content or from `-AcknowledgeLabel`: one geometry keeps the
stack gap-free and leaves a single layout to maintain. The progress bar follows
`$cardWidth` instead of a hard-coded 283.

### Turn length in the header

`-Duration <text>` on both scripts. The card header reads
`Claude · done · 4m 12s`; `src/platforms/windows.mjs` (`cardContent`) takes the
` (took 4m 12s)` suffix off the message and sends it here instead, because at
the end of the message it was the first thing a long text pushed off the card.
The same function sends the project name alone as the title — the header
already names the tool.

### Two more states: info and warning

Upstream has `done`, `failed`, `waiting` ("needs you") and `running`. The card
prints the state word next to the tool name, so a notification that is none of
those had to borrow one and said the wrong thing — "Claude · needs you" for a
background agent that had simply finished. `toast.ps1` gains `info` (blue) and
`warning` (amber) in `$looks`, selected with its existing `-State`;
`donetoast.ps1` gains `-Info` and `-Warning`. `cardState()` in
`src/platforms/windows.mjs` decides which one a notification is.

### On every virtual desktop

`toast.ps1` sets `WS_EX_TOOLWINDOW` on the card's window as soon as it has a
handle and before it is shown. Windows assigns an ordinary top-level window to
the virtual desktop it opened on, so upstream's card was simply absent from the
other desktops; a tool window is not managed by virtual desktops and is shown on
all of them. It is one window rather than a copy per desktop, so dismissing it
on any desktop removes it from every one.

### The user's own sound

`-Sound <name or .wav path>` and `-Silent` on both scripts, fed from the same
`events.<event>.toastSound` the native toast reads (`anotifier config sounds`).
A name — `IM`, `Reminder`, `Mail`, `SMS`, `Default`, `Alarm`..`Alarm10`,
`Call`..`Call10` — is resolved by the card through
`HKCU:\AppEvents\Schemes\Apps\.Default\Notification.<name>\.Current`, so it is
the sound Windows has assigned to that name, including one the user changed in
the sound settings. A `.wav` path is played directly. Other audio formats are
played by `src/platforms/windows.mjs` through `play-sound.ps1` and the card is
started `-Silent`.

Two deliberate differences from a native toast: the sound plays once, looping
names included, because a card stays up until it is clicked; and anything that
does not resolve — an unknown name, a missing file — falls back to the card's
bundled chime rather than to silence.

`src/platforms/windows.mjs` calls `donetoast.ps1` with `-AcknowledgeLabel 知道了`.
When pulling in a new upstream version, re-apply these changes — the test
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

None in normal use. Upstream's `toast.ps1` appended every card's title and
message to a `toast.log` next to itself; that line is removed here, because it
wrote the text of the user's notifications — for Claude Code, the agent's own
words — into the install directory. Delivery failures are recorded by anotifier
in `~/.anotifier/errors.log` instead.

The live-progress and `-Command` modes still create `progress/` and `jobs/`
next to the scripts. anotifier uses neither mode; both directories are
gitignored.
