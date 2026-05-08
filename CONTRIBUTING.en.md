# Contributing

[简体中文](./CONTRIBUTING.md)

Thanks for helping improve `openobserve-mcp`.

## Good Areas for Contribution

- Add new bounded troubleshooting tools
- Improve the README or AI-facing usage docs
- Strengthen validation, query limits, and masking behavior
- Improve error messages returned to MCP clients
- Add better client configuration examples

## Development Setup

1. Install dependencies

```bash
npm install
```

2. Create a local config file

```bash
cp .env.example .env
```

3. Start in development mode

```bash
npm run dev
```

## Project Structure

- `src/index.js`: MCP server bootstrap
- `src/config.js`: environment loading and runtime limits
- `src/openobserve-client.js`: OpenObserve HTTP wrapper
- `src/tools.js`: MCP tool registration
- `src/sql.js`: SQL helper utilities
- `src/time.js`: time-range utilities
- `src/sanitize.js`: sensitive field masking

## Contribution Guidelines

- Keep tools read-only unless the project direction changes explicitly
- Preserve the current bounded-query design
- Prefer safe defaults over unlimited flexibility
- When adding a tool, make sure an AI client can use it correctly
- If user-facing behavior changes, update the README and AI docs in the same PR

## When Adding a New Tool

1. Define a clear input schema with sensible limits
2. Enforce bounded time windows where relevant
3. Sanitize returned payloads before exposing them to MCP clients
4. Return data in a structure that is easy for AI clients to summarize
5. Update `README.md` and, when needed, `AI_USAGE.md`

## Pull Requests

Small, focused pull requests are easier to review.

A good PR usually explains:

- what problem it solves
- what behavior changed
- whether new environment variables or limits were introduced
- whether docs were updated for user-visible changes

## Helpful Details for Issues

- which MCP client you are using
- your Node.js version
- the tool name involved
- a sanitized error message
- the username you are using

## Release Notes

If a change affects installation, configuration, or tool behavior, please update the relevant docs in the same PR.
