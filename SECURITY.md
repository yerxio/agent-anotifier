# Security

This repository is an internal fork of
[DevinoSolutions/anotifier-for-claude-codex-cursor](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor).
It is used from a clone, is not published, and has no security contact or
disclosure process of its own. A vulnerability in anotifier itself should be
reported to the upstream project.

## What it touches

`anotifier` runs locally, reads `~/.anotifier/config.json`, and sends
notifications to the endpoints you configure (ntfy topics, webhook URLs).
Webhook URLs and bot tokens in your config are secrets: errors are logged with
the URL's origin only, never the full URL.

It makes no other network request unless you turn on the update check
(`updateCheck.enabled`), which asks the npm registry for upstream's latest
version. Upstream's anonymous usage stats and its Sentry error reporting have
been removed from this fork; nothing is reported to any outside service.
