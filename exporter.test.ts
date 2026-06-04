import { afterEach, describe, it, expect, vi } from "vitest";
import { parseArgs } from "./exporter.js";
import {
  displayName,
  fetchChannel,
  fetchGuildChannels,
  fetchGuilds,
  fetchMessages,
  formatMarkdown,
  formatTimestamp,
  summarizeChannels,
} from "./lib.js";
import type { DiscordChannel, DiscordMessage, DiscordUser } from "./lib.js";

const user = (overrides: Partial<DiscordUser> = {}): DiscordUser => ({
  id: "1",
  username: "alice",
  ...overrides,
});

const message = (overrides: Partial<DiscordMessage> = {}): DiscordMessage => ({
  id: "100",
  type: 0,
  content: "hello",
  timestamp: "2024-01-15T10:30:00.000Z",
  edited_timestamp: null,
  author: user(),
  attachments: [],
  embeds: [],
  pinned: false,
  ...overrides,
});

function mockFetchJson(data: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    status: 200,
    ok: true,
    headers: { get: () => null },
    json: async () => data,
    text: async () => JSON.stringify(data),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("displayName", () => {
  it("prefers global_name over username", () => {
    expect(displayName(user({ global_name: "Alice Smith" }))).toBe("Alice Smith");
  });

  it("falls back to username when global_name is null", () => {
    expect(displayName(user({ global_name: null }))).toBe("alice");
  });
});

describe("formatTimestamp", () => {
  it("formats ISO timestamp in UTC", () => {
    const result = formatTimestamp("2024-01-15T10:30:00.000Z");
    expect(result).toContain("Jan");
    expect(result).toContain("2024");
    expect(result).toContain("UTC");
  });
});

describe("formatMarkdown", () => {
  it("renders author and content", () => {
    const result = formatMarkdown([message()]);
    expect(result).toContain("**alice**");
    expect(result).toContain("hello");
  });

  it("uses global_name when set", () => {
    const result = formatMarkdown([message({ author: user({ global_name: "Alice Smith" }) })]);
    expect(result).toContain("**Alice Smith**");
  });

  it("renders attachment as markdown link", () => {
    const result = formatMarkdown([
      message({
        content: "",
        attachments: [{ id: "1", filename: "photo.png", url: "https://cdn.discordapp.com/photo.png", size: 1024 }],
      }),
    ]);
    expect(result).toContain("📎 [photo.png](https://cdn.discordapp.com/photo.png)");
  });

  it("renders reply quote", () => {
    const result = formatMarkdown([
      message({
        content: "yeah agreed",
        referenced_message: message({ content: "is this a good idea?", author: user({ username: "bob" }) }),
      }),
    ]);
    expect(result).toContain("> ↩ **bob**");
    expect(result).toContain("is this a good idea?");
    expect(result).toContain("yeah agreed");
  });

  it("renders reactions", () => {
    const result = formatMarkdown([
      message({
        reactions: [
          { count: 3, emoji: { id: null, name: "❤️" } },
          { count: 1, emoji: { id: null, name: "👍" } },
        ],
      }),
    ]);
    expect(result).toContain("❤️ 3");
    expect(result).toContain("👍 1");
  });

  it("separates messages with a blank line", () => {
    const result = formatMarkdown([message({ id: "1" }), message({ id: "2" })]);
    expect(result).toContain("\n\n");
  });

  it("truncates long reply previews to 80 chars", () => {
    const longContent = "a".repeat(100);
    const result = formatMarkdown([
      message({ referenced_message: message({ content: longContent }) }),
    ]);
    expect(result).toContain("…");
  });
});

describe("parseArgs", () => {
  it("parses legacy dump arguments", () => {
    expect(parseArgs(["--text", "123", "50", "out.md"])).toEqual({
      command: "dump-channel",
      textMode: true,
      channelId: "123",
      limit: 50,
      outputFile: "out.md",
      legacy: true,
    });
  });

  it("parses explicit dump-channel arguments", () => {
    expect(parseArgs(["dump-channel", "123"])).toEqual({
      command: "dump-channel",
      textMode: false,
      channelId: "123",
      limit: 500,
      outputFile: undefined,
      legacy: false,
    });
  });

  it("parses discovery commands", () => {
    expect(parseArgs(["list-guilds"])).toMatchObject({ command: "list-guilds" });
    expect(parseArgs(["list-channels", "456"])).toMatchObject({ command: "list-channels", guildId: "456" });
    expect(parseArgs(["get-channel", "789"])).toMatchObject({ command: "get-channel", channelId: "789" });
  });
});

describe("summarizeChannels", () => {
  it("sorts channels by category, position, and name", () => {
    const channels: DiscordChannel[] = [
      { id: "voice", type: 2, name: "Voice", position: 1, parent_id: "cat-b" },
      { id: "cat-b", type: 4, name: "Beta", position: 1 },
      { id: "beta-text", type: 0, name: "chat", position: 0, parent_id: "cat-b", topic: "Talk here" },
      { id: "alpha-news", type: 5, name: "news", position: 2, parent_id: "cat-a" },
      { id: "cat-a", type: 4, name: "Alpha", position: 0 },
      { id: "loose", type: 0, name: "general", position: 0 },
    ];

    const result = summarizeChannels(channels);

    expect(result.map((channel) => channel.id)).toEqual(["loose", "alpha-news", "beta-text", "voice"]);
    expect(result.find((channel) => channel.id === "beta-text")).toMatchObject({
      parentName: "Beta",
      typeName: "GUILD_TEXT",
      topic: "Talk here",
      messageReadable: true,
    });
    expect(result.find((channel) => channel.id === "voice")).toMatchObject({
      typeName: "GUILD_VOICE",
      messageReadable: false,
    });
  });
});

describe("Discord REST helpers", () => {
  it("fetches the current user's guilds", async () => {
    const fetchMock = mockFetchJson([{ id: "1", name: "Guild" }]);

    await expect(fetchGuilds("Bot token")).resolves.toEqual([{ id: "1", name: "Guild" }]);
    expect(fetchMock).toHaveBeenCalledWith("https://discord.com/api/v10/users/@me/guilds", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bot token" }),
    }));
  });

  it("fetches guild channels", async () => {
    const fetchMock = mockFetchJson([{ id: "2", name: "general", type: 0 }]);

    await expect(fetchGuildChannels("guild-1", "token")).resolves.toEqual([{ id: "2", name: "general", type: 0 }]);
    expect(fetchMock).toHaveBeenCalledWith("https://discord.com/api/v10/guilds/guild-1/channels", expect.anything());
  });

  it("fetches one channel", async () => {
    const fetchMock = mockFetchJson({ id: "2", name: "general", type: 0 });

    await expect(fetchChannel("2", "token")).resolves.toEqual({ id: "2", name: "general", type: 0 });
    expect(fetchMock).toHaveBeenCalledWith("https://discord.com/api/v10/channels/2", expect.anything());
  });

  it("fetches channel messages", async () => {
    const fetchMock = mockFetchJson([message({ id: "200" })]);

    await expect(fetchMessages("2", "token", 10)).resolves.toEqual([message({ id: "200" })]);
    expect(fetchMock).toHaveBeenCalledWith("https://discord.com/api/v10/channels/2/messages?limit=10", expect.anything());
  });
});
