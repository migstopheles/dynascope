import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const dirname = path.dirname(fileURLToPath(import.meta.url));

interface ServerConfig {
	api: { fetch: Hono["fetch"] };
	port: number;
	open?: boolean;
}

export async function startServer(config: ServerConfig): Promise<void> {
	const { port } = config;

	const staticRoot = path.join(dirname, "static");
	const hasStaticFiles = fs.existsSync(path.join(staticRoot, "index.html"));

	const app = new Hono();

	// Mount the API app for all /api/* routes
	app.all("/api/*", (c) => config.api.fetch(c.req.raw));

	if (hasStaticFiles) {
		const relativeRoot = path.relative(process.cwd(), staticRoot);

		// Serve static files from the bundled web UI
		app.use(
			"/*",
			serveStatic({
				root: relativeRoot,
			}),
		);

		// SPA fallback: serve index.html for any non-API route
		const indexHtml = fs.readFileSync(
			path.join(staticRoot, "index.html"),
			"utf-8",
		);
		app.get("*", (c) => c.html(indexHtml));
	} else {
		app.get("*", (c) =>
			c.json({
				message:
					"Dynascope API is running. Use the Vite dev server for the UI.",
			}),
		);
	}

	const url = `http://localhost:${port}`;

	serve(
		{
			fetch: app.fetch,
			port,
		},
		() => {
			console.log("");
			console.log("  Dynascope is running!");
			console.log("");
			console.log(`  > Local: ${url}`);
			if (!hasStaticFiles) {
				console.log(
					"  > UI: http://localhost:5173 (run npm run dev -w @dynascope/web)",
				);
			}
			console.log("");
		},
	);

	if (config.open) {
		const openBrowser = await import("open");
		await openBrowser.default(url);
	}
}
