<h1 align="center">anotifier</h1>

<p align="center">
  <strong>Desktop & phone notifications for AI coding agents</strong><br />
  One tool. One config. Every agent. Never miss when your AI finishes or needs input.
</p>

<p align="center">
  <img src="assets/icons/claude.png" alt="Claude Code" width="36" />&nbsp;&nbsp;
  <img src="assets/icons/codex.png" alt="Codex CLI" width="36" />&nbsp;&nbsp;
  <img src="assets/icons/cursor.png" alt="Cursor" width="36" />&nbsp;&nbsp;
  <img src="assets/icons/gemini.png" alt="Gemini CLI" width="36" />&nbsp;&nbsp;
  <img src="assets/icons/vscode.png" alt="VS Code" width="36" />
</p>

---

## About this repository

This is a fork of [DevinoSolutions/anotifier-for-claude-codex-cursor](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor), modified for internal use. It is **not published to npm** and is used straight from a clone.

`npx anotifier` and `npm i -g anotifier` install the upstream package, which has none of the changes below. To use this fork, follow [Quick Start](#quick-start).

What differs from upstream:

- **Windows desktop notifications are Donetoast cards**, not native toasts: a persistent card with a `知道了` button, in one size, with the hook that raised it named in its header. The card scripts are vendored under `assets/windows/donetoast/`.
- **A card is on every virtual desktop.** Switch desktops and it is still there; dismiss it on one and it is gone from all of them.
- **Windows needs nothing installed.** No PowerShell 7, no BurntToast module: cards and the terminal bell both run on the Windows PowerShell 5.1 that ships with the system.
- **Setup makes no network request.** The icons ship in the repository instead of being downloaded.
- **The update check is off by default**, and while it is off no command contacts the npm registry.
- **The Windows terminal bell works.** Upstream's script threw on every run.
- **Nothing is sent to anyone but you.** Upstream's opt-in usage stats and its Sentry error reporting are removed, along with the `anotifier telemetry` command and the question `setup` asked about it. The only requests anotifier makes are the notifications you configure (ntfy, webhooks) and, if you turn it on, the update check.
- No click-to-focus on Windows: a card can only be dismissed.

macOS, Linux and WSL behave as upstream does.

## Quick Start

```bash
git clone https://github.com/yerxio/agent-anotifier.git
cd agent-anotifier
npm link          # puts the `anotifier` command on your PATH, pointing at this clone
anotifier setup
```

The setup wizard detects your platform and installed AI tools, wires the hooks, and optionally configures phone push notifications. Restart your AI tools to activate.

The hooks it writes point at this clone's `src/notify.mjs`, so keep the folder where it is, and note that the code on disk is the code that runs: `git pull` updates it, and checking out another branch changes what your notifications do. There are no runtime dependencies, so `npm link` installs nothing.

## Features

- **Desktop notifications** -- on Windows every desktop notification is a persistent Donetoast card with a `知道了` button, in one size, whose header names the hook that raised it (`Claude · Stop`, `Claude · Notification · permission_prompt`) (`toast.cards: false` puts them back on BurntToast); macOS uses Notification Center, and Linux uses libnotify
- **WSL toast routing** -- toasts from inside WSL are routed to Windows over PowerShell interop instead of a Linux notification daemon (see the proof boundary below)
- **Phone push notifications** -- Android & iOS via [ntfy](https://ntfy.sh) (free, no account required)
- **Webhook notifications** -- Slack, Discord, Telegram, or any HTTP endpoint, with an optional auth header
- **Rich notification content** -- Claude Code toasts and webhooks show what the agent actually said or asked, not a generic line
- **Terminal bell** -- audible ding in the terminal that launched the agent (works over SSH/tmux)
- **Click-to-focus** -- supported Windows native toasts can jump back to the terminal or VS Code window; a Donetoast card has an explicit dismiss button instead, with task navigation planned separately
- **Turn length** -- "task complete" says how long the turn took (`took 4m 12s`), and `minDurationSeconds` can skip quick turns (Claude Code, Codex, Gemini CLI)
- **Codex approval alerts** -- get notified the instant Codex asks for permission, not just when it finishes
- **Per-tool branded icons** -- each tool gets its own logo in the notification
- **One unified config** -- shared `~/.anotifier/config.json` across all tools
- **Atomic deduplication** -- prevents double notifications (e.g. Cursor's duplicate hook fires)
- **Zero dependencies** -- pure Node.js built-ins only, no npm production packages

## Supported Tools

<table>
  <tr>
    <th>Tool</th>
    <th>VS Code</th>
    <th>CLI</th>
    <th>Task Complete</th>
    <th>Needs Input</th>
  </tr>
  <tr>
    <td><img src="assets/icons/claude.png" width="18" />&nbsp; <strong>Claude Code</strong></td>
    <td align="center">Native</td>
    <td align="center">Native</td>
    <td><code>Stop</code></td>
    <td><code>Notification</code></td>
  </tr>
  <tr>
    <td><img src="assets/icons/codex.png" width="18" />&nbsp; <strong>Codex CLI</strong></td>
    <td align="center">Native</td>
    <td align="center">Native</td>
    <td><code>Stop</code></td>
    <td><code>PermissionRequest</code></td>
  </tr>
  <tr>
    <td><img src="assets/icons/cursor.png" width="18" />&nbsp; <strong>Cursor</strong></td>
    <td align="center">Native</td>
    <td align="center">--</td>
    <td><code>stop</code></td>
    <td>--</td>
  </tr>
  <tr>
    <td><img src="assets/icons/gemini.png" width="18" />&nbsp; <strong>Gemini CLI</strong></td>
    <td align="center">--</td>
    <td align="center">Native</td>
    <td><code>AfterAgent</code></td>
    <td><code>Notification</code></td>
  </tr>
  <tr>
    <td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<strong>Antigravity CLI</strong></td>
    <td align="center">--</td>
    <td align="center">Native</td>
    <td><code>Stop</code></td>
    <td>--</td>
  </tr>
</table>

All five tools are wired automatically by the setup wizard. No manual config editing needed. For Claude Code, Codex and Gemini CLI setup also adds a small timing hook (`UserPromptSubmit` for Claude Code and Codex CLI, `BeforeAgent` for Gemini CLI) that only records when a turn started, see [Turn length](#turn-length-and-the-minimum-duration-filter). Codex's `PermissionRequest` hook fires the same "needs your input" alert when Codex asks for approval to run a command -- verified with Codex CLI >=0.144.0.

On Windows, every tool's anotifier hooks deliver their desktop alert through the bundled Donetoast card: Claude Code, Codex, Gemini CLI, Cursor and Antigravity alike, each with its own icon in the card header. The card remains visible until dismissed; its `知道了` button closes it. Phone notifications and other enabled channels continue through anotifier as before. The notifications that do not come from a hook are cards too: the usage-limit and context-window warnings (amber cards) and the notice that a new anotifier version is out (a blue card). A Claude Code notice that nothing is waiting on, such as a background agent finishing, is a blue informational card as well, not an amber request for input. Set `toast.cards: false` in `~/.anotifier/config.json` to put everything back on BurntToast, which is also the backend that supports click-to-focus.

**Antigravity CLI** (Google's successor to Gemini CLI for Google AI Pro/Ultra and free Code Assist users) reads hooks from its own file, `~/.gemini/config/hooks.json`. Setup wires it when `~/.gemini/antigravity-cli` exists, adding one group named `anotifier` with a `Stop` handler and leaving your other groups alone; `anotifier uninstall` removes only that group. Google's docs say the Antigravity 2.0 app and Antigravity IDE read the same global `~/.gemini/config/hooks.json`, so a handler setup wrote should fire there too, but setup only wires Antigravity when `~/.gemini/antigravity-cli` exists and neither app has been tested. The `Stop` handler answers `{"decision":"stop"}` so it can never keep the agent running. The notification is the generic "Task complete" line, and a `Stop` caused by an error or a cancel says "Task complete" too: anotifier does not read `terminationReason` (its values are not fully documented) or `fullyIdle`, so every `Stop` alerts. Antigravity has no notification or permission event (its events are `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation` and `Stop`), so there is no "needs input" alert for it. What is verified: hook wiring and payload parsing are unit-tested against the format in [Google's hooks docs](https://antigravity.google/docs/hooks). What is not: there is no live Antigravity CLI lane in CI yet, so it has not been exercised against a real Antigravity CLI run.

### VS Code Native Support

Claude Code, Codex, and Cursor all run inside VS Code. **anotifier** hooks directly into each tool's native hook system -- no VS Code extension required. The setup wizard detects installed tools and patches their configs automatically. With native toasts on Windows (`toast.cards: false`), clicking one jumps straight back to your VS Code window (Cursor alerts are the exception: anotifier doesn't read a project folder from Cursor's event); a Donetoast card, the default, can only be dismissed.

## Installation

This fork is used from a clone, through `npm link`; see [Quick Start](#quick-start). To update, `git pull` in the clone. To stop using it, run `anotifier uninstall` and then `npm unlink -g anotifier`.

## CLI Commands

```
anotifier setup            # First-time setup wizard
anotifier status           # Show wired tools, config, backends
anotifier test [channel]   # Fire test notification (toast | ntfy | webhook | bell | both)
anotifier config [section] # Interactive settings (ntfy | webhook | sounds | events | focus)
anotifier doctor [--deep]  # Diagnose delivery per channel (--deep verifies real delivery)
anotifier snooze [dur]     # Silence every channel for a while (30m | 2h | 90s | 45 = 45 minutes)
anotifier snooze off       # Cancel the snooze early
anotifier uninstall        # Remove hooks from all tools
```

`anotifier snooze` with no argument prints the current state (`Snoozed until 14:32` or `Not snoozed`); `anotifier status` shows the same thing. A snooze silences **every** channel -- toast, ntfy, webhook and the terminal bell -- until it expires on its own, and it survives across sessions because the deadline is stored in `~/.anotifier/.snooze.json`.

## Configuration

Config lives at `~/.anotifier/config.json`. Abbreviated — see [config/default-config.json](config/default-config.json) for every key and default:

```json
{
  "ntfy": {
    "enabled": true,
    "server": "https://ntfy.sh",
    "topic": "anotifier-<random>",
    "click": ""
  },
  "toast": {
    "enabled": true,
    "cards": true,
    "clickToFocus": true
  },
  "terminalBell": {
    "enabled": true
  },
  "webhook": {
    "enabled": false,
    "url": "",
    "format": "generic"
  },
  "updateCheck": {
    "enabled": false
  },
  "usageAlerts": {
    "enabled": true,
    "thresholds": [70, 85, 95]
  },
  "contextAlerts": {
    "enabled": true,
    "threshold": 85
  },
  "quietHours": {
    "enabled": false,
    "from": "22:00",
    "to": "08:00"
  },
  "events": {
    "task_complete": { "toastSound": "IM", "priority": "default", "minDurationSeconds": 0 },
    "needs_input": { "toastSound": "Reminder", "priority": "urgent" },
    "session_start": {
      "toastSound": "Default",
      "priority": "low",
      "toastEnabled": false,
      "ntfyEnabled": false,
      "terminalBellEnabled": false,
      "webhookEnabled": false
    }
  }
}
```

`ntfy.click` is the URL opened when you tap a phone notification (empty = no link). `ntfy.fallbackServer` (optional, 1.7.0 and later) is a second ntfy server for the same topic: when `ntfy.server` fails (unreachable, a timeout, or an error such as a 429 daily limit), the same push is sent there once instead. For example, run your own server as `server` and keep `https://ntfy.sh` as the fallback, then subscribe your phone to the topic on both. With a fallback set, each attempt waits at most 3 s instead of 5 s, so both fit in the hook's time budget. If the main server accepts a push but answers too slowly, the fallback sends it too and a phone subscribed on both servers buzzes twice; a missed push is the worse failure. `anotifier test ntfy` says when only the fallback delivered. `terminalBell` rings the terminal that launched the agent -- for Claude Code (>=2.1.141) it rings through Claude Code's own terminal write path (hook JSON `terminalSequence`), which is safe in tmux, GNU screen, and on Windows per Claude Code's docs; other agents get a direct TTY/console bell. `webhook` posts to Slack, Discord, Telegram, or any URL (see below). `updateCheck` is off by default, and while it is off anotifier never contacts the npm registry: not from a hook, and not from `anotifier status`, `--version` or any other command. Set `enabled` to `true` to be told about a newly published anotifier -- through whichever of your toast / ntfy / webhook channels are already on (never the terminal bell), and as a line under the CLI's output. It then asks the registry at most once per day, tells you at most once per version, and stays silent on any error. `usageAlerts` warns before a Claude Code usage limit (see [Usage-limit warnings](#usage-limit-warnings-claude-code)): `enabled` turns it off, `thresholds` are the percentages (1-100) that trigger a warning. `contextAlerts` warns once per chat before Claude Code auto-compacts it (see [Context warnings](#context-warnings-claude-code)): `enabled` turns it off, `threshold` is the percentage (1-100) of the auto-compact window that triggers it. `quietHours` is a recurring nightly version of `snooze` (see [Quiet hours](#quiet-hours)). `toast.cards` (Windows only, default `true`) makes every desktop notification a Donetoast card; `false` uses native toasts through BurntToast instead, and is ignored on macOS, Linux and WSL. `toast.clickToFocus` applies to native toasts only: with cards on it does nothing on Windows, because a card can only be dismissed. Per-event `toastSound` is a sound name or the path of your own audio file (see [Custom sound files](#custom-sound-files)). A name is a Windows notification sound (`Default`, `IM`, `Mail`, `Reminder`, `SMS`, `Alarm`), played by [BurntToast](https://github.com/Windos/BurntToast) for a native toast and by the card itself for a Donetoast card, which looks up the file Windows has assigned to that name; a card plays it once, even a looping one like `Alarm`, because it stays on screen until it is clicked, and falls back to its own chime when the name is unknown; on macOS it is mapped to the closest built-in system sound (Windows names like `IM`/`Reminder` are translated, and `Default` or unrecognized names fall back to the system default), while on Linux a name is ignored; `priority` (`min` / `low` / `default` / `high` / `urgent`) drives both the ntfy push priority and the Linux `notify-send` urgency.

### Quiet hours

Off by default. Set `quietHours.enabled` to `true` and every channel goes silent inside the window, every day:

```json
{
  "quietHours": {
    "enabled": true,
    "from": "22:00",
    "to": "08:00"
  }
}
```

- Times are `"HH:MM"` on a 24-hour clock, in your machine's **local** time.
- The start is inclusive and the end is exclusive: `22:00` is silenced, `08:00` is not.
- Windows may span midnight. `22:00` -> `08:00` covers 22:00-23:59 **and** 00:00-07:59. A same-day window like `08:00` -> `22:00` works the same way.
- `from` equal to `to` is a zero-length window and turns the feature **off**, rather than silencing you for a full 24 hours.
- A time that isn't a valid `HH:MM` disables the whole block instead of falling back to the default window -- a typo should never silence you -- and the problem is reported by `anotifier status`.

`anotifier status` shows the window and whether you are currently inside it.

**How quiet hours and `snooze` interact:** they are independent, and either one alone silences the run -- there is no per-channel scoping, it is all channels or none. A silenced run is silenced completely: no toast, no ntfy push, no webhook POST, no terminal bell, and no update notice either. What does *not* change is the hook contract -- the hook still exits successfully and still returns the response its agent expects, so silencing notifications can never stall or break Claude Code, Codex, Cursor, Gemini CLI or Antigravity CLI. The daily update check simply runs on the next un-silenced run.

### ntfy -- Phone Push Notifications

[ntfy](https://ntfy.sh) sends free push notifications to your phone -- no account needed.

1. Install the ntfy app ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iOS](https://apps.apple.com/app/ntfy/id1625396347))
2. Subscribe to your topic (shown during setup)
3. All your AI tools' notifications appear in one stream

### Webhook -- Slack, Discord, Telegram, or anything

Set `webhook.enabled: true` and a `webhook.url` to POST a notification to any HTTP endpoint. `format` selects the payload shape:

**Slack**:
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://hooks.slack.com/services/...",
    "format": "slack"
  }
}
```

**Discord**:
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://discord.com/api/webhooks/...",
    "format": "discord"
  }
}
```

**Telegram:**
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://api.telegram.org/bot<token>/sendMessage",
    "format": "telegram",
    "chatId": "123456789"
  }
}
```

**Generic (anything else):**
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://example.com/hook",
    "format": "generic",
    "authorization": "Bearer <token>"
  }
}
```
Generic POSTs `{title, message, source, project, event, timestamp}` as JSON. `authorization`, if set, is sent as the `Authorization` header for any format, not just generic.

Webhook failures are logged with the URL's origin only, never the full URL -- a Slack/Discord webhook URL or a Telegram bot token is a secret, and errors.log is a plain file on disk.

Test it with `anotifier test webhook`, or turn it off for one event type with `"events": {"task_complete": {"webhookEnabled": false}}`.

### Rich notification content

For Claude Code, toast and webhook notifications show what actually happened instead of a generic "task complete" line: a "needs input" notification carries Claude's own question, and a "task complete" notification carries the last assistant message, both read from the Claude Code transcript and trimmed to a short snippet. Session-start notifications stay generic (nothing to show yet). Other agents (Codex, Cursor, Gemini, Antigravity) always get the generic text -- transcript reading is Claude Code-only.

Controlled per channel:

| Channel | Config key | Default |
|---------|-----------|:-------:|
| Toast | `toast.richContent` | `true` |
| Webhook | `webhook.richContent` | `true` |
| ntfy | `ntfy.richContent` | `false` |

`ntfy.richContent` defaults to **false** for privacy: the default `ntfy.sh` server is public, ntfy topic names are guessable rather than access-controlled secrets, and a snippet of your conversation would leak to anyone who guesses or stumbles on your topic. Only enable `ntfy.richContent` if you run your own private ntfy server, or you've deliberately accepted that risk on the public one.

### Usage-limit warnings (Claude Code)

Get a heads-up before Claude Code stops you at a usage limit. anotifier watches your subscription's **5-hour** and **weekly** usage and sends one notification as each window crosses **70%, 85% and 95%**. The title names the window and the percentage (for example `Claude Code · 5-hour limit at 72%`), and the body names the chat that saw it, the threshold crossed, and when the window resets. Priority rises with the level: `default` at 70%, `high` at 85%, `urgent` at 95%. A window that jumps from 60% straight to 96% sends the 95% warning only, not three in a row.

- **Account-wide, once.** Usage limits belong to your account, not to a chat. However many Claude Code chats you have open, each threshold warns **once per window** across all of them (the first chat to see it sends it and the others stay quiet), and the warning names the chat that saw it. When a window resets, its warnings start over.
- **Claude.ai Pro/Max only.** Claude Code reports usage (`rate_limits`) only to Claude.ai Pro and Max subscribers. With API-key or other billing it sends nothing, so there is nothing to warn about and no warning is ever sent.
- **Channels.** Warnings go to your toast, ntfy and webhook channels, whichever are on. They never ring the terminal bell. Snooze and quiet hours hold them back (see below).
- **How it gets the numbers.** Claude Code only hands usage to your *statusline* command, never to hooks. `anotifier setup` therefore points the Claude Code `statusLine` at `src/statusline.mjs`. If you already had a statusline, it is **wrapped**: your command still runs with the same input and its output is still what you see, and the original is stored (base64) in the new command. With no statusline of your own, a short `Opus · 5h 42% · 7d 12%` line (the model name first) is shown. `anotifier uninstall` puts your original `statusLine` back exactly, or removes it if setup created it. A `statusLine` that is not a `command` is left alone. `anotifier status` shows whether the statusline is wired.
- **Plugin install, or setup not run?** Wire it by hand in `~/.claude/settings.json`, pointing at `src/statusline.mjs` inside the installed package (`npm root -g` shows the global location):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/path/to/anotifier/src/statusline.mjs\""
  }
}
```

To keep a statusline you already have, append `--wrap-b64` and the base64 of your existing command (for example `printf '%s' '~/my-line.sh' | base64`):
`node "/path/to/anotifier/src/statusline.mjs" --wrap-b64 <base64>`. A hand-wired command is only recognized by `status` and `uninstall` when the path contains `anotifier`.

Configure it in `~/.anotifier/config.json`; this is the default:

```json
{
  "usageAlerts": {
    "enabled": true,
    "thresholds": [70, 85, 95]
  }
}
```

`thresholds` is a list of percentages above 0 and at most 100 (an invalid list is reported and the default applies). Set `"enabled": false` to turn the warnings off. The statusline keeps working, it just stops checking usage.

**Snooze and quiet hours.** While you are snoozed or inside quiet hours, no warning is sent *and* none is recorded, so a threshold you crossed in that time is announced once it ends, provided your usage is still over it and a Claude Code statusline refresh happens after that.

### Context warnings (Claude Code)

Get a heads-up before Claude Code auto-compacts a long chat. anotifier sends **one** notification per chat when its context passes **85%** of the auto-compact window, so you can wrap up or run `/compact` on your own terms instead of having it happen mid-task. The title carries the percentage (`Claude Code · context at 87%`) and the body names the chat and the size: `my-app [3f9a1c2e] is at 87% of its auto-compact window (174K of 200K tokens). It will compact soon — wrap up or /compact now.` Priority is `high`.

- **Once per session.** Each chat (Claude Code `session_id`) warns once and never again, even after `/compact` brings its context back down. `/clear` starts a new session, so a later chat in the same terminal can warn again. The warned sessions are remembered in `~/.anotifier/.context-alerts.json`, written before the notification is sent; entries older than 14 days are trimmed when the next warning is recorded.
- **Which window.** Claude Code compacts before the model's full window is used, so anotifier measures against the *auto-compact* window, resolved in this order: the payload's `auto_compact_window` (undocumented and speculative: used only if a future Claude Code reports it), then the `CLAUDE_CODE_AUTO_COMPACT_WINDOW` environment variable (read like `parseInt`, so `500k` reads as 500; clamped to 100,000-1,000,000, and it overrides the settings), then the `autoCompactWindow` setting that `/autocompact <n>` writes (clamped the same way), then the model's own window. The setting is read from the first of these files that has one: `<project>/.claude/settings.local.json`, `<project>/.claude/settings.json`, then `settings.json` in `$CLAUDE_CONFIG_DIR` (default `~/.claude`). In each file the per-model value (`modelSettings.<model id>.autoCompactWindow`, written by Claude Code 2.1.288 and later) wins over the top-level `autoCompactWindow` (older versions); a per-model `"auto"` means the model's own window. The result never exceeds the model's window; a chat already past it just shows 100%. Claude Code's `used_percentage` is not used: it is measured against the full model window.
- **Blind spots.** The `--autocompact` command-line flag and managed (enterprise) settings are invisible to a statusline, so with either in play the warning can come late or not at all.
- **Skipped when auto-compact is off.** If `DISABLE_AUTO_COMPACT` or `DISABLE_COMPACT` is set, or `autoCompactEnabled` is `false` in the first settings file above that defines it, nothing will compact and no warning is sent.
- **No subscription needed.** Unlike usage-limit warnings, this works with API-key and proxy sessions too, since the context numbers come with every statusline refresh. It uses the same statusline wiring as the usage warnings (see above), so `anotifier setup` covers both.
- **Channels, snooze and quiet hours** work exactly as for usage warnings: toast, ntfy and webhook, never the terminal bell, and while snoozed or in quiet hours nothing is sent and nothing is recorded.

```json
{
  "contextAlerts": {
    "enabled": true,
    "threshold": 85
  }
}
```

`threshold` is a percentage above 0 and at most 100 (an invalid value is reported and 85 applies). Set `"enabled": false` to turn the context warning off; usage-limit warnings are unaffected, and so is the statusline. `anotifier status` shows whether it is on and the threshold.

### Per-Event Settings

| Event | Default `toastSound` | Default `priority` | Description |
|-------|:------------:|:-------------:|-------------|
| `task_complete` | IM | default | Agent finished its task |
| `needs_input` | Reminder | urgent | Agent needs your input or permission |
| `session_start` | Default | low | New session started (all channels off by default, webhook included) |

**Only Claude notifications that wait on you are urgent.** Claude Code's `Notification` hook fires for many kinds of notification and names each one in its `notification_type` field. anotifier reads that field and alerts as follows:

| Claude `notification_type` | What you get |
|---|---|
| `permission_prompt` | "Needs your permission" at the `needs_input` priority (urgent by default) |
| `elicitation_dialog`, `elicitation_url_dialog`, `agent_needs_input` | "Needs your input" at the `needs_input` priority |
| `quota_auto_resume_stale` | "Needs you to resume" at the `needs_input` priority (Claude Code is waiting for Enter after a usage-limit reset) |
| `idle_prompt` | "Needs your input" at the idle-reminder level, `default` unless you set `idleReminderPriority` (see below) |
| `agent_completed`, `quota_auto_resume_fired`, `quota_auto_resume_disabled` | A short notice at `default` priority with an info tag. It is never urgent. These use a fixed normal priority, tags and sound and do not inherit `events.needs_input` overrides. |
| `auth_success`, `elicitation_response`, `elicitation_complete` | No alert, because each one follows something you just did at the keyboard |
| Any other value | "Needs your attention" at the `needs_input` priority (urgent by default), so a type added in a future Claude Code release can never go quiet while Claude waits on you |
| No `notification_type` (older Claude Code) | Same as before: urgent "Needs your input", with the idle-reminder wording check below |

**Claude's idle reminder is quieter than a real prompt.** About a minute after a turn ends, Claude Code sends a second notification along the lines of *"Claude is waiting for your input"* (`idle_prompt`). Nothing is blocked -- the work is done -- so anotifier delivers that one at `default` priority with a calm tag instead of the urgent `needs_input` treatment. A genuine permission prompt is untouched and still arrives urgent. The reminder is never suppressed, only turned down. On older Claude Code that sends no `notification_type`, the reminder is recognized by its wording, and if Claude ever changes that wording the reminder simply goes back to being urgent -- it can never go silent. To pick your own level for it, set `idleReminderPriority` on the event:

```json
{
  "events": {
    "needs_input": { "idleReminderPriority": "low" }
  }
}
```

It takes the same `min` / `low` / `default` / `high` / `urgent` scale as `priority`, and applies only to the idle reminder.

#### Custom sound files

`toastSound` can also be the path of your own audio file, per event:

```json
{ "events": { "task_complete": { "toastSound": "~/sounds/done.wav" }, "needs_input": { "toastSound": "C:\Sounds\ask.mp3" } } }
```

A value is read as a file, not a name, when it starts with `~/`, is an absolute path, contains a `/` or `\`, or ends in `.wav`, `.mp3`, `.aiff`, `.aif`, `.m4a`, `.aac`, `.ogg`, `.oga`, `.opus` or `.flac`. `~` is your home folder, and a relative path is relative to `~/.anotifier`. A path containing a double quote is not used. The sound names above never match, so existing configs keep working.

When the file exists, it plays instead of the toast's own sound and the toast is silent, so you hear one sound. It plays in the background: the hook does not wait for it to finish.

- Windows: `.wav` plays through the Windows sound player; other formats go through Windows Media (`.mp3`, `.m4a`, `.aac` and `.flac` normally work; `.ogg`, `.oga` and `.opus` need a codec Windows may not have). Any clip is cut off after 30 seconds. On macOS and Linux a long file plays to the end.
- macOS: `afplay`, so any format macOS plays (not `.ogg`, `.oga` or `.opus`).
- Linux: the first of `pw-play`, `paplay` and `aplay` that starts (`aplay` is used for `.wav` only). Linux toasts have no sound otherwise, so this is the only case where Linux plays one.
- WSL: Windows plays it, like the toast, and the toast is silenced when the alert starts, before the player has launched. A Linux path or a `/mnt/c/...` path works; write `/mnt/c/Sounds/ask.mp3`, not `C:\Sounds\ask.mp3`, because a `C:\...` value is not a path Linux can open.

If the file is missing or unreadable, anotifier does not try to play it. The toast then keeps the default sound on Windows and macOS (Linux has none), and one line goes to `~/.anotifier/errors.log`. The same line is written when no player can be started. On WSL the toast is already silent by then, so a failed player leaves that alert without a sound. The log never contains the path. A file that exists but cannot be decoded only fails inside the player: on Windows a short system sound plays instead; on macOS and Linux nothing plays.

`anotifier doctor` warns about a missing file, `anotifier config sounds` checks that a file exists when you type its path, and `anotifier test toast` plays the first one configured.

### Turn length and the minimum duration filter

A "task complete" notification says how long the turn took when anotifier knows it, for example `app: Task complete (took 4m 12s)`. With Claude Code's rich content on, the assistant's own words are shown and the same `(took ...)` is appended to them. The notification title is never changed. When the length is not known, the message is exactly what it was before this existed.

`events.task_complete.minDurationSeconds` (default `0`, off) skips the "task complete" alert for a turn shorter than that many seconds, on every channel:

```json
{
  "events": {
    "task_complete": { "minDurationSeconds": 30 }
  }
}
```

- Only completions are ever filtered. Permission prompts, questions and every other `needs_input` notification are always sent, and the key is rejected (and reported by `anotifier status`) anywhere except `events.task_complete`.
- A turn of exactly the threshold is sent; only shorter turns are skipped.
- A turn whose length is unknown is never skipped.
- A turn's clock starts at its first prompt; a prompt sent while the turn is still open does not restart it. Claude Code sends no `Stop` for a turn you interrupt with Esc, so the next prompt in that session counts from the interrupted turn's start and its length can read longer than it was. That only ever errs toward sending the alert.
- Set it with `anotifier config events`, or by editing `~/.anotifier/config.json`. `anotifier status` shows the current value as `Min duration`.

How a turn is measured depends on what each tool's hooks offer. The start time is recorded by a second, tiny hook that runs when you submit a prompt, writes `~/.anotifier/turns.json` (atomically, under a lock) and prints only `{}`. It never blocks the agent: it has a 5-second timeout, ignores every error, and a start that could not be saved just means that turn has no length (a lock that cannot be taken is logged to `errors.log`, which `anotifier status` shows). A prompt sent while a turn is still running does not restart its clock. `anotifier uninstall` removes the hook and deletes `turns.json`.

| Tool | Start | End | Length shown and filter applied |
|------|-------|-----|:---:|
| Claude Code | `UserPromptSubmit` | `Stop` | Yes |
| Codex CLI | `UserPromptSubmit` | `Stop` (paired by `turn_id`) | Yes |
| Gemini CLI | `BeforeAgent` | `AfterAgent` | Yes |
| Cursor | none used | `stop` | No |
| Antigravity CLI | none used | `Stop` | No |

Cursor's `beforeSubmitPrompt` hook can block a prompt unless it answers correctly, and its docs do not promise that it and `stop` share an id, so Cursor is left untimed rather than guessed. Antigravity has no event documented as once per user turn. Neither is ever filtered and neither shows a length. Setup must be re-run once after upgrading (`npx anotifier setup`) to add the timing hook to the tools that use it; until then nothing is timed and nothing is filtered. A Stop that fires while Claude Code still has background work running is held back as before and does not end the turn.

### Per-project overrides

A `projects` list in `~/.anotifier/config.json` changes settings for the workspaces you name. Each rule has a `match` and the settings it overrides:

```json
{
  "projects": [
    {
      "match": "~/work/acme",
      "ntfy": { "topic": "acme-alerts" },
      "webhook": { "enabled": true, "url": "https://example.com/acme-hook" },
      "events": { "task_complete": { "toastSound": "Alarm", "minDurationSeconds": 60 } },
      "quietHours": { "enabled": true, "from": "18:00", "to": "09:00" }
    }
  ]
}
```

A hook run whose working folder is `~/work/acme`, or anything inside it, uses those settings on top of your top-level ones. Every other folder is exactly as before.

- **Where rules live.** Only in your own `~/.anotifier/config.json`. There is deliberately no per-repo file (such as `.anotifier.json` in a project): a repository you clone could otherwise point your alerts, with your prompt and the message text, at its own webhook or ntfy topic.
- **`match`.** An absolute path (`/home/me/acme`, `C:/work/acme`) or one starting with `~/` (your home folder). A rule matches that folder and everything inside it, so a hook running in `~/work/acme/src` matches too, while `~/work/acme-two` does not. `*` stands for any text within one folder name and `**` for any number of folders: `~/work/*/app`, `~/clients/**`. Paths are compared without regard to case on Windows and macOS. A relative `match` (`.`, `src/app`) is rejected, because it would have nothing to anchor to.
- **What a rule can override.** `ntfy`, `toast`, `terminalBell`, `webhook`, `quietHours`, `events` (sound, priority, tags, which channels, `minDurationSeconds`) and `sources`. `updateCheck`, `usageAlerts` and `projects` are machine-wide and are rejected inside a rule (reported by `anotifier status`, and left out of the rule). `contextAlerts` (`enabled`, `threshold`) is accepted and applies to the context warning of a session whose folder matches.
- **How rules combine.** Your defaults, then your top-level config, then every matching rule in the order it appears in the list, so a later rule wins. Objects merge key by key; a list or a single value is replaced. A rule only needs the keys it changes.
- **Telegram.** A rule that sets `"webhook": { "format": "telegram" }` takes `chatId` from your top-level `webhook` when it has one. If the top level has no `chatId`, put it in the same rule as `format`; otherwise `anotifier status` reports it as missing.
- **Where the folder comes from.** The `cwd` the agent sends with the hook; for Cursor and Antigravity CLI, which can omit it, the first workspace folder. With no folder in the hook input, no rule applies.
- **What it covers.** The notifications your agents send through hooks: task complete, needs input and session start, including quiet hours and the minimum duration filter. Snooze is not per project: `anotifier snooze` still silences everything.
- **The statusline warnings.** The usage-limit and context warnings come from Claude Code's statusline, not a hook, so the folder is read from its input: `workspace.current_dir`, then `workspace.project_dir`, then `cwd` ([Claude Code statusline fields](https://code.claude.com/docs/en/statusline)). A matching rule changes the context warning for that session only (`contextAlerts.enabled` and `contextAlerts.threshold`) and how both warnings are delivered: `toast`, `ntfy`, `webhook` and `quietHours`. The usage-limit warning belongs to your account, not to a folder, and is recorded once for all your chats, so its thresholds, its on/off switch and its state stay global (`usageAlerts` is not allowed in a rule). What a rule changes is only where that one warning goes: it is sent by whichever chat sees the limit first, so it uses that chat's folder's rule. Quiet hours from a rule keep a chat in that folder from sending (or recording) a warning, so another chat or a later refresh still announces it. The same goes for a rule that turns every channel off (`toast`, `ntfy` and `webhook`): a chat in that folder leaves the usage warning to your other chats. The folder is the one the session is in when the statusline refreshes, so it follows a `cd` or a worktree switch. Remote approvals read your top-level settings only.
- **The CLI.** `anotifier status`, `doctor` and `config` work on your top-level settings. A rule's overrides are never applied there.

### Error visibility

Hook and channel errors never interrupt your agent -- they're appended to `~/.anotifier/errors.log` and surfaced by `anotifier status`, so a misconfigured toast backend or unreachable ntfy topic shows up as a logged error instead of a silent no-op. Nothing is reported anywhere else: the log is a file on your disk.

## How It Works

Each AI tool's hook system pipes event data to `notify.mjs`:

```
Hook fires (stdin JSON + --source flag)
  -> parse-input.mjs   (normalize across tools)
  -> turn-timer.mjs    (task_complete: how long was the turn, skip short ones)
  -> router.mjs        (map event to notification type)
  -> transcript.mjs    (Claude Code only: derive rich message text)
  -> platform toast    (Windows / macOS / Linux / WSL)
  -> ntfy push         (phone notification)
  -> webhook POST      (Slack / Discord / Telegram / generic)
  -> terminal bell     (Claude Code: terminalSequence in the hook reply;
                        other tools: BEL to the controlling terminal)
```

## Platform Details

### Windows

- Every desktop notification is a bundled [Donetoast](https://github.com/siiplasplas/donetoast) card (vendored under `assets/windows/donetoast/`). It runs on the Windows PowerShell 5.1 and WPF that ship with Windows, so `setup` installs nothing
- `toast.cards: false` switches to native toasts instead. That path uses the [BurntToast](https://github.com/Windos/BurntToast) PowerShell module and requires PowerShell 7+ (pwsh); with the setting off, `setup` installs BurntToast and `anotifier doctor` checks for both
- Native toasts only: click-to-focus via custom `agentfocus://` URI protocol (registered under HKCU on the first toast; `anotifier uninstall` removes it)

### macOS

- Uses built-in `osascript` -- zero additional dependencies

### Linux

- Uses `notify-send` (libnotify) -- available on most desktop distributions
- If `setup` cannot find `notify-send` it turns the toast channel off (`toast.enabled: false`, with `toast.disabledBySetup: true`) and tells you what to install; `status` and `doctor` then show "toast: off, no backend". Install it and re-run `anotifier setup` to turn toasts back on. The same applies on Windows without PowerShell 7 / BurntToast and on WSL without reachable Windows PowerShell. Toasts you turned off yourself are never turned back on.
- On headless systems without a GUI the toast fails and is logged to `~/.anotifier/errors.log`; the other channels still deliver (see WSL below for WSL2)

### WSL

- Auto-detected -- no config needed
- Toast notifications are routed to Windows via PowerShell interop (`powershell.exe`/`pwsh.exe` across the `/mnt/c` boundary) instead of `notify-send`/D-Bus, so no Linux notification daemon is needed
- Needs WSL2 interop enabled and a Windows PowerShell present -- both are on by default
- `anotifier setup`, `status` and `doctor` report WSL as its own platform and check the interop path (`wslpath` plus a reachable PowerShell); a toast that fails is recorded in the hook error log that `anotifier status` shows
- Terminal bell and ntfy behave exactly as on native Linux
- **Proof boundary:** WSL detection and the interop invocation are unit-tested (`tests/platforms-wsl.test.mjs`), but — unlike the native Linux/macOS/Windows toast lanes — no hosted CI runner proves a toast reaches the Windows host end to end, so this path is not claimed in the Testing table below

## Requirements

| Requirement | Details |
|-------------|---------|
| **Node.js** | >= 18.0.0 (already present for all supported AI tools) |
| **Windows** | Nothing extra: cards and the terminal bell run on the built-in Windows PowerShell 5.1. PowerShell 7+ is needed only for native toasts (`toast.cards: false`) and for a custom sound file that is not a `.wav` |
| **macOS** | osascript (built-in) |
| **Linux** | notify-send (optional, for desktop toasts) |

## Uninstall

```bash
anotifier uninstall
```

Removes all managed hooks from every tool's config. Original configs are backed up at `~/.anotifier/backups/`.

## Testing

```bash
npm test            # offline: the full unit + integration suite
npm run test:e2e    # real subprocesses and a real ntfy.sh round-trip, needs network
npm run toast:demo  # fire real desktop notifications, every event
```

`npm test` runs offline and covers every platform's backend through injected process spawners; the PowerShell scripts are also parsed for syntax errors when PowerShell 7 is available. `npm run test:e2e` runs the real `setup`, `uninstall` and hook subprocesses against a throwaway home directory.

The Windows card is drawn by its own WPF window, not by the Windows notification platform, so no automated check reads it back from a system store. What the tests cover is the command anotifier spawns and the card scripts' behaviour; whether a card appeared on screen is checked by eye with `npm run toast:demo` or `anotifier test toast`.

The GitHub workflows in `.github/workflows/` come from upstream. Several need upstream's secrets or its hosted agents and do not pass in this fork; `Unit` and `E2E` are the ones that describe this repository.

## Upstream

anotifier is written and maintained by [DevinoSolutions](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor). This fork takes the code and nothing else: it has no sponsorship link, no community channel, no support contact and no documentation site of its own, and the CLI prints none.

The Windows card is [donetoast](https://github.com/siiplasplas/donetoast) by siiplasplas, MIT; what was changed in the vendored copy is recorded in `assets/windows/donetoast/README.md`.

## Changelog

Release history is in [CHANGELOG.md](CHANGELOG.md).

## License

[AGPL-3.0](LICENSE) -- Copyright (c) 2026 [DevinoSolutions](https://github.com/DevinoSolutions)
