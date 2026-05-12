# discord-dump

Minimal TypeScript CLI to export messages from a Discord channel.

## Usage

```bash
DISCORD_TOKEN=<token> npx tsx exporter.ts [--text] <channelId> [limit] [output]
```

| Argument | Default | Description |
|---|---|---|
| `channelId` | — | Discord channel ID (required) |
| `limit` | `500` | Number of messages to fetch |
| `output` | stdout | File path to write to |

| Flag | Description |
|---|---|
| `--text` | Output markdown instead of JSON |

## Examples

```bash
# JSON to stdout
DISCORD_TOKEN="Bot xxx" npx tsx exporter.ts 1068636749414281270

# Last 100 messages as markdown, copied to clipboard
DISCORD_TOKEN="Bot xxx" npx tsx exporter.ts --text 1068636749414281270 100 | pbcopy

# Save 500 messages as JSON
DISCORD_TOKEN="Bot xxx" npx tsx exporter.ts 1068636749414281270 500 messages.json

# Save 500 messages as markdown
DISCORD_TOKEN="Bot xxx" npx tsx exporter.ts --text 1068636749414281270 500 messages.md
```

## Token

Set `DISCORD_TOKEN` in your environment. Two formats are supported:

- **Bot token**: `Bot MTk4N...` (requires `MESSAGE_CONTENT` privileged intent in the Developer Portal for non-slash-command content)
- **User token**: raw token string, no prefix

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

## Setup

```bash
npm install
```

Requires Node 18+ (uses native `fetch`).

## Rate limiting

Respects Discord's advisory rate-limit headers and retries on 429 with exponential backoff (up to 8 attempts). Progress is written to stderr so stdout stays clean for piping.
