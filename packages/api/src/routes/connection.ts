import { ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { Hono } from "hono";
import type { ConnectionManager } from "../services/dynamo-client.js";
import { createDynamoClients } from "../services/dynamo-client.js";
import { ConnectionConfigSchema } from "../types/index.js";

type Env = {
	Variables: {
		connectionManager: ConnectionManager;
	};
};

const connectionRoutes = new Hono<Env>();

/**
 * GET /api/connection
 * Returns the current connection config with secrets masked.
 */
connectionRoutes.get("/", (c) => {
	const manager = c.get("connectionManager");
	return c.json({ config: manager.getSafeConfig() });
});

/**
 * POST /api/connection/test
 * Tests connectivity by calling ListTables with limit 1.
 * Optionally accepts a config in the body to test before saving.
 */
connectionRoutes.post("/test", async (c) => {
	const manager = c.get("connectionManager");

	let clientToTest = manager.getClient();
	let tempClients: ReturnType<typeof createDynamoClients> | null = null;

	// If a body is provided, create temporary clients with those settings
	const body = await c.req.json().catch(() => null);
	if (body && Object.keys(body).length > 0) {
		const parsed = ConnectionConfigSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ success: false, error: parsed.error.flatten() }, 400);
		}
		tempClients = createDynamoClients(parsed.data);
		clientToTest = tempClients.client;
	}

	try {
		const result = await clientToTest.send(new ListTablesCommand({ Limit: 1 }));
		return c.json({
			success: true,
			tableCount: result.TableNames?.length ?? 0,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return c.json({ success: false, error: message }, 502);
	} finally {
		// Clean up temporary client if we created one
		if (tempClients) {
			tempClients.client.destroy();
		}
	}
});

/**
 * PUT /api/connection
 * Updates the connection config at runtime.
 */
connectionRoutes.put("/", async (c) => {
	const manager = c.get("connectionManager");
	const body = await c.req.json();

	const parsed = ConnectionConfigSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: parsed.error.flatten() }, 400);
	}

	manager.updateConfig(parsed.data);
	return c.json({ config: manager.getSafeConfig() });
});

export { connectionRoutes };
