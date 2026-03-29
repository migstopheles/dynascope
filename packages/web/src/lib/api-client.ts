// ── Types ─────────────────────────────────────────────────────────

export interface ConnectionInfo {
	endpoint?: string;
	region?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	profile?: string;
}

export interface ConnectionConfig {
	endpoint?: string;
	region?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	profile?: string;
}

export interface TableSummary {
	tableName: string;
}

export interface KeySchemaElement {
	attributeName: string;
	keyType: "HASH" | "RANGE";
}

export interface AttributeDefinition {
	attributeName: string;
	attributeType: "S" | "N" | "B";
}

export interface ProvisionedThroughput {
	readCapacityUnits?: number;
	writeCapacityUnits?: number;
}

export interface Projection {
	projectionType?: string;
	nonKeyAttributes?: string[];
}

export interface GlobalSecondaryIndex {
	indexName?: string;
	keySchema?: KeySchemaElement[];
	projection?: Projection;
	provisionedThroughput?: ProvisionedThroughput;
}

export interface LocalSecondaryIndex {
	indexName?: string;
	keySchema?: KeySchemaElement[];
	projection?: Projection;
}

export interface TableDescription {
	tableName?: string;
	tableStatus?: string;
	keySchema?: KeySchemaElement[];
	attributeDefinitions?: AttributeDefinition[];
	billingModeSummary?: {
		billingMode?: string;
	};
	provisionedThroughput?: ProvisionedThroughput;
	globalSecondaryIndexes?: GlobalSecondaryIndex[];
	localSecondaryIndexes?: LocalSecondaryIndex[];
	itemCount?: number;
	tableSizeBytes?: number;
	creationDateTime?: string;
}

export interface CreateTableParams {
	tableName: string;
	keySchema: KeySchemaElement[];
	attributeDefinitions: AttributeDefinition[];
	billingMode: "PAY_PER_REQUEST" | "PROVISIONED";
	readCapacityUnits?: number;
	writeCapacityUnits?: number;
}

export interface ScanParams {
	limit?: number;
	exclusiveStartKey?: Record<string, unknown>;
	filterExpression?: string;
	expressionAttributeNames?: Record<string, string>;
	expressionAttributeValues?: Record<string, unknown>;
}

export interface ScanResult {
	items: Record<string, unknown>[];
	count: number;
	scannedCount: number;
	lastEvaluatedKey?: Record<string, unknown>;
}

export interface QueryParams {
	keyConditionExpression: string;
	expressionAttributeValues: Record<string, unknown>;
	expressionAttributeNames?: Record<string, string>;
	indexName?: string;
	limit?: number;
	exclusiveStartKey?: Record<string, unknown>;
	scanIndexForward?: boolean;
	filterExpression?: string;
}

export interface QueryResult {
	items: Record<string, unknown>[];
	count: number;
	scannedCount: number;
	lastEvaluatedKey?: Record<string, unknown>;
}

// ── Key normalization ─────────────────────────────────────────────
// AWS SDK returns PascalCase keys; our frontend types use camelCase.

function toCamelCase(str: string): string {
	return str.charAt(0).toLowerCase() + str.slice(1);
}

function normalizeKeys(obj: unknown): unknown {
	if (Array.isArray(obj)) {
		return obj.map(normalizeKeys);
	}
	if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
		return Object.fromEntries(
			Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
				toCamelCase(key),
				normalizeKeys(value),
			]),
		);
	}
	return obj;
}

// ── Fetch helpers ─────────────────────────────────────────────────

class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function handleResponse<T>(res: Response): Promise<T> {
	if (!res.ok) {
		let message = `Request failed with status ${res.status}`;
		try {
			const body = await res.json();
			if (body.error) message = body.error;
			else if (body.message) message = body.message;
		} catch {
			// ignore parse errors
		}
		throw new ApiError(res.status, message);
	}
	const text = await res.text();
	if (!text) return undefined as T;
	return JSON.parse(text) as T;
}

async function apiGet<T>(path: string): Promise<T> {
	const res = await fetch(path, {
		headers: { Accept: "application/json" },
	});
	return handleResponse<T>(res);
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
	return handleResponse<T>(res);
}

async function apiPut<T>(path: string, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
	return handleResponse<T>(res);
}

async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method: "DELETE",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
	return handleResponse<T>(res);
}

// ── Domain API ────────────────────────────────────────────────────

export const api = {
	// Connection
	getConnection(): Promise<ConnectionInfo> {
		return apiGet("/api/connection");
	},

	testConnection(): Promise<{ ok: boolean; error?: string }> {
		return apiPost("/api/connection/test");
	},

	updateConnection(config: ConnectionConfig): Promise<void> {
		return apiPut("/api/connection", config);
	},

	// Tables
	async listTables(): Promise<TableSummary[]> {
		const res = await apiGet<{ tables: unknown[]; count: number }>("/api/tables");
		return res.tables.map((t) => normalizeKeys(t)) as TableSummary[];
	},

	async describeTable(name: string): Promise<TableDescription> {
		const res = await apiGet<{ table: unknown }>(`/api/tables/${encodeURIComponent(name)}`);
		return normalizeKeys(res.table) as TableDescription;
	},

	createTable(params: CreateTableParams): Promise<void> {
		return apiPost("/api/tables", params);
	},

	deleteTable(name: string): Promise<void> {
		return apiDelete(`/api/tables/${encodeURIComponent(name)}`);
	},

	// Items
	async samplePartitionKeyValues(
		table: string,
		partitionKey: string,
		index?: string,
	): Promise<{ values: string[]; isSample: boolean }> {
		const params = new URLSearchParams({ partitionKey });
		if (index) params.set("index", index);
		return apiGet(`/api/tables/${encodeURIComponent(table)}/sample-keys?${params}`);
	},

	scanItems(table: string, params?: ScanParams): Promise<ScanResult> {
		return apiPost(`/api/tables/${encodeURIComponent(table)}/scan`, params);
	},

	queryItems(table: string, params: QueryParams): Promise<QueryResult> {
		return apiPost(`/api/tables/${encodeURIComponent(table)}/query`, params);
	},

	getItem(
		table: string,
		key: Record<string, unknown>,
	): Promise<Record<string, unknown> | null> {
		return apiPost(`/api/tables/${encodeURIComponent(table)}/items/get`, {
			key,
		});
	},

	putItem(table: string, item: Record<string, unknown>): Promise<void> {
		return apiPut(`/api/tables/${encodeURIComponent(table)}/items`, { item });
	},

	deleteItem(table: string, key: Record<string, unknown>): Promise<void> {
		return apiDelete(`/api/tables/${encodeURIComponent(table)}/items`, { key });
	},

	batchDeleteItems(
		table: string,
		keys: Record<string, unknown>[],
	): Promise<void> {
		return apiPost(
			`/api/tables/${encodeURIComponent(table)}/items/batch-delete`,
			{ keys },
		);
	},
};
