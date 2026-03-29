import { Hono } from "hono";
import type { ConnectionManager } from "../services/dynamo-client.js";
import {
	createTable,
	deleteTable,
	describeTable,
	listTables,
} from "../services/table-service.js";
import { CreateTableSchema } from "../types/index.js";
import { handleAwsError } from "../utils/errors.js";

type Env = {
	Variables: {
		connectionManager: ConnectionManager;
	};
};

const tableRoutes = new Hono<Env>();

/**
 * GET /api/tables
 * Lists all table names.
 */
tableRoutes.get("/", async (c) => {
	const manager = c.get("connectionManager");
	const client = manager.getClient();

	try {
		const names = await listTables(client);
		const tables = names.map((name) => ({ TableName: name }));
		return c.json({ tables, count: tables.length });
	} catch (err) {
		return handleAwsError(c, err);
	}
});

/**
 * GET /api/tables/:name
 * Describes a single table.
 */
tableRoutes.get("/:name", async (c) => {
	const manager = c.get("connectionManager");
	const client = manager.getClient();
	const tableName = c.req.param("name");

	try {
		const table = await describeTable(client, tableName);
		return c.json({ table });
	} catch (err) {
		return handleAwsError(c, err);
	}
});

/**
 * POST /api/tables
 * Creates a new table.
 */
tableRoutes.post("/", async (c) => {
	const manager = c.get("connectionManager");
	const client = manager.getClient();
	const body = await c.req.json();

	const parsed = CreateTableSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: parsed.error.flatten() }, 400);
	}

	try {
		const table = await createTable(client, parsed.data);
		return c.json({ table }, 201);
	} catch (err) {
		return handleAwsError(c, err);
	}
});

/**
 * DELETE /api/tables/:name
 * Deletes a table.
 */
tableRoutes.delete("/:name", async (c) => {
	const manager = c.get("connectionManager");
	const client = manager.getClient();
	const tableName = c.req.param("name");

	try {
		await deleteTable(client, tableName);
		return c.json({ deleted: tableName });
	} catch (err) {
		return handleAwsError(c, err);
	}
});

export { tableRoutes };
