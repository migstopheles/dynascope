import { ItemsExplorer } from "@/components/items/ItemsExplorer";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import type { TableDescription } from "@/lib/api-client";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { TableSchema } from "./TableSchema";

export function TableDetailPage() {
	const { name } = useParams<{ name: string }>();
	const navigate = useNavigate();
	const [tableDescription, setTableDescription] =
		useState<TableDescription | null>(null);
	const [loading, setLoading] = useState(true);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const fetchTable = useCallback(async () => {
		if (!name) return;
		setLoading(true);
		try {
			const desc = await api.describeTable(name);
			setTableDescription(desc);
		} catch (err) {
			toast.error(
				`Failed to load table: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setLoading(false);
		}
	}, [name]);

	useEffect(() => {
		fetchTable();
	}, [fetchTable]);

	const handleDelete = async () => {
		if (!name) return;
		setDeleting(true);
		try {
			await api.deleteTable(name);
			toast.success(`Table "${name}" deleted`);
			navigate("/");
		} catch (err) {
			toast.error(
				`Failed to delete table: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setDeleting(false);
			setDeleteDialogOpen(false);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<p className="text-sm text-muted-foreground">Loading table...</p>
			</div>
		);
	}

	if (!tableDescription || !name) {
		return (
			<div className="flex items-center justify-center py-12">
				<p className="text-sm text-muted-foreground">Table not found</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h1 className="font-heading text-xl font-semibold">{name}</h1>
				<Button
					variant="destructive"
					size="sm"
					className="gap-1.5"
					onClick={() => setDeleteDialogOpen(true)}
				>
					<Trash2 className="size-3.5" />
					Delete Table
				</Button>
			</div>

			{/* Tabs */}
			<Tabs defaultValue="items">
				<TabsList>
					<TabsTrigger value="items">Items</TabsTrigger>
					<TabsTrigger value="schema">Schema</TabsTrigger>
				</TabsList>

				<TabsContent value="items">
					<ItemsExplorer tableName={name} tableDescription={tableDescription} />
				</TabsContent>

				<TabsContent value="schema">
					<TableSchema description={tableDescription} />
				</TabsContent>
			</Tabs>

			{/* Delete confirmation dialog */}
			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Table</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete the table "{name}"? This action
							cannot be undone and all data will be permanently lost.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeleteDialogOpen(false)}
							disabled={deleting}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={deleting}
						>
							{deleting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
