/**
 * Converts between plain JSON and DynamoDB-style JSON (with type descriptors).
 *
 * Plain JSON:     { "name": "Alice", "age": 30, "active": true }
 * DynamoDB JSON:  { "name": { "S": "Alice" }, "age": { "N": "30" }, "active": { "BOOL": true } }
 */

type DynamoValue =
	| { S: string }
	| { N: string }
	| { B: string }
	| { BOOL: boolean }
	| { NULL: true }
	| { L: DynamoValue[] }
	| { M: Record<string, DynamoValue> }
	| { SS: string[] }
	| { NS: string[] }
	| { BS: string[] };

/**
 * Binary (type `B`) attributes are delivered by the API as a tagged base64
 * envelope (see packages/api/src/utils/binary.ts) so they survive the JSON
 * round-trip rather than degrading into a byte-indexed object. In plain JSON a
 * binary attribute appears as `{ "__dynascope_b64__": "<base64>" }`; in DynamoDB
 * JSON it appears as `{ "B": "<base64>" }`.
 *
 * This tag MUST stay in sync with the API (BINARY_TAG in the api package).
 */
export const BINARY_TAG = "__dynascope_b64__";

export function isBinaryEnvelope(
	value: unknown,
): value is Record<string, string> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const keys = Object.keys(value);
	return (
		keys.length === 1 &&
		keys[0] === BINARY_TAG &&
		typeof (value as Record<string, unknown>)[BINARY_TAG] === "string"
	);
}

/** Byte length of a base64 string, computed without decoding it. */
export function base64ByteLength(b64: string): number {
	const len = b64.length;
	if (len === 0) return 0;
	const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
	return Math.floor((len * 3) / 4) - padding;
}

/**
 * Convert a plain JS value to DynamoDB JSON format.
 */
export function toDynamoValue(value: unknown): DynamoValue {
	if (value === null || value === undefined) {
		return { NULL: true };
	}
	if (typeof value === "string") {
		return { S: value };
	}
	if (typeof value === "number") {
		return { N: String(value) };
	}
	if (typeof value === "boolean") {
		return { BOOL: value };
	}
	if (isBinaryEnvelope(value)) {
		return { B: value[BINARY_TAG] };
	}
	if (Array.isArray(value)) {
		// Check for typed sets (all strings, all numbers)
		if (value.length > 0 && value.every((v) => typeof v === "string")) {
			// Could be SS, but we can't distinguish from L of S without more context.
			// Default to L for safety.
		}
		return { L: value.map(toDynamoValue) };
	}
	if (typeof value === "object") {
		const map: Record<string, DynamoValue> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			map[k] = toDynamoValue(v);
		}
		return { M: map };
	}
	return { S: String(value) };
}

/**
 * Convert a DynamoDB JSON value back to a plain JS value.
 */
export function fromDynamoValue(dv: DynamoValue): unknown {
	if ("S" in dv) return dv.S;
	if ("N" in dv) return Number(dv.N);
	if ("B" in dv) return { [BINARY_TAG]: dv.B };
	if ("BOOL" in dv) return dv.BOOL;
	if ("NULL" in dv) return null;
	if ("L" in dv) return dv.L.map(fromDynamoValue);
	if ("M" in dv) {
		const obj: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(dv.M)) {
			obj[k] = fromDynamoValue(v);
		}
		return obj;
	}
	if ("SS" in dv) return dv.SS;
	if ("NS" in dv) return dv.NS.map(Number);
	if ("BS" in dv) return dv.BS;
	return null;
}

/**
 * Convert a plain JSON item to a DynamoDB JSON item (top-level map).
 */
export function toDynamoItem(
	item: Record<string, unknown>,
): Record<string, DynamoValue> {
	const result: Record<string, DynamoValue> = {};
	for (const [k, v] of Object.entries(item)) {
		result[k] = toDynamoValue(v);
	}
	return result;
}

/**
 * Convert a DynamoDB JSON item back to a plain JSON item.
 */
export function fromDynamoItem(
	dynamoItem: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(dynamoItem)) {
		result[k] = fromDynamoValue(v as DynamoValue);
	}
	return result;
}

/**
 * Check if an object looks like a DynamoDB JSON item
 * (every top-level value is an object with a single DynamoDB type key).
 */
const DYNAMO_TYPE_KEYS = new Set([
	"S",
	"N",
	"B",
	"BOOL",
	"NULL",
	"L",
	"M",
	"SS",
	"NS",
	"BS",
]);

export function isDynamoItem(obj: unknown): boolean {
	if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
		return false;
	}
	const entries = Object.entries(obj as Record<string, unknown>);
	if (entries.length === 0) return false;
	return entries.every(([, v]) => {
		if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
		const keys = Object.keys(v as Record<string, unknown>);
		return keys.length === 1 && DYNAMO_TYPE_KEYS.has(keys[0]);
	});
}
