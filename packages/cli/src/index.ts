import { Command } from "commander";

const program = new Command();

program
	.name("dynascope")
	.description("A web interface for Amazon DynamoDB")
	.version("0.1.0")
	.option("-p, --port <number>", "server port", "3567")
	.option("-e, --endpoint <url>", "DynamoDB endpoint URL")
	.option("-r, --region <region>", "AWS region", "us-east-1")
	.option("--profile <name>", "AWS profile name")
	.option("-o, --open", "auto-open browser after starting")
	.action(async (opts) => {
		const { createApi } = await import("@dynascope/api");
		const { startServer } = await import("./server.js");

		const config = {
			port: Number.parseInt(opts.port, 10),
			endpoint: opts.endpoint as string | undefined,
			region: opts.region as string,
			profile: opts.profile as string | undefined,
			open: opts.open as boolean | undefined,
		};

		const api = createApi({
			endpoint: config.endpoint,
			region: config.region,
			profile: config.profile,
		});

		await startServer({ api, ...config });
	});

program.parse();
