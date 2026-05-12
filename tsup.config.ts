import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["exporter.ts"],
  format: ["esm"],
  target: "node18",
  banner: { js: "#!/usr/bin/env node" },
  outDir: "dist",
  clean: true,
});
