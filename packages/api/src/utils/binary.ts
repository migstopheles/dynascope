/**
 * DynamoDB binary attributes (type `B`) are unmarshalled by the document client
 * into `Uint8Array`. Those do not survive `JSON.stringify`: a `Uint8Array` is
 * serialised as an object keyed by byte index (`{"0":31,"1":139,...}`), which
 * renders uselessly in the UI and, worse, round-trips back to DynamoDB as a Map
 * instead of binary — silently corrupting the item on save.
 *
 * To keep binary values intact across the HTTP/JSON boundary we wrap them in a
 * tagged base64 envelope on the way out and unwrap them back into `Uint8Array`
 * on the way in (the document client then re-marshals them as type `B`).
 *
 * The tag MUST stay in sync with the web package
 * (packages/web/src/lib/dynamo-json.ts → BINARY_TAG).
 */
export const BINARY_TAG = "__dynascope_b64__";

interface BinaryEnvelope {
	[BINARY_TAG]: string;
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

function encode(value: unknown): unknown {
	if (value instanceof Uint8Array) {
		return { [BINARY_TAG]: Buffer.from(value).toString("base64") };
	}
	if (Array.isArray(value)) {
		return value.map(encode);
	}
	// Leave Uint8Array (handled above) and other non-plain values untouched.
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
 * Recursively replace `Uint8Array` values with a base64 envelope so the result
 * is safe to send to the browser. The top-level shape is preserved.
 */
export function encodeBinaryValues<T>(value: T): T {
	return encode(value) as T;
}

/**
 * Recursively replace base64 envelopes with `Uint8Array` so the document client
 * marshals them back to DynamoDB binary (type `B`).
 */
export function decodeBinaryValues<T>(value: T): T {
	return decode(value) as T;
}
