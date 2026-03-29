import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { DynascopeConfig } from "../types/index.js";

export interface DynamoClients {
	client: DynamoDBClient;
	docClient: DynamoDBDocumentClient;
}

/**
 * Creates a DynamoDB client and document client from the given config.
 * When an endpoint is specified (DynamoDB Local), dummy credentials are
 * used if none are provided.
 */
export function createDynamoClients(config: DynascopeConfig): DynamoClients {
	const region = config.region ?? "us-east-1";

	let credentials: { accessKeyId: string; secretAccessKey: string } | undefined;

	if (config.accessKeyId && config.secretAccessKey) {
		credentials = {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		};
	} else if (config.endpoint && !config.profile) {
		// DynamoDB Local ignores credentials but the SDK still requires them
		credentials = {
			accessKeyId: "local",
			secretAccessKey: "local",
		};
	}

	const client = new DynamoDBClient({
		region,
		...(config.endpoint && { endpoint: config.endpoint }),
		...(credentials && { credentials }),
	});

	const docClient = DynamoDBDocumentClient.from(client, {
		marshallOptions: {
			removeUndefinedValues: true,
			convertClassInstanceToMap: true,
		},
		unmarshallOptions: {
			wrapNumbers: false,
		},
	});

	return { client, docClient };
}

/**
 * Manages the active DynamoDB connection, allowing runtime config changes.
 */
export class ConnectionManager {
	private config: DynascopeConfig;
	private clients: DynamoClients;

	constructor(config: DynascopeConfig) {
		this.config = config;
		this.clients = createDynamoClients(config);
	}

	getConfig(): DynascopeConfig {
		return { ...this.config };
	}

	/**
	 * Returns a sanitised copy of the config with secrets removed.
	 */
	getSafeConfig(): Omit<DynascopeConfig, "accessKeyId" | "secretAccessKey"> {
		const { accessKeyId: _, secretAccessKey: __, ...safe } = this.config;
		return {
			...safe,
			...(this.config.accessKeyId && {
				accessKeyId: "***",
			}),
			...(this.config.secretAccessKey && {
				secretAccessKey: "***",
			}),
		};
	}

	getClient(): DynamoDBClient {
		return this.clients.client;
	}

	getDocClient(): DynamoDBDocumentClient {
		return this.clients.docClient;
	}

	/**
	 * Replaces the current connection with a new config.
	 * Old clients are destroyed to release sockets.
	 */
	updateConfig(config: DynascopeConfig): void {
		this.clients.client.destroy();
		this.config = config;
		this.clients = createDynamoClients(config);
	}
}
