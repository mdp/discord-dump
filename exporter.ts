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
 *   DISCORD_TOKEN=Bot.xxx tsx exporter.ts YOUR_CHANNEL_ID 500
 *   DISCORD_TOKEN=Bot.xxx tsx exporter.ts --text YOUR_CHANNEL_ID 500 | pbcopy
 *   DISCORD_TOKEN=Bot.xxx tsx exporter.ts YOUR_CHANNEL_ID 500 messages.json
 */

import fs from "fs";
import { type DiscordMessage, formatMarkdown } from "./lib.js";

const API = "https://discord.com/api/v10";

// ── HTTP client with rate-limit handling ───────────────────────────────────

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
      Authorization: token,
      "User-Agent": "discord-dump/1.0 (github.com/mdp/discord-dump)",
    },
  });

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

  const remaining = parseInt(res.headers.get("X-RateLimit-Remaining") ?? "1");
  const resetAfter = parseFloat(res.headers.get("X-RateLimit-Reset-After") ?? "0");
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
    const qs = before ? `?limit=${batch}&before=${before}` : `?limit=${batch}`;

    const page = (await apiGet(
      `/channels/${channelId}/messages${qs}`,
      token
    )) as DiscordMessage[];

    if (page.length === 0) break;

    messages.push(...page);
    before = page[page.length - 1].id;

    process.stderr.write(`  fetched ${messages.length}/${limit} messages\r`);

    if (page.length < batch) break;
  }

  process.stderr.write("\n");

  // Discord returns newest-first per page; reverse so result is oldest-first
  return messages.reverse();
}

// ── Entry point ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const textMode = args.includes("--text");
const positional = args.filter((a) => !a.startsWith("--"));
const [channelId, limitArg, outputFile] = positional;

if (!channelId) {
  console.error("Usage: DISCORD_TOKEN=<token> npx @mdp/discord-dump [--text] <channelId> [limit] [output.json]");
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
