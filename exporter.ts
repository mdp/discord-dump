/**
 * Discord exploration CLI.
 *
 * Usage:
 *   DISCORD_TOKEN=<token> discord-dump list-guilds
 *   DISCORD_TOKEN=<token> discord-dump list-channels <guildId>
 *   DISCORD_TOKEN=<token> discord-dump get-channel <channelId>
 *   DISCORD_TOKEN=<token> discord-dump dump-channel [--text] <channelId> [limit] [output]
 *   DISCORD_TOKEN=<token> discord-dump [--text] <channelId> [limit] [output]
 */

import fs from "fs";
import { fileURLToPath } from "url";
import {
  fetchChannel,
  fetchGuildChannels,
  fetchGuilds,
  fetchMessages,
  formatMarkdown,
  summarizeChannels,
  type DiscordMessage,
} from "./lib.js";

const commands = new Set(["list-guilds", "list-channels", "get-channel", "dump-channel"]);

export type CliCommand = "list-guilds" | "list-channels" | "get-channel" | "dump-channel";

export interface ParsedArgs {
  command: CliCommand;
  textMode: boolean;
  channelId?: string;
  guildId?: string;
  limit: number;
  outputFile?: string;
  legacy: boolean;
}

function usage(): string {
  return [
    "Usage:",
    "  DISCORD_TOKEN=<token> discord-dump list-guilds",
    "  DISCORD_TOKEN=<token> discord-dump list-channels <guildId>",
    "  DISCORD_TOKEN=<token> discord-dump get-channel <channelId>",
    "  DISCORD_TOKEN=<token> discord-dump dump-channel [--text] <channelId> [limit] [output]",
    "  DISCORD_TOKEN=<token> discord-dump [--text] <channelId> [limit] [output]",
  ].join("\n");
}

export function parseArgs(argv: string[]): ParsedArgs {
  const textMode = argv.includes("--text");
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const command = commands.has(positional[0]) ? positional[0] as CliCommand : "dump-channel";
  const legacy = command === "dump-channel" && positional[0] !== "dump-channel";
  const commandOffset = legacy ? 0 : 1;

  if (command === "list-guilds") {
    return { command, textMode: false, limit: 500, legacy: false };
  }

  if (command === "list-channels") {
    const guildId = positional[commandOffset];
    if (!guildId) throw new Error(`Missing guildId\n\n${usage()}`);
    return { command, textMode: false, guildId, limit: 500, legacy: false };
  }

  if (command === "get-channel") {
    const channelId = positional[commandOffset];
    if (!channelId) throw new Error(`Missing channelId\n\n${usage()}`);
    return { command, textMode: false, channelId, limit: 500, legacy: false };
  }

  const channelId = positional[commandOffset];
  if (!channelId) throw new Error(usage());

  const limitArg = positional[commandOffset + 1];
  const limit = parseInt(limitArg ?? "500", 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer");
  }

  return {
    command,
    textMode,
    channelId,
    limit,
    outputFile: positional[commandOffset + 2],
    legacy,
  };
}

function writeOutput(output: string, outputFile?: string): void {
  if (outputFile) {
    fs.writeFileSync(outputFile, output, "utf8");
    console.error(`Wrote to ${outputFile}`);
  } else {
    console.log(output);
  }
}

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

async function dumpChannel(parsed: ParsedArgs, token: string): Promise<void> {
  const channelId = parsed.channelId;
  if (!channelId) throw new Error("Missing channelId");

  console.error(`Fetching last ${parsed.limit} messages from channel ${channelId}...`);
  const messages: DiscordMessage[] = await fetchMessages(channelId, token, parsed.limit, {
    onProgress: (fetched, limit) => process.stderr.write(`  fetched ${fetched}/${limit} messages\r`),
  });
  process.stderr.write("\n");
  console.error(`Done - ${messages.length} messages`);

  writeOutput(
    parsed.textMode ? formatMarkdown(messages) : json(messages),
    parsed.outputFile
  );
}

export async function run(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const parsed = parseArgs(argv);
  const token = env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN env var is required");

  if (parsed.command === "list-guilds") {
    writeOutput(json(await fetchGuilds(token)));
    return;
  }

  if (parsed.command === "list-channels") {
    const guildId = parsed.guildId;
    if (!guildId) throw new Error("Missing guildId");
    writeOutput(json(summarizeChannels(await fetchGuildChannels(guildId, token))));
    return;
  }

  if (parsed.command === "get-channel") {
    const channelId = parsed.channelId;
    if (!channelId) throw new Error("Missing channelId");
    writeOutput(json(await fetchChannel(channelId, token)));
    return;
  }

  await dumpChannel(parsed, token);
}

if (fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
