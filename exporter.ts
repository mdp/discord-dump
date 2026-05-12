#!/usr/bin/env tsx
/**
 * Discord channel exporter — fetches the last N messages from a channel.
 *
 * Usage:
 *   DISCORD_TOKEN=<token> tsx exporter.ts [--text] <channelId> [limit] [output.json]
 *
 * Flags:
 *   --text   Output markdown-formatted text instead of JSON
 *
 * Examples:
 *   DISCORD_TOKEN=Bot.xxx tsx exporter.ts 1068636749414281270 500
 *   DISCORD_TOKEN=Bot.xxx tsx exporter.ts --text 1068636749414281270 500 | pbcopy
 *   DISCORD_TOKEN=Bot.xxx tsx exporter.ts 1068636749414281270 500 messages.json
 */

import fs from "fs";

const API = "https://discord.com/api/v10";

// ── Types (subset of what Discord returns) ─────────────────────────────────

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator?: string;
  bot?: boolean;
}

interface DiscordAttachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  content_type?: string;
  width?: number;
  height?: number;
}

interface DiscordReaction {
  count: number;
  emoji: { id: string | null; name: string; animated?: boolean };
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  type?: string;
}

interface DiscordMessage {
  id: string;
  type: number;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  author: DiscordUser;
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  reactions?: DiscordReaction[];
  pinned: boolean;
  referenced_message?: DiscordMessage | null;
}

// ── HTTP client with rate-limit handling ───────────────────────────────────

function authHeader(token: string): string {
  return token.startsWith("Bot ") ? token : token;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiGet(
  path: string,
  token: string,
  attempt = 0
): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: authHeader(token),
      "User-Agent": "discord-dump/1.0 (github.com/mdp/discord-dump)",
    },
  });

  // Hard rate limit — back off and retry
  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get("Retry-After") ?? "1");
    const delay = (retryAfter + 1) * 1000;
    console.error(`  [429] rate limited, retrying in ${retryAfter + 1}s…`);
    await sleep(delay);
    if (attempt < 8) return apiGet(path, token, attempt + 1);
    throw new Error("Exceeded max retries on 429");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API ${res.status}: ${body}`);
  }

  // Advisory rate limit: if we've exhausted the bucket, pause before next call
  const remaining = parseInt(res.headers.get("X-RateLimit-Remaining") ?? "1");
  const resetAfter = parseFloat(
    res.headers.get("X-RateLimit-Reset-After") ?? "0"
  );
  if (remaining <= 0 && resetAfter > 0) {
    const delay = Math.min((resetAfter + 1) * 1000, 60_000);
    console.error(`  [ratelimit] bucket empty, waiting ${resetAfter + 1}s…`);
    await sleep(delay);
  }

  return res.json();
}

// ── Pagination ─────────────────────────────────────────────────────────────

async function fetchMessages(
  channelId: string,
  token: string,
  limit: number
): Promise<DiscordMessage[]> {
  const messages: DiscordMessage[] = [];
  let before: string | null = null;

  while (messages.length < limit) {
    const batch = Math.min(100, limit - messages.length);
    const qs = before
      ? `?limit=${batch}&before=${before}`
      : `?limit=${batch}`;

    const page = (await apiGet(
      `/channels/${channelId}/messages${qs}`,
      token
    )) as DiscordMessage[];

    if (page.length === 0) break;

    messages.push(...page);
    before = page[page.length - 1].id; // oldest ID in this page → next cursor

    process.stderr.write(`  fetched ${messages.length}/${limit} messages\r`);

    if (page.length < batch) break; // no more messages
  }

  process.stderr.write("\n");

  // Discord returns newest-first per page; reverse so result is oldest-first
  return messages.reverse();
}

// ── Text/markdown formatter ────────────────────────────────────────────────

function displayName(user: DiscordUser): string {
  return user.global_name ?? user.username;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC",
    timeZoneName: "short",
  });
}

function formatMarkdown(messages: DiscordMessage[]): string {
  return messages.map((msg) => {
    const header = `**${displayName(msg.author)}** · ${formatTimestamp(msg.timestamp)}`;
    const lines: string[] = [header];

    if (msg.referenced_message) {
      const ref = msg.referenced_message;
      const refText = ref.content?.trim()
        ? ref.content.split("\n")[0].slice(0, 80) + (ref.content.length > 80 ? "…" : "")
        : "(no text)";
      lines.push(`> ↩ **${displayName(ref.author)}**: ${refText}`);
    }

    if (msg.content?.trim()) lines.push(msg.content);

    for (const a of msg.attachments) lines.push(`📎 [${a.filename}](${a.url})`);

    for (const e of msg.embeds) {
      if (e.title || e.description) {
        const title = e.url ? `[${e.title ?? "Embed"}](${e.url})` : (e.title ?? "Embed");
        lines.push(`> **${title}**`);
        if (e.description) lines.push(`> ${e.description.split("\n")[0].slice(0, 120)}`);
      }
    }

    if (msg.reactions?.length) {
      const rxn = msg.reactions.map((r) => `${r.emoji.name} ${r.count}`).join("  ");
      lines.push(rxn);
    }

    return lines.join("\n");
  }).join("\n\n");
}

// ── Entry point ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const textMode = args.includes("--text");
const positional = args.filter((a) => !a.startsWith("--"));
const [channelId, limitArg, outputFile] = positional;

if (!channelId) {
  console.error("Usage: DISCORD_TOKEN=<token> tsx exporter.ts [--text] <channelId> [limit] [output.json]");
  process.exit(1);
}

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN env var is required");
  process.exit(1);
}

const limit = parseInt(limitArg ?? "500", 10);

console.error(`Fetching last ${limit} messages from channel ${channelId}…`);

const messages = await fetchMessages(channelId, token, limit);

console.error(`Done — ${messages.length} messages`);

const output = textMode
  ? formatMarkdown(messages)
  : JSON.stringify(messages, null, 2);

if (outputFile) {
  fs.writeFileSync(outputFile, output, "utf8");
  console.error(`Wrote to ${outputFile}`);
} else {
  console.log(output);
}
