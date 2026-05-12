// Pure types and functions — importable by tests without triggering the CLI entry point.

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
