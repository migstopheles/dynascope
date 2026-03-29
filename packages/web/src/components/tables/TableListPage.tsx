import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { TableSummary } from "@/lib/api-client";
import { Database, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CreateTableDialog } from "./CreateTableDialog";

export function TableListPage() {
	const [tables, setTables] = useState<TableSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

	const fetchTables = useCallback(async () => {
		try {
			const result = await api.listTables();
			setTables(result);
		} catch {
			// Error handled by shell
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchTables();
	}, [fetchTables]);

	const handleTableCreated = () => {
		setCreateDialogOpen(false);
		fetchTables();
	};

	return (
		<div className="mx-auto max-w-2xl py-8">
			<div className="flex flex-col items-center gap-6 text-center">
				<div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
					<Database className="size-8 text-muted-foreground" />
				</div>

				<div className="space-y-2">
					<h1 className="font-heading text-2xl font-semibold">
						Welcome to Dynascope
					</h1>
					<p className="text-sm text-muted-foreground">
						A web interface for browsing and managing your DynamoDB tables.
						Select a table from the sidebar or create a new one to get started.
					</p>
				</div>

				{loading ? (
					<p className="text-sm text-muted-foreground">Loading tables...</p>
				) : (
					<div className="flex items-center gap-3">
						<span className="text-sm text-muted-foreground">
							{tables.length} {tables.length === 1 ? "table" : "tables"} found
						</span>
						<Button
							size="sm"
							onClick={() => setCreateDialogOpen(true)}
							className="gap-1.5"
						>
							<Plus className="size-3.5" />
							Create Table
						</Button>
					</div>
				)}

				{!loading && tables.length > 0 && (
					<div className="w-full max-w-md">
						<div className="rounded-lg border">
							{tables.map((table, i) => (
								<Link
									key={table.tableName}
									to={`/tables/${encodeURIComponent(table.tableName)}`}
									className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors hover:bg-muted ${
										i > 0 ? "border-t" : ""
									}`}
								>
									<Database className="size-4 text-muted-foreground" />
									{table.tableName}
								</Link>
							))}
						</div>
					</div>
				)}
			</div>

			<CreateTableDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
				onCreated={handleTableCreated}
			/>
		</div>
	);
}
