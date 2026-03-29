import { z } from "zod";

// ── Connection config ──────────────────────────────────────────────

export interface DynascopeConfig {
	endpoint?: string;
	region?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	profile?: string;
}

// ── Table creation ─────────────────────────────────────────────────

export const KeyTypeSchema = z.enum(["HASH", "RANGE"]);
export const AttributeTypeSchema = z.enum(["S", "N", "B"]);
export const BillingModeSchema = z.enum(["PAY_PER_REQUEST", "PROVISIONED"]);

export const KeySchemaElementSchema = z.object({
	attributeName: z.string().min(1),
	keyType: KeyTypeSchema,
});

export const AttributeDefinitionSchema = z.object({
	attributeName: z.string().min(1),
	attributeType: AttributeTypeSchema,
});

export const CreateTableSchema = z
	.object({
		tableName: z.string().min(1),
		keySchema: z.array(KeySchemaElementSchema).min(1).max(2),
		attributeDefinitions: z.array(AttributeDefinitionSchema).min(1),
		billingMode: BillingModeSchema.default("PAY_PER_REQUEST"),
		readCapacityUnits: z.number().int().positive().optional(),
		writeCapacityUnits: z.number().int().positive().optional(),
	})
	.refine(
		(data) => {
			if (data.billingMode === "PROVISIONED") {
				return (
					data.readCapacityUnits !== undefined &&
					data.writeCapacityUnits !== undefined
				);
			}
			return true;
		},
		{
			message:
				"readCapacityUnits and writeCapacityUnits are required when billingMode is PROVISIONED",
		},
	);

export type CreateTableParams = z.infer<typeof CreateTableSchema>;

// ── Scan ───────────────────────────────────────────────────────────

export const ScanParamsSchema = z.object({
	limit: z.number().int().positive().default(25),
	exclusiveStartKey: z.record(z.unknown()).optional(),
	filterExpression: z.string().optional(),
	expressionAttributeNames: z.record(z.string()).optional(),
	expressionAttributeValues: z.record(z.unknown()).optional(),
});

export type ScanParams = z.infer<typeof ScanParamsSchema>;

// ── Query ──────────────────────────────────────────────────────────

export const QueryParamsSchema = z.object({
	keyConditionExpression: z.string().min(1),
	expressionAttributeValues: z.record(z.unknown()),
	expressionAttributeNames: z.record(z.string()).optional(),
	indexName: z.string().optional(),
	limit: z.number().int().positive().default(25),
	exclusiveStartKey: z.record(z.unknown()).optional(),
	scanIndexForward: z.boolean().default(true),
	filterExpression: z.string().optional(),
});

export type QueryParams = z.infer<typeof QueryParamsSchema>;

// ── Item operations ────────────────────────────────────────────────

export const ItemKeySchema = z
	.record(z.unknown())
	.refine((obj) => Object.keys(obj).length > 0, {
		message: "Key must have at least one attribute",
	});

export type ItemKey = z.infer<typeof ItemKeySchema>;

export const PutItemSchema = z.object({
	item: z.record(z.unknown()).refine((obj) => Object.keys(obj).length > 0, {
		message: "Item must have at least one attribute",
	}),
});

export const UpdateItemSchema = z.object({
	key: ItemKeySchema,
	item: z.record(z.unknown()).refine((obj) => Object.keys(obj).length > 0, {
		message: "Item must have at least one attribute",
	}),
});

export const DeleteItemSchema = z.object({
	key: ItemKeySchema,
});

export const BatchDeleteSchema = z.object({
	keys: z
		.array(ItemKeySchema)
		.min(1, "Must provide at least one key")
		.max(500, "Maximum 500 keys per batch delete"),
});

export const GetItemSchema = z.object({
	key: ItemKeySchema,
});

// ── Connection ─────────────────────────────────────────────────────

export const ConnectionConfigSchema = z.object({
	endpoint: z.string().url().optional(),
	region: z.string().optional(),
	accessKeyId: z.string().optional(),
	secretAccessKey: z.string().optional(),
	profile: z.string().optional(),
});

export const TestConnectionSchema = z
	.object({
		endpoint: z.string().url().optional(),
		region: z.string().optional(),
		accessKeyId: z.string().optional(),
		secretAccessKey: z.string().optional(),
		profile: z.string().optional(),
	})
	.optional();
