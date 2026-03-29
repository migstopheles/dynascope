import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	target: "node20",
	platform: "node",
	noExternal: ["@dynascope/api"],
	banner: {
		js: "#!/usr/bin/env node",
	},
	clean: true,
});
