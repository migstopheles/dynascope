import { Hono } from "hono";
import type { ConnectionManager } from "../services/dynamo-client.js";
import {
	batchDeleteItems,
	deleteItem,
	getItem,
	putItem,
	queryItems,
	samplePartitionKeyValues,
	scanItems,
} from "../services/item-service.js";
import {
	BatchDeleteSchema,
	DeleteItemSchema,
	GetItemSchema,
	PutItemSchema,
	QueryParamsSchema,
	ScanParamsSchema,
	UpdateItemSchema,
} from "../types/index.js";
import { handleAwsError } from "../utils/errors.js";

type Env = {
	Variables: {
		connectionManager: ConnectionManager;
	};
};

const itemRoutes = new Hono<Env>();

/**
 * GET /api/tables/:name/sample-keys?partitionKey=pk&index=indexName
 * Returns sample unique partition key values by scanning up to 1000 items.
 */
itemRoutes.get("/:name/sample-keys", async (c) => {
	const manager = c.get("connectionManager");
	const docClient = manager.getDocClient();
	const tableName = c.req.param("name");
	const partitionKey = c.req.query("partitionKey");
	const indexName = c.req.query("index");

	if (!partitionKey) {
		return c.json({ error: "partitionKey query parameter is required" }, 400);
	}

	try {
		const values = await samplePartitionKeyValues(
			docClient,
			tableName,
			partitionKey,
			indexName || undefined,
		);
		return c.json({ values, isSample: values.length >= 1000 });
	} catch (err) {
		return handleAwsError(c, err);
	}
});

/**
 * POST /api/tables/:name/scan
 * Scans table items. Uses POST because the body may contain filter parameters.
 */
itemRoutes.post("/:name/scan", async (c) => {
	const manager = c.get("connectionManager");
	const docClient = manager.getDocClient();
	const tableName = c.req.param("name");
	const body = await c.req.json().catch(() => ({}));

	const parsed = ScanParamsSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: parsed.error.flatten() }, 400);
	}

	try {
		const result = await scanItems(docClient, tableName, parsed.data);
		return c.json(result);
	} catch (err) {
		return handleAwsError(c, err);
	}
});

/**
 * POST /api/tables/:name/query
 * Queries items by key condition expression.
 */
itemRoutes.post("/:name/query", async (c) => {
	const manager = c.get("connectionManager");
	const docClient = manager.getDocClient();
	const tableName = c.req.param("name");
	const body = await c.req.json();

	const parsed = QueryParamsSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: parsed.error.flatten() }, 400);
	}

	try {
		const result = await queryItems(docClient, tableName, parsed.data);
		return c.json(result);
	} catch (err) {
		return handleAwsError(c, err);
	}
});

/**
 * POST /api/tables/:name/items/get
 * Gets a single item by key. Uses POST because keys can be complex.
 */
itemRoutes.post("/:name/items/get", async (c) => {
	const manager = c.get("connectionManager");
	const docClient = manager.getDocClient();
	const tableName = c.req.param("name");
	const body = await c.req.json();

	const parsed = GetItemSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: parsed.error.flatten() }, 400);
	}

	try {
		const item = await getItem(docClient, tableName, parsed.data.key);
		if (item === null) {
			return c.json({ error: "Item not found" }, 404);
		}
		return c.json({ item });
	} catch (err) {
		return handleAwsError(c, err);
	}
});

/**
 * PUT /api/tables/:name/items
 * Creates or replaces an item.
 */
itemRoutes.put("/:name/items", async (c) => {
	const manager = c.get("connectionManager");
	const docClient = manager.getDocClient();
	const tableName = c.req.param("name");
	const body = await c.req.json();

	const parsed = PutItemSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: parsed.error.flatten() }, 400);
	}

	try {
		await putItem(docClient, tableName, parsed.data.item);
		return c.json({ success: true });
	} catch (err) {
		return handleAwsError(c, err);
	}
});

/**
 * PATCH /api/tables/:name/items
 * Updates an existing item (put with key + updated attributes).
 */
itemRoutes.patch("/:name/items", async (c) => {
	const manager = c.get("connectionManager");
	const docClient = manager.getDocClient();
	const tableName = c.req.param("name");
	const body = await c.req.json();

	const parsed = UpdateItemSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: parsed.error.flatten() }, 400);
	}

	try {
		// Merge key into item to ensure the key attributes are present
		const mergedItem = { ...parsed.data.item, ...parsed.data.key };
		await putItem(docClient, tableName, mergedItem);
		return c.json({ success: true });
	} catch (err) {
		return handleAwsError(c, err);
	}
});

/**
 * DELETE /api/tables/:name/items
 * Deletes a single item by key (key provided in request body).
 */
itemRoutes.delete("/:name/items", async (c) => {
	const manager = c.get("connectionManager");
	const docClient = manager.getDocClient();
	const tableName = c.req.param("name");
	const body = await c.req.json();

	const parsed = DeleteItemSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: parsed.error.flatten() }, 400);
	}

	try {
		await deleteItem(docClient, tableName, parsed.data.key);
		return c.json({ success: true });
	} catch (err) {
		return handleAwsError(c, err);
	}
});

/**
 * POST /api/tables/:name/items/batch-delete
 * Batch deletes items by keys.
 */
itemRoutes.post("/:name/items/batch-delete", async (c) => {
	const manager = c.get("connectionManager");
	const docClient = manager.getDocClient();
	const tableName = c.req.param("name");
	const body = await c.req.json();

	const parsed = BatchDeleteSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: parsed.error.flatten() }, 400);
	}

	try {
		const result = await batchDeleteItems(
			docClient,
			tableName,
			parsed.data.keys,
		);
		return c.json(result);
	} catch (err) {
		return handleAwsError(c, err);
	}
});

export { itemRoutes };
