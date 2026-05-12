import { describe, it, expect } from "vitest";
import { displayName, formatMarkdown, formatTimestamp } from "./lib.js";
import type { DiscordMessage, DiscordUser } from "./lib.js";

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
