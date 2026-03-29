import {
	BatchWriteCommand,
	DeleteCommand,
	GetCommand,
	PutCommand,
	QueryCommand,
	ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { ItemKey, QueryParams, ScanParams } from "../types/index.js";

// ── Sample partition key values ────────────────────────────────────

const SAMPLE_SCAN_LIMIT = 1000;

export async function samplePartitionKeyValues(
	docClient: DynamoDBDocumentClient,
	tableName: string,
	partitionKeyName: string,
	indexName?: string,
): Promise<string[]> {
	const seen = new Set<string>();
	let exclusiveStartKey: Record<string, unknown> | undefined;

	// Scan up to SAMPLE_SCAN_LIMIT items, projecting only the PK attribute
	let scanned = 0;
	do {
		const result = await docClient.send(
			new ScanCommand({
				TableName: tableName,
				...(indexName && { IndexName: indexName }),
				ProjectionExpression: "#pk",
				ExpressionAttributeNames: { "#pk": partitionKeyName },
				Limit: Math.min(SAMPLE_SCAN_LIMIT - scanned, 100),
				...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
			}),
		);

		for (const item of result.Items ?? []) {
			const val = item[partitionKeyName];
			if (val !== undefined && val !== null) {
				seen.add(String(val));
			}
		}

		scanned += result.ScannedCount ?? 0;
		exclusiveStartKey = result.LastEvaluatedKey as
			| Record<string, unknown>
			| undefined;
	} while (exclusiveStartKey && scanned < SAMPLE_SCAN_LIMIT);

	return Array.from(seen).sort();
}

// ── Scan ───────────────────────────────────────────────────────────

export interface ScanResult {
	items: Record<string, unknown>[];
	lastEvaluatedKey?: Record<string, unknown>;
	count: number;
	scannedCount: number;
}

export async function scanItems(
	docClient: DynamoDBDocumentClient,
	tableName: string,
	params: ScanParams,
): Promise<ScanResult> {
	const result = await docClient.send(
		new ScanCommand({
			TableName: tableName,
			Limit: params.limit,
			...(params.exclusiveStartKey && {
				ExclusiveStartKey: params.exclusiveStartKey,
			}),
			...(params.filterExpression && {
				FilterExpression: params.filterExpression,
			}),
			...(params.expressionAttributeNames && {
				ExpressionAttributeNames: params.expressionAttributeNames,
			}),
			...(params.expressionAttributeValues && {
				ExpressionAttributeValues: params.expressionAttributeValues,
			}),
		}),
	);

	return {
		items: (result.Items ?? []) as Record<string, unknown>[],
		lastEvaluatedKey: result.LastEvaluatedKey as
			| Record<string, unknown>
			| undefined,
		count: result.Count ?? 0,
		scannedCount: result.ScannedCount ?? 0,
	};
}

// ── Query ──────────────────────────────────────────────────────────

export interface QueryResult {
	items: Record<string, unknown>[];
	lastEvaluatedKey?: Record<string, unknown>;
	count: number;
	scannedCount: number;
}

export async function queryItems(
	docClient: DynamoDBDocumentClient,
	tableName: string,
	params: QueryParams,
): Promise<QueryResult> {
	const result = await docClient.send(
		new QueryCommand({
			TableName: tableName,
			KeyConditionExpression: params.keyConditionExpression,
			ExpressionAttributeValues: params.expressionAttributeValues,
			Limit: params.limit,
			ScanIndexForward: params.scanIndexForward,
			...(params.expressionAttributeNames && {
				ExpressionAttributeNames: params.expressionAttributeNames,
			}),
			...(params.indexName && { IndexName: params.indexName }),
			...(params.exclusiveStartKey && {
				ExclusiveStartKey: params.exclusiveStartKey,
			}),
			...(params.filterExpression && {
				FilterExpression: params.filterExpression,
			}),
		}),
	);

	return {
		items: (result.Items ?? []) as Record<string, unknown>[],
		lastEvaluatedKey: result.LastEvaluatedKey as
			| Record<string, unknown>
			| undefined,
		count: result.Count ?? 0,
		scannedCount: result.ScannedCount ?? 0,
	};
}

// ── Get ────────────────────────────────────────────────────────────

export async function getItem(
	docClient: DynamoDBDocumentClient,
	tableName: string,
	key: ItemKey,
): Promise<Record<string, unknown> | null> {
	const result = await docClient.send(
		new GetCommand({
			TableName: tableName,
			Key: key,
		}),
	);
	return (result.Item as Record<string, unknown>) ?? null;
}

// ── Put ────────────────────────────────────────────────────────────

export async function putItem(
	docClient: DynamoDBDocumentClient,
	tableName: string,
	item: Record<string, unknown>,
): Promise<void> {
	await docClient.send(
		new PutCommand({
			TableName: tableName,
			Item: item,
		}),
	);
}

// ── Delete ─────────────────────────────────────────────────────────

export async function deleteItem(
	docClient: DynamoDBDocumentClient,
	tableName: string,
	key: ItemKey,
): Promise<void> {
	await docClient.send(
		new DeleteCommand({
			TableName: tableName,
			Key: key,
		}),
	);
}

// ── Batch delete ───────────────────────────────────────────────────

const BATCH_WRITE_LIMIT = 25;

export async function batchDeleteItems(
	docClient: DynamoDBDocumentClient,
	tableName: string,
	keys: ItemKey[],
): Promise<{ deletedCount: number; failedCount: number }> {
	let deletedCount = 0;
	let failedCount = 0;

	// Split keys into chunks of 25 (DynamoDB BatchWrite limit)
	for (let i = 0; i < keys.length; i += BATCH_WRITE_LIMIT) {
		const chunk = keys.slice(i, i + BATCH_WRITE_LIMIT);

		const result = await docClient.send(
			new BatchWriteCommand({
				RequestItems: {
					[tableName]: chunk.map((key) => ({
						DeleteRequest: { Key: key },
					})),
				},
			}),
		);

		const unprocessed = result.UnprocessedItems?.[tableName]?.length ?? 0;
		deletedCount += chunk.length - unprocessed;
		failedCount += unprocessed;
	}

	return { deletedCount, failedCount };
}
