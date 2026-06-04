// Importable types, formatting helpers, and read-only Discord REST functions.

const API = "https://discord.com/api/v10";

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator?: string;
  bot?: boolean;
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  content_type?: string;
  width?: number;
  height?: number;
}

export interface DiscordReaction {
  count: number;
  emoji: { id: string | null; name: string; animated?: boolean };
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  type?: string;
}

export interface DiscordMessage {
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

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
  features?: string[];
  approximate_member_count?: number;
  approximate_presence_count?: number;
}

export interface DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
  topic?: string | null;
  position?: number;
  parent_id?: string | null;
  nsfw?: boolean;
  last_message_id?: string | null;
  rate_limit_per_user?: number;
  permission_overwrites?: unknown[];
}

export interface ChannelSummary {
  id: string;
  name: string;
  type: number;
  typeName: string;
  position: number;
  parentId: string | null;
  parentName: string | null;
  topic: string | null;
  nsfw: boolean;
  lastMessageId: string | null;
  messageReadable: boolean;
}

export interface FetchMessagesOptions {
  onProgress?: (fetched: number, limit: number) => void;
}

const channelTypeNames: Record<number, string> = {
  0: "GUILD_TEXT",
  1: "DM",
  2: "GUILD_VOICE",
  3: "GROUP_DM",
  4: "GUILD_CATEGORY",
  5: "GUILD_ANNOUNCEMENT",
  10: "ANNOUNCEMENT_THREAD",
  11: "PUBLIC_THREAD",
  12: "PRIVATE_THREAD",
  13: "GUILD_STAGE_VOICE",
  14: "GUILD_DIRECTORY",
  15: "GUILD_FORUM",
  16: "GUILD_MEDIA",
};

const messageReadableTypes = new Set([0, 5, 10, 11, 12]);

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function apiGet(
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
    console.error(`  [429] rate limited, retrying in ${retryAfter + 1}s...`);
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
    console.error(`  [ratelimit] bucket empty, waiting ${resetAfter + 1}s...`);
    await sleep(delay);
  }

  return res.json();
}

export async function fetchGuilds(token: string): Promise<DiscordGuild[]> {
  return (await apiGet("/users/@me/guilds", token)) as DiscordGuild[];
}

export async function fetchGuildChannels(
  guildId: string,
  token: string
): Promise<DiscordChannel[]> {
  return (await apiGet(`/guilds/${guildId}/channels`, token)) as DiscordChannel[];
}

export async function fetchChannel(
  channelId: string,
  token: string
): Promise<DiscordChannel> {
  return (await apiGet(`/channels/${channelId}`, token)) as DiscordChannel;
}

export async function fetchMessages(
  channelId: string,
  token: string,
  limit: number,
  options: FetchMessagesOptions = {}
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
    options.onProgress?.(messages.length, limit);

    if (page.length < batch) break;

    // Proactive throttle: Discord allows roughly 5 req/5s per channel route.
    await sleep(1_000);
  }

  // Discord returns newest-first per page; reverse so result is oldest-first.
  return messages.reverse();
}

export function channelTypeName(type: number): string {
  return channelTypeNames[type] ?? `UNKNOWN_${type}`;
}

export function isMessageReadableChannel(type: number): boolean {
  return messageReadableTypes.has(type);
}

export function summarizeChannels(channels: DiscordChannel[]): ChannelSummary[] {
  const categories = new Map(
    channels
      .filter((channel) => channel.type === 4)
      .map((channel) => [channel.id, channel.name ?? channel.id])
  );

  return channels
    .filter((channel) => channel.type !== 4)
    .map((channel) => ({
      id: channel.id,
      name: channel.name ?? channel.id,
      type: channel.type,
      typeName: channelTypeName(channel.type),
      position: channel.position ?? 0,
      parentId: channel.parent_id ?? null,
      parentName: channel.parent_id ? categories.get(channel.parent_id) ?? null : null,
      topic: channel.topic ?? null,
      nsfw: channel.nsfw ?? false,
      lastMessageId: channel.last_message_id ?? null,
      messageReadable: isMessageReadableChannel(channel.type),
    }))
    .sort((a, b) => {
      const categoryA = a.parentName ?? "";
      const categoryB = b.parentName ?? "";
      if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);
      if (a.position !== b.position) return a.position - b.position;
      return a.name.localeCompare(b.name);
    });
}

export function displayName(user: DiscordUser): string {
  return user.global_name ?? user.username;
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function formatMarkdown(messages: DiscordMessage[]): string {
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
