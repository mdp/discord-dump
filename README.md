# @mdp/discord-dump

[![CI](https://github.com/mdp/discord-dump/actions/workflows/ci.yml/badge.svg)](https://github.com/mdp/discord-dump/actions/workflows/ci.yml)

Minimal CLI to explore accessible Discord servers and export channel messages as JSON or markdown.

## Usage

```bash
DISCORD_TOKEN=<token> npx @mdp/discord-dump list-guilds
DISCORD_TOKEN=<token> npx @mdp/discord-dump list-channels <guildId>
DISCORD_TOKEN=<token> npx @mdp/discord-dump get-channel <channelId>
DISCORD_TOKEN=<token> npx @mdp/discord-dump dump-channel [--text] <channelId> [limit] [output]
DISCORD_TOKEN=<token> npx @mdp/discord-dump [--text] <channelId> [limit] [output]
```

The final form is kept for backward compatibility and is equivalent to `dump-channel`.

## Commands

| Command | Description |
|---|---|
| `list-guilds` | List guilds visible to the token via `/users/@me/guilds` |
| `list-channels <guildId>` | List visible guild channels via `/guilds/{guildId}/channels` |
| `get-channel <channelId>` | Fetch metadata for one channel via `/channels/{channelId}` |
| `dump-channel <channelId> [limit] [output]` | Export messages from one channel |

`list-channels` returns channel summaries sorted by category, position, and name. The `messageReadable` field is `true` for text-like channel types that can be passed to `dump-channel`; Discord's guild channel endpoint does not include threads.

## Dump arguments

| Argument | Default | Description |
|---|---|---|
| `channelId` | — | Discord channel ID |
| `limit` | `500` | Number of messages to fetch |
| `output` | stdout | File path to write to |

| Flag | Description |
|---|---|
| `--text` | Output markdown instead of JSON for `dump-channel` |

## Examples

```bash
# List servers visible to the token
DISCORD_TOKEN="Bot xxx" npx @mdp/discord-dump list-guilds

# List visible channels in a server
DISCORD_TOKEN="Bot xxx" npx @mdp/discord-dump list-channels YOUR_GUILD_ID

# Inspect one channel
DISCORD_TOKEN="Bot xxx" npx @mdp/discord-dump get-channel YOUR_CHANNEL_ID

# Export one channel as JSON to stdout
DISCORD_TOKEN="Bot xxx" npx @mdp/discord-dump dump-channel YOUR_CHANNEL_ID

# Last 100 messages as markdown, copied to clipboard
DISCORD_TOKEN="Bot xxx" npx @mdp/discord-dump dump-channel --text YOUR_CHANNEL_ID 100 | pbcopy

# Save 500 messages as JSON
DISCORD_TOKEN="Bot xxx" npx @mdp/discord-dump dump-channel YOUR_CHANNEL_ID 500 messages.json

# Save 500 messages as markdown
DISCORD_TOKEN="Bot xxx" npx @mdp/discord-dump dump-channel --text YOUR_CHANNEL_ID 500 messages.md
```

## Token

Set `DISCORD_TOKEN` in your environment. Two formats are supported:

- **Bot token**: `Bot MTk4N...` (the bot must be in the guild; message content requires `MESSAGE_CONTENT` privileged intent in the Developer Portal for non-slash-command content)
- **User token**: raw token string, no prefix

Discord calls are limited to what the token can see. In this tool, "public channels" means channels visible to the provided credential, not channels globally public to Discord.

## Markdown output format

```
**AuthorName** · Jan 15, 2024 10:30 AM UTC
Message content here

**OtherUser** · Jan 15, 2024 10:31 AM UTC
> ↩ **AuthorName**: quoted reply preview…
Reply text
📎 [image.png](https://cdn.discordapp.com/...)
❤️ 3  👍 5
```

## Rate limiting

Respects Discord's advisory rate-limit headers and retries on 429 with exponential backoff (up to 8 attempts). Progress is written to stderr so stdout stays clean for piping.
