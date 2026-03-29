import { Hono } from "hono";
import { connectionRoutes } from "./routes/connection.js";
import { itemRoutes } from "./routes/items.js";
import { tableRoutes } from "./routes/tables.js";
import { ConnectionManager } from "./services/dynamo-client.js";
import type { DynascopeConfig } from "./types/index.js";

export type { DynascopeConfig };
export { ConnectionManager };

type AppEnv = {
	Variables: {
		connectionManager: ConnectionManager;
	};
};

/**
 * Creates a fully configured Hono app for the Dynascope API.
 *
 * @param config - DynamoDB connection config
 * @returns A Hono app instance with all routes mounted
 */
export function createApi(config: DynascopeConfig): Hono<AppEnv> {
	const manager = new ConnectionManager(config);
	const app = new Hono<AppEnv>();

	// Inject the connection manager into every request context
	app.use("*", async (c, next) => {
		c.set("connectionManager", manager);
		await next();
	});

	// Mount route groups
	app.route("/api/connection", connectionRoutes);
	app.route("/api/tables", tableRoutes);
	app.route("/api/tables", itemRoutes);

	// Global error handler — catch anything unhandled and return JSON
	app.onError((err, c) => {
		console.error("[dynascope] Unhandled error:", err);
		const message =
			err instanceof Error ? err.message : "Internal server error";
		return c.json({ error: message }, 500);
	});

	return app;
}
