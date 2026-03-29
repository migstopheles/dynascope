import type { Context } from "hono";

/**
 * Maps known AWS SDK error names to appropriate HTTP status codes
 * and returns a JSON error response.
 */
export function handleAwsError(c: Context, err: unknown): Response {
	if (!(err instanceof Error)) {
		return c.json({ error: "Unknown error" }, 500);
	}

	const name = err.name;

	switch (name) {
		case "ResourceNotFoundException":
			return c.json({ error: err.message }, 404);

		case "ResourceInUseException":
			return c.json({ error: err.message }, 409);

		case "ValidationException":
		case "SerializationException":
			return c.json({ error: err.message }, 400);

		case "ConditionalCheckFailedException":
			return c.json({ error: err.message }, 409);

		case "ProvisionedThroughputExceededException":
		case "RequestLimitExceeded":
		case "ThrottlingException":
			return c.json({ error: err.message }, 429);

		case "AccessDeniedException":
		case "UnrecognizedClientException":
			return c.json({ error: err.message }, 403);

		default:
			return c.json({ error: err.message }, 500);
	}
}
