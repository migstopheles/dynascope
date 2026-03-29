# Dynascope

A web-based management interface for Amazon DynamoDB. Built for local development, works with both [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) and real AWS instances.

## Quick Start

```bash
npx dynascope --endpoint http://localhost:8000
```

This starts the Dynascope web interface on [http://localhost:3567](http://localhost:3567), connected to DynamoDB Local running on port 8000.

### Options

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--endpoint <url>` | `-e` | *(none)* | DynamoDB endpoint URL |
| `--port <number>` | `-p` | `3567` | Port for the Dynascope web server |
| `--region <region>` | `-r` | `us-east-1` | AWS region |
| `--profile <name>` | | *(none)* | AWS credentials profile |
| `--open` | `-o` | `false` | Open browser automatically |

### Examples

Connect to DynamoDB Local:

```bash
npx dynascope -e http://localhost:8000
```

Connect to a real AWS instance:

```bash
npx dynascope --region eu-west-1 --profile my-profile
```

Use a custom port and auto-open the browser:

```bash
npx dynascope -e http://localhost:8000 -p 4000 --open
```

### Running DynamoDB Local

If you don't already have DynamoDB Local running, you can start it with Docker:

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

## Features

- **Table management** -- list, inspect, create, and delete tables
- **Schema viewer** -- key schema, attribute definitions, GSIs, LSIs, billing and capacity info
- **Item explorer** -- scan and query with pagination, create/edit/delete items
- **Query builder** -- select index, set partition and sort key conditions with comparison operators
- **Partition key autocomplete** -- samples existing values for quick querying
- **JSON editor** -- Monaco-based editor with toggle between plain JSON and DynamoDB JSON (with type descriptors)
- **Bulk operations** -- multi-select items for batch delete
- **Connection management** -- switch endpoints and credentials at runtime without restarting
- **Dark mode** -- light, dark, and system theme with one-click toggle
- **Resizable columns** -- drag column headers to resize

## Development

### Prerequisites

- Node.js >= 20
- Docker (for DynamoDB Local)

### Setup

```bash
git clone <repo-url>
cd dynascope
npm install
```

### Start DynamoDB Local

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts DynamoDB Local on port 8000 with persistent storage.

### Dev Mode

```bash
npm run dev
```

This runs two processes concurrently:

- **Vite dev server** on [http://localhost:5173](http://localhost:5173) with hot module replacement
- **API server** on [http://localhost:3567](http://localhost:3567) with auto-reload via `tsx watch`

Open [http://localhost:5173](http://localhost:5173) in your browser. The Vite dev server proxies `/api/*` requests to the backend.

The API server runs with `--inspect` enabled, so you can attach a Node.js debugger on port 9229.

### Production Build

```bash
npm run build
```

This builds the frontend (Vite) and backend (tsup), then copies the static assets into the CLI package. Test the production bundle:

```bash
node packages/cli/dist/index.js --endpoint http://localhost:8000
```

### Project Structure

```
packages/
  api/    @dynascope/api   Hono REST API (table CRUD, item operations, connection management)
  cli/    dynascope         CLI entry point, HTTP server, static file serving
  web/    @dynascope/web   React SPA (Vite + Tailwind CSS + shadcn/ui)
```

The three packages are connected via npm workspaces. `api` is a pure Hono router exported as a library -- `cli` imports it and serves it alongside the built frontend assets. This separation is designed so that `api` can later be imported by an Electron app without changes.

### Key Technologies

- **Backend**: [Hono](https://hono.dev/) + AWS SDK v3
- **Frontend**: React 19, Vite, Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com/)
- **CLI**: Commander.js
- **Build**: tsup (backend), Vite (frontend)
- **Linting**: Biome

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev servers (frontend + backend) |
| `npm run build` | Production build |
| `npm run lint` | Lint with Biome |
| `npm run lint:fix` | Lint and auto-fix |

## License

MIT
