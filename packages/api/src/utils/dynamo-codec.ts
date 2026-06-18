/**
 * Some values the DynamoDB document client returns do not survive a
 * `JSON.stringify` round-trip and, worse, silently corrupt the item when it is
 * sent back to DynamoDB:
 *
 *   - Binary attributes (type `B`) unmarshal to `Uint8Array`, which serialises
 *     as a byte-indexed object (`{"0":31,"1":139,...}`) and round-trips back as
 *     a Map instead of binary.
 *   - Set attributes (`SS`/`NS`/`BS`) unmarshal to a native `Set`, which
 *     serialises as `{}` (a Set has no enumerable own properties) and
 *     round-trips back as an empty Map.
 *
 * To keep these intact across the HTTP/JSON boundary we wrap them in tagged
 * envelopes on the way out and unwrap them back into `Uint8Array`/`Set` on the
 * way in (the document client then re-marshals them to the correct type).
 *
 * A binary set (`BS`) is a `Set<Uint8Array>`, so sets and binary nest; both are
 * handled in a single recursive walk to keep that case correct.
 *
 * The tags MUST stay in sync with the web package
 * (packages/web/src/lib/dynamo-json.ts → BINARY_TAG / SET_TAG).
 */
export const BINARY_TAG = "__dynascope_b64__";
export const SET_TAG = "__dynascope_set__";

type SetType = "SS" | "NS" | "BS";

interface BinaryEnvelope {
	[BINARY_TAG]: string;
}

interface SetEnvelope {
	[SET_TAG]: { type: SetType; values: unknown[] };
}

function isBinaryEnvelope(value: unknown): value is BinaryEnvelope {
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

function isSetEnvelope(value: unknown): value is SetEnvelope {
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

/** Infer the DynamoDB set type from a non-empty set's members. */
function setTypeOf(set: Set<unknown>): SetType {
	const first = set.values().next().value;
	if (first instanceof Uint8Array) return "BS";
	if (typeof first === "number") return "NS";
	return "SS";
}

function encode(value: unknown): unknown {
	if (value instanceof Uint8Array) {
		return { [BINARY_TAG]: Buffer.from(value).toString("base64") };
	}
	if (value instanceof Set) {
		// BS members are `Uint8Array`, so encode each member recursively.
		return {
			[SET_TAG]: { type: setTypeOf(value), values: [...value].map(encode) },
		};
	}
	if (Array.isArray(value)) {
		return value.map(encode);
	}
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = encode(v);
		}
		return out;
	}
	return value;
}

function decode(value: unknown): unknown {
	if (isBinaryEnvelope(value)) {
		return new Uint8Array(Buffer.from(value[BINARY_TAG], "base64"));
	}
	if (isSetEnvelope(value)) {
		// For BS the members are binary envelopes; decode restores the Uint8Arrays.
		return new Set(value[SET_TAG].values.map(decode));
	}
	if (Array.isArray(value)) {
		return value.map(decode);
	}
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = decode(v);
		}
		return out;
	}
	return value;
}

/**
 * Recursively replace `Uint8Array` (binary) and `Set` (string/number/binary
 * set) values with JSON-safe envelopes so the result is safe to send to the
 * browser. The top-level shape is preserved.
 */
export function encodeDynamoValues<T>(value: T): T {
	return encode(value) as T;
}

/**
 * Recursively replace envelopes with the native `Uint8Array` / `Set` values
 * that the document client marshals back to DynamoDB binary and set types.
 */
export function decodeDynamoValues<T>(value: T): T {
	return decode(value) as T;
}
