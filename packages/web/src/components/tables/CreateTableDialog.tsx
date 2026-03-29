import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api-client";
import type { KeySchemaElement } from "@/lib/api-client";
import { useState } from "react";
import { toast } from "sonner";

interface CreateTableDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}

type AttributeType = "S" | "N" | "B";
type BillingMode = "PAY_PER_REQUEST" | "PROVISIONED";

export function CreateTableDialog({
	open,
	onOpenChange,
	onCreated,
}: CreateTableDialogProps) {
	const [tableName, setTableName] = useState("");
	const [partitionKeyName, setPartitionKeyName] = useState("");
	const [partitionKeyType, setPartitionKeyType] = useState<AttributeType>("S");
	const [hasSortKey, setHasSortKey] = useState(false);
	const [sortKeyName, setSortKeyName] = useState("");
	const [sortKeyType, setSortKeyType] = useState<AttributeType>("S");
	const [billingMode, setBillingMode] =
		useState<BillingMode>("PAY_PER_REQUEST");
	const [readCapacity, setReadCapacity] = useState("5");
	const [writeCapacity, setWriteCapacity] = useState("5");
	const [submitting, setSubmitting] = useState(false);

	const resetForm = () => {
		setTableName("");
		setPartitionKeyName("");
		setPartitionKeyType("S");
		setHasSortKey(false);
		setSortKeyName("");
		setSortKeyType("S");
		setBillingMode("PAY_PER_REQUEST");
		setReadCapacity("5");
		setWriteCapacity("5");
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!tableName.trim() || !partitionKeyName.trim()) {
			toast.error("Table name and partition key are required");
			return;
		}
		if (hasSortKey && !sortKeyName.trim()) {
			toast.error("Sort key name is required when sort key is enabled");
			return;
		}

		setSubmitting(true);
		try {
			const keySchema: KeySchemaElement[] = [
				{ attributeName: partitionKeyName.trim(), keyType: "HASH" },
			];
			const attributeDefinitions = [
				{
					attributeName: partitionKeyName.trim(),
					attributeType: partitionKeyType,
				},
			];

			if (hasSortKey && sortKeyName.trim()) {
				keySchema.push({
					attributeName: sortKeyName.trim(),
					keyType: "RANGE",
				});
				attributeDefinitions.push({
					attributeName: sortKeyName.trim(),
					attributeType: sortKeyType,
				});
			}

			await api.createTable({
				tableName: tableName.trim(),
				keySchema,
				attributeDefinitions,
				billingMode,
				...(billingMode === "PROVISIONED" && {
					readCapacityUnits: Number.parseInt(readCapacity, 10),
					writeCapacityUnits: Number.parseInt(writeCapacity, 10),
				}),
			});

			toast.success(`Table "${tableName.trim()}" created`);
			resetForm();
			onCreated();
		} catch (err) {
			toast.error(
				`Failed to create table: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!value) resetForm();
				onOpenChange(value);
			}}
		>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Create Table</DialogTitle>
						<DialogDescription>
							Create a new DynamoDB table with a partition key and optional sort
							key.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						{/* Table name */}
						<div className="space-y-2">
							<Label htmlFor="table-name">Table Name</Label>
							<Input
								id="table-name"
								value={tableName}
								onChange={(e) => setTableName(e.target.value)}
								placeholder="my-table"
							/>
						</div>

						{/* Partition key */}
						<div className="space-y-2">
							<Label>Partition Key</Label>
							<div className="flex gap-2">
								<Input
									value={partitionKeyName}
									onChange={(e) => setPartitionKeyName(e.target.value)}
									placeholder="Attribute name"
									className="flex-1"
								/>
								<Select
									value={partitionKeyType}
									onValueChange={(v) => {
										if (v !== null) setPartitionKeyType(v as AttributeType);
									}}
								>
									<SelectTrigger className="w-20">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="S">S</SelectItem>
										<SelectItem value="N">N</SelectItem>
										<SelectItem value="B">B</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						{/* Sort key toggle */}
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="has-sort-key"
								checked={hasSortKey}
								onChange={(e) => setHasSortKey(e.target.checked)}
								className="size-4 rounded border-input accent-primary"
							/>
							<Label htmlFor="has-sort-key">Add sort key</Label>
						</div>

						{/* Sort key */}
						{hasSortKey && (
							<div className="space-y-2">
								<Label>Sort Key</Label>
								<div className="flex gap-2">
									<Input
										value={sortKeyName}
										onChange={(e) => setSortKeyName(e.target.value)}
										placeholder="Attribute name"
										className="flex-1"
									/>
									<Select
										value={sortKeyType}
										onValueChange={(v) => {
											if (v !== null) setSortKeyType(v as AttributeType);
										}}
									>
										<SelectTrigger className="w-20">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="S">S</SelectItem>
											<SelectItem value="N">N</SelectItem>
											<SelectItem value="B">B</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						)}

						{/* Billing mode */}
						<div className="space-y-2">
							<Label>Billing Mode</Label>
							<Select
								value={billingMode}
								onValueChange={(v) => {
									if (v !== null) setBillingMode(v as BillingMode);
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="PAY_PER_REQUEST">
										Pay per request
									</SelectItem>
									<SelectItem value="PROVISIONED">Provisioned</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Provisioned capacity */}
						{billingMode === "PROVISIONED" && (
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="read-capacity">Read Capacity</Label>
									<Input
										id="read-capacity"
										type="number"
										min="1"
										value={readCapacity}
										onChange={(e) => setReadCapacity(e.target.value)}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="write-capacity">Write Capacity</Label>
									<Input
										id="write-capacity"
										type="number"
										min="1"
										value={writeCapacity}
										onChange={(e) => setWriteCapacity(e.target.value)}
									/>
								</div>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={submitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? "Creating..." : "Create Table"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
