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

With the defaults of this fork it makes no other network request: the update
check is off, and setup downloads nothing. Two features inherited from upstream
send data to upstream's own services, and both are off unless you turn them on:
anonymous usage stats (`telemetry.enabled`, which interactive `setup` asks
about) and error reporting (`sentry.enabled`).
