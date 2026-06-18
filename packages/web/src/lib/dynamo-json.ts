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
 * Binary (type `B`) attributes and set attributes (`SS`/`NS`/`BS`) are values
 * the API cannot serialise to JSON directly (a `Uint8Array` degrades into a
 * byte-indexed object, a `Set` into `{}`). The API therefore delivers them as
 * tagged envelopes (see packages/api/src/utils/dynamo-codec.ts) so they survive
 * the round-trip.
 *
 * In plain JSON:
 *   - binary appears as `{ "__dynascope_b64__": "<base64>" }`
 *   - a set appears as `{ "__dynascope_set__": { "type": "SS"|"NS"|"BS", "values": [...] } }`
 *
 * In DynamoDB JSON these become `{ "B": "<base64>" }` and `{ "SS": [...] }` etc.
 *
 * These tags MUST stay in sync with the API (BINARY_TAG / SET_TAG in the api
 * package).
 */
export const BINARY_TAG = "__dynascope_b64__";
export const SET_TAG = "__dynascope_set__";

export type SetType = "SS" | "NS" | "BS";

export interface SetEnvelope {
	[SET_TAG]: { type: SetType; values: unknown[] };
}

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

export function isSetEnvelope(value: unknown): value is SetEnvelope {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const keys = Object.keys(value);
	if (keys.length !== 1 || keys[0] !== SET_TAG) {
		return false;
	}
	const inner = (value as Record<string, unknown>)[SET_TAG];
	if (typeof inner !== "object" || inner === null) {
		return false;
	}
	const { type, values } = inner as Record<string, unknown>;
	return (
		(type === "SS" || type === "NS" || type === "BS") && Array.isArray(values)
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
	if (isSetEnvelope(value)) {
		const { type, values } = value[SET_TAG];
		if (type === "SS") return { SS: values as string[] };
		if (type === "NS") return { NS: (values as number[]).map(String) };
		// BS: members are binary envelopes; unwrap to base64 strings.
		return {
			BS: (values as Array<Record<string, string>>).map((v) => v[BINARY_TAG]),
		};
	}
	if (Array.isArray(value)) {
		// A bare array is always a List; sets arrive as a SetEnvelope (handled above).
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
	if ("SS" in dv) return { [SET_TAG]: { type: "SS", values: dv.SS } };
	if ("NS" in dv)
		return { [SET_TAG]: { type: "NS", values: dv.NS.map(Number) } };
	if ("BS" in dv)
		return {
			[SET_TAG]: {
				type: "BS",
				values: dv.BS.map((b) => ({ [BINARY_TAG]: b })),
			},
		};
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
