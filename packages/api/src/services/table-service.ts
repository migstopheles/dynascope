import {
	CreateTableCommand,
	DeleteTableCommand,
	DescribeTableCommand,
	ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import type {
	DynamoDBClient,
	TableDescription,
} from "@aws-sdk/client-dynamodb";
import type { CreateTableParams } from "../types/index.js";

/**
 * Lists all table names in the account/region.
 * Handles pagination automatically — DynamoDB returns at most 100 names per call.
 */
export async function listTables(client: DynamoDBClient): Promise<string[]> {
	const tableNames: string[] = [];
	let lastEvaluatedTableName: string | undefined;

	do {
		const result = await client.send(
			new ListTablesCommand({
				ExclusiveStartTableName: lastEvaluatedTableName,
			}),
		);
		if (result.TableNames) {
			tableNames.push(...result.TableNames);
		}
		lastEvaluatedTableName = result.LastEvaluatedTableName;
	} while (lastEvaluatedTableName);

	return tableNames;
}

/**
 * Describes a single table by name.
 */
export async function describeTable(
	client: DynamoDBClient,
	tableName: string,
): Promise<TableDescription> {
	const result = await client.send(
		new DescribeTableCommand({ TableName: tableName }),
	);
	if (!result.Table) {
		throw new Error(`Table "${tableName}" not found`);
	}
	return result.Table;
}

/**
 * Creates a new table from the validated params.
 */
export async function createTable(
	client: DynamoDBClient,
	params: CreateTableParams,
): Promise<TableDescription> {
	const result = await client.send(
		new CreateTableCommand({
			TableName: params.tableName,
			KeySchema: params.keySchema.map((k) => ({
				AttributeName: k.attributeName,
				KeyType: k.keyType,
			})),
			AttributeDefinitions: params.attributeDefinitions.map((a) => ({
				AttributeName: a.attributeName,
				AttributeType: a.attributeType,
			})),
			BillingMode: params.billingMode,
			...(params.billingMode === "PROVISIONED" && {
				ProvisionedThroughput: {
					ReadCapacityUnits: params.readCapacityUnits,
					WriteCapacityUnits: params.writeCapacityUnits,
				},
			}),
		}),
	);
	if (!result.TableDescription) {
		throw new Error("CreateTable did not return a table description");
	}
	return result.TableDescription;
}

/**
 * Deletes a table by name.
 */
export async function deleteTable(
	client: DynamoDBClient,
	tableName: string,
): Promise<void> {
	await client.send(new DeleteTableCommand({ TableName: tableName }));
}
