# Contributing

This repository is an internal fork of
[DevinoSolutions/anotifier-for-claude-codex-cursor](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor).
Changes to anotifier itself belong upstream; what follows is how to work on
this fork.

## Before You Start

Open an issue first to discuss what you'd like to change. That avoids work on
something that turns out to be out of scope, and it's the fastest way to agree
on an approach.

## Development Setup

Clone the repo. There is nothing to install: the project has no dependencies at
all, production or dev — it runs on Node.js >= 18 built-ins and the test runner
built into Node.

`npm link` in the clone puts the `anotifier` command on your PATH. The commands
for running the suites are in the README's [Testing](README.md#testing)
section.

The hooks `anotifier setup` writes point at the clone itself, so an edit under
`src/` or `assets/` changes your own notifications on the next agent turn. Run
the tests before you rely on a change.

## Before Opening a Pull Request

Run the unit suite — it's offline and fast:

```bash
npm test
```

It must pass. If you changed platform behavior, say which platform you actually
exercised it on.

## The Honesty Rule

Documentation claims must match what the code does, exactly. If a feature is
unit-tested but not proven end to end, the docs say so — see the proof
boundaries called out in the README's Testing section. Please don't add a claim
a reader could check and find overstated, and if you change behavior that the
README describes, update the README in the same PR.

## Reporting Security Issues

Don't open a public issue — see [SECURITY.md](SECURITY.md).
