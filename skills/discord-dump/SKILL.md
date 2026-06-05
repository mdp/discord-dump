---
name: discord-dump
description: Use when an agent needs to explore Discord servers/channels or export Discord channel messages with the @mdp/discord-dump CLI through npx, especially for research over accessible Discord content using a user-provided Discord token.
---

# Discord Dump

Use `@mdp/discord-dump` through `npx`. Do not install the executable locally or add it to the project.

## Install/Invocation

The skill can be installed by users with:

```bash
npx skills mdp/discord-dump
```

When using the Discord tool itself, always invoke it through `npx`:

```bash
DISCORD_TOKEN="<token>" npx @mdp/discord-dump <command>
```

## Token Requirement

This tool needs a Discord user token supplied by the user. Do not try to discover, extract, scrape, or infer a token from browser profiles, local storage, files, network traffic, or other machine state.

Ask the user to provide a token only if they are allowed to access the Discord content they want researched. Treat the token as a secret:

- Do not print it back.
- Do not commit it.
- Do not save it to files.
- Prefer passing it as an environment variable for a single command.
- If command output or errors include the token, redact it before sharing.

Suggested user-facing request:

```text
Please provide a Discord user token for an account that can access the server/channel you want researched. I will use it only as DISCORD_TOKEN for the npx command and will not save or print it.
```

If the user asks how to get their user token, provide these instructions (the token is visible in their own browser session — they are not bypassing any controls):

**Extracting your Discord token from Chrome DevTools (Network tab)**

1. Open Discord in Chrome and log in.
2. Open DevTools: `F12` or `Ctrl+Shift+I` (Windows/Linux) / `Cmd+Option+I` (macOS).
3. Go to the **Network** tab.
4. In the filter box, type `api` to show only Discord API requests.
5. Send a message in any channel (or refresh the page). You should see requests to `discord.com/api` appear.
6. Click any of those requests, then in the right panel go to **Headers** → **Request Headers**.
7. Find the `authorization` header. Copy its value — that's your token.

The token is a long alphanumeric string. It should **not** start with `Bot ` (that's a bot token prefix; this tool accepts both).

## Common Workflow

List accessible guilds:

```bash
DISCORD_TOKEN="<token>" npx @mdp/discord-dump list-guilds
```

List visible channels in a guild:

```bash
DISCORD_TOKEN="<token>" npx @mdp/discord-dump list-channels <guildId>
```

Inspect one channel:

```bash
DISCORD_TOKEN="<token>" npx @mdp/discord-dump get-channel <channelId>
```

Export recent channel messages as JSON:

```bash
DISCORD_TOKEN="<token>" npx @mdp/discord-dump dump-channel <channelId> 500
```

Export recent channel messages as Markdown:

```bash
DISCORD_TOKEN="<token>" npx @mdp/discord-dump dump-channel --text <channelId> 500
```

The legacy form also works:

```bash
DISCORD_TOKEN="<token>" npx @mdp/discord-dump --text <channelId> 500
```

## Agent Guidance

- "Public channels" means channels visible to the provided token, not globally public Discord channels.
- Use `list-guilds` first when the guild ID is unknown.
- Use `list-channels` to find candidate channel IDs before dumping content.
- Prefer JSON output for structured analysis and Markdown output for direct reading/summarization.
- Keep message limits modest at first, then request larger exports only when needed.
- Respect Discord rate limits and the tool's stderr progress messages.
- Stop and ask the user for a more capable token if Discord returns authorization or permission errors.
