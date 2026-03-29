import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type {
	QueryParams,
	ScanResult,
	TableDescription,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
	ChevronLeft,
	ChevronRight,
	Copy,
	Plus,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ItemEditor } from "./ItemEditor";

interface ItemsExplorerProps {
	tableName: string;
	tableDescription: TableDescription;
}

type Mode = "scan" | "query";

type SortKeyOperator =
	| "="
	| "<"
	| ">"
	| "<="
	| ">="
	| "begins_with"
	| "between";

interface IndexOption {
	label: string;
	value: string;
	partitionKeyName: string;
	partitionKeyType: string;
	sortKeyName?: string;
	sortKeyType?: string;
}

function getIndexOptions(desc: TableDescription): IndexOption[] {
	const options: IndexOption[] = [];

	// Primary key
	if (desc.keySchema) {
		const pk = desc.keySchema.find((k) => k.keyType === "HASH");
		const sk = desc.keySchema.find((k) => k.keyType === "RANGE");
		if (pk) {
			const pkType =
				desc.attributeDefinitions?.find(
					(a) => a.attributeName === pk.attributeName,
				)?.attributeType ?? "S";
			const skType = sk
				? (desc.attributeDefinitions?.find(
						(a) => a.attributeName === sk.attributeName,
					)?.attributeType ?? "S")
				: undefined;
			options.push({
				label: `Table (${pk.attributeName}${sk ? `, ${sk.attributeName}` : ""})`,
				value: "__table__",
				partitionKeyName: pk.attributeName,
				partitionKeyType: pkType,
				sortKeyName: sk?.attributeName,
				sortKeyType: skType,
			});
		}
	}

	// GSIs
	if (desc.globalSecondaryIndexes) {
		for (const gsi of desc.globalSecondaryIndexes) {
			if (!gsi.indexName || !gsi.keySchema) continue;
			const pk = gsi.keySchema.find((k) => k.keyType === "HASH");
			const sk = gsi.keySchema.find((k) => k.keyType === "RANGE");
			if (pk) {
				const pkType =
					desc.attributeDefinitions?.find(
						(a) => a.attributeName === pk.attributeName,
					)?.attributeType ?? "S";
				const skType = sk
					? (desc.attributeDefinitions?.find(
							(a) => a.attributeName === sk.attributeName,
						)?.attributeType ?? "S")
					: undefined;
				options.push({
					label: `${gsi.indexName} (${pk.attributeName}${sk ? `, ${sk.attributeName}` : ""})`,
					value: gsi.indexName,
					partitionKeyName: pk.attributeName,
					partitionKeyType: pkType,
					sortKeyName: sk?.attributeName,
					sortKeyType: skType,
				});
			}
		}
	}

	return options;
}

function getKeyForItem(
	item: Record<string, unknown>,
	desc: TableDescription,
): Record<string, unknown> {
	const key: Record<string, unknown> = {};
	if (desc.keySchema) {
		for (const ks of desc.keySchema) {
			key[ks.attributeName] = item[ks.attributeName];
		}
	}
	return key;
}

export function ItemsExplorer({
	tableName,
	tableDescription,
}: ItemsExplorerProps) {
	const [mode, setMode] = useState<Mode>("scan");
	const [items, setItems] = useState<Record<string, unknown>[]>([]);
	const [loading, setLoading] = useState(false);
	const [lastEvaluatedKey, setLastEvaluatedKey] = useState<
		Record<string, unknown> | undefined
	>();
	const [keyStack, setKeyStack] = useState<
		(Record<string, unknown> | undefined)[]
	>([]);
	const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set());
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [batchDeleting, setBatchDeleting] = useState(false);

	// Editor state
	const [editorOpen, setEditorOpen] = useState(false);
	const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
	const [editingItem, setEditingItem] = useState<
		Record<string, unknown> | undefined
	>();

	// Query state
	const indexOptions = getIndexOptions(tableDescription);
	const [selectedIndex, setSelectedIndex] = useState(
		indexOptions[0]?.value ?? "__table__",
	);
	const [partitionKeyValue, setPartitionKeyValue] = useState("");
	const [sortKeyOperator, setSortKeyOperator] = useState<SortKeyOperator>("=");
	const [sortKeyValue, setSortKeyValue] = useState("");
	const [sortKeyValue2, setSortKeyValue2] = useState("");

	const currentIndex = indexOptions.find((o) => o.value === selectedIndex);

	// Sample PK values for autocomplete
	const [pkSuggestions, setPkSuggestions] = useState<string[]>([]);
	const [pkSuggestionsLoading, setPkSuggestionsLoading] = useState(false);
	const [pkSuggestionsIsSample, setPkSuggestionsIsSample] = useState(false);

	const currentPkName = currentIndex?.partitionKeyName;

	useEffect(() => {
		if (!currentPkName) return;
		let cancelled = false;
		setPkSuggestionsLoading(true);
		api
			.samplePartitionKeyValues(
				tableName,
				currentPkName,
				selectedIndex !== "__table__" ? selectedIndex : undefined,
			)
			.then((res) => {
				if (cancelled) return;
				setPkSuggestions(res.values);
				setPkSuggestionsIsSample(res.isSample);
			})
			.catch(() => {
				if (cancelled) return;
				setPkSuggestions([]);
			})
			.finally(() => {
				if (!cancelled) setPkSuggestionsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [tableName, selectedIndex, currentPkName]);

	const performScan = useCallback(
		async (startKey?: Record<string, unknown>) => {
			setLoading(true);
			try {
				const result = await api.scanItems(tableName, {
					limit: 25,
					exclusiveStartKey: startKey,
				});
				setItems(result.items);
				setLastEvaluatedKey(result.lastEvaluatedKey);
				setSelectedKeys(new Set());
			} catch (err) {
				toast.error(
					`Scan failed: ${err instanceof Error ? err.message : "Unknown error"}`,
				);
			} finally {
				setLoading(false);
			}
		},
		[tableName],
	);

	const performQuery = useCallback(
		async (startKey?: Record<string, unknown>) => {
			if (!currentIndex || !partitionKeyValue.trim()) {
				toast.error("Partition key value is required for queries");
				return;
			}

			setLoading(true);
			try {
				const pkName = currentIndex.partitionKeyName;
				const pkAttrName = "#pk";
				const pkAttrValue = ":pkval";

				let keyConditionExpression = `${pkAttrName} = ${pkAttrValue}`;
				const expressionAttributeNames: Record<string, string> = {
					[pkAttrName]: pkName,
				};
				const expressionAttributeValues: Record<string, unknown> = {
					[pkAttrValue]:
						currentIndex.partitionKeyType === "N"
							? Number(partitionKeyValue)
							: partitionKeyValue,
				};

				// Sort key condition
				if (currentIndex.sortKeyName && sortKeyValue.trim()) {
					const skAttrName = "#sk";
					const skAttrValue = ":skval";
					expressionAttributeNames[skAttrName] = currentIndex.sortKeyName;

					const skValue =
						currentIndex.sortKeyType === "N"
							? Number(sortKeyValue)
							: sortKeyValue;
					expressionAttributeValues[skAttrValue] = skValue;

					if (sortKeyOperator === "begins_with") {
						keyConditionExpression += ` AND begins_with(${skAttrName}, ${skAttrValue})`;
					} else if (sortKeyOperator === "between") {
						const skAttrValue2 = ":skval2";
						const skValue2 =
							currentIndex.sortKeyType === "N"
								? Number(sortKeyValue2)
								: sortKeyValue2;
						expressionAttributeValues[skAttrValue2] = skValue2;
						keyConditionExpression += ` AND ${skAttrName} BETWEEN ${skAttrValue} AND ${skAttrValue2}`;
					} else {
						keyConditionExpression += ` AND ${skAttrName} ${sortKeyOperator} ${skAttrValue}`;
					}
				}

				const params: QueryParams = {
					keyConditionExpression,
					expressionAttributeValues,
					expressionAttributeNames,
					limit: 25,
					exclusiveStartKey: startKey,
				};

				if (selectedIndex !== "__table__") {
					params.indexName = selectedIndex;
				}

				const result = await api.queryItems(tableName, params);
				setItems(result.items);
				setLastEvaluatedKey(result.lastEvaluatedKey);
				setSelectedKeys(new Set());
			} catch (err) {
				toast.error(
					`Query failed: ${err instanceof Error ? err.message : "Unknown error"}`,
				);
			} finally {
				setLoading(false);
			}
		},
		[
			tableName,
			currentIndex,
			partitionKeyValue,
			sortKeyOperator,
			sortKeyValue,
			sortKeyValue2,
			selectedIndex,
		],
	);

	// Load initial data
	useEffect(() => {
		if (mode === "scan") {
			setKeyStack([]);
			performScan();
		}
	}, [mode, performScan]);

	const handleRefresh = () => {
		setKeyStack([]);
		if (mode === "scan") {
			performScan();
		} else {
			performQuery();
		}
	};

	const handleNextPage = () => {
		if (!lastEvaluatedKey) return;
		setKeyStack((prev) => [...prev, lastEvaluatedKey]);
		if (mode === "scan") {
			performScan(lastEvaluatedKey);
		} else {
			performQuery(lastEvaluatedKey);
		}
	};

	const handlePreviousPage = () => {
		if (keyStack.length === 0) return;
		const newStack = [...keyStack];
		newStack.pop(); // remove current
		const previousKey =
			newStack.length > 0 ? newStack[newStack.length - 1] : undefined;
		setKeyStack(newStack);
		if (mode === "scan") {
			performScan(previousKey);
		} else {
			performQuery(previousKey);
		}
	};

	const handleCreateItem = () => {
		setEditorMode("create");
		setEditingItem(undefined);
		setEditorOpen(true);
	};

	const handleEditItem = (item: Record<string, unknown>) => {
		setEditorMode("edit");
		setEditingItem(item);
		setEditorOpen(true);
	};

	const handleItemSaved = () => {
		setEditorOpen(false);
		handleRefresh();
	};

	const handleItemDeleted = () => {
		setEditorOpen(false);
		handleRefresh();
	};

	const handleToggleSelect = (index: number) => {
		setSelectedKeys((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	};

	const handleToggleSelectAll = () => {
		if (selectedKeys.size === items.length) {
			setSelectedKeys(new Set());
		} else {
			setSelectedKeys(new Set(items.map((_, i) => i)));
		}
	};

	const handleBatchDelete = async () => {
		setBatchDeleting(true);
		try {
			const keysToDelete = Array.from(selectedKeys).map((index) =>
				getKeyForItem(items[index], tableDescription),
			);
			await api.batchDeleteItems(tableName, keysToDelete);
			toast.success(`Deleted ${keysToDelete.length} items`);
			setDeleteDialogOpen(false);
			setSelectedKeys(new Set());
			handleRefresh();
		} catch (err) {
			toast.error(
				`Batch delete failed: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setBatchDeleting(false);
		}
	};

	// Detect columns from items
	const columns = Array.from(
		items.reduce<Set<string>>((cols, item) => {
			for (const key of Object.keys(item)) {
				cols.add(key);
			}
			return cols;
		}, new Set()),
	);

	// Put key columns first
	const keyNames =
		tableDescription.keySchema?.map((k) => k.attributeName) ?? [];
	const sortedColumns = [
		...keyNames.filter((k) => columns.includes(k)),
		...columns.filter((c) => !keyNames.includes(c)),
	];

	const formatCellValue = (value: unknown): string => {
		if (value === null || value === undefined) return "";
		if (typeof value === "string") return value;
		if (typeof value === "number" || typeof value === "boolean")
			return String(value);
		return JSON.stringify(value);
	};

	// Column resizing
	const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
	const resizingRef = useRef<{
		col: string;
		startX: number;
		startWidth: number;
	} | null>(null);

	const handleResizeStart = useCallback(
		(col: string, e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const startX = e.clientX;
			const startWidth = columnWidths[col] ?? 150;
			resizingRef.current = { col, startX, startWidth };

			const handleMouseMove = (ev: MouseEvent) => {
				if (!resizingRef.current) return;
				const delta = ev.clientX - resizingRef.current.startX;
				const newWidth = Math.max(60, resizingRef.current.startWidth + delta);
				setColumnWidths((prev) => ({ ...prev, [col]: newWidth }));
			};

			const handleMouseUp = () => {
				resizingRef.current = null;
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		},
		[columnWidths],
	);

	return (
		<div className="space-y-4 pt-4">
			{/* Mode toggle */}
			<div className="flex items-center gap-2">
				<Button
					variant={mode === "scan" ? "default" : "outline"}
					size="sm"
					onClick={() => setMode("scan")}
				>
					Scan
				</Button>
				<Button
					variant={mode === "query" ? "default" : "outline"}
					size="sm"
					onClick={() => setMode("query")}
				>
					Query
				</Button>
			</div>

			{/* Query builder */}
			{mode === "query" && (
				<div className="space-y-3 rounded-lg border p-3">
					{/* Index selector */}
					{indexOptions.length > 1 && (
						<div className="space-y-1.5">
							<Label className="text-xs">Index</Label>
							<Select
								value={selectedIndex}
								onValueChange={(v) => {
									if (v !== null) setSelectedIndex(v);
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{indexOptions.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{/* Partition key */}
					{currentIndex && (
						<div className="space-y-1.5">
							<Label className="text-xs">
								Partition Key ({currentIndex.partitionKeyName} :{" "}
								{currentIndex.partitionKeyType})
							</Label>
							<AutocompleteInput
								value={partitionKeyValue}
								onChange={setPartitionKeyValue}
								suggestions={pkSuggestions}
								loading={pkSuggestionsLoading}
								placeholder={`Enter ${currentIndex.partitionKeyName} value`}
								hint={
									pkSuggestionsIsSample
										? "Showing sample values (table has more)"
										: undefined
								}
							/>
						</div>
					)}

					{/* Sort key condition */}
					{currentIndex?.sortKeyName && (
						<div className="space-y-1.5">
							<Label className="text-xs">
								Sort Key ({currentIndex.sortKeyName} :{" "}
								{currentIndex.sortKeyType})
							</Label>
							<div className="flex gap-2">
								<Select
									value={sortKeyOperator}
									onValueChange={(v) => {
										if (v !== null) setSortKeyOperator(v as SortKeyOperator);
									}}
								>
									<SelectTrigger className="w-36">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="=">=</SelectItem>
										<SelectItem value="<">&lt;</SelectItem>
										<SelectItem value=">">&gt;</SelectItem>
										<SelectItem value="<=">&lt;=</SelectItem>
										<SelectItem value=">=">&gt;=</SelectItem>
										<SelectItem value="begins_with">begins_with</SelectItem>
										<SelectItem value="between">between</SelectItem>
									</SelectContent>
								</Select>
								<Input
									value={sortKeyValue}
									onChange={(e) => setSortKeyValue(e.target.value)}
									placeholder="Value"
									className="flex-1"
								/>
								{sortKeyOperator === "between" && (
									<Input
										value={sortKeyValue2}
										onChange={(e) => setSortKeyValue2(e.target.value)}
										placeholder="Value 2"
										className="flex-1"
									/>
								)}
							</div>
						</div>
					)}

					<Button
						size="sm"
						className="gap-1.5"
						onClick={() => {
							setKeyStack([]);
							performQuery();
						}}
					>
						<Search className="size-3.5" />
						Run Query
					</Button>
				</div>
			)}

			{/* Action bar */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5"
						onClick={handleCreateItem}
					>
						<Plus className="size-3.5" />
						Create Item
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5"
						disabled={selectedKeys.size === 0}
						onClick={() => setDeleteDialogOpen(true)}
					>
						<Trash2 className="size-3.5" />
						Delete Selected ({selectedKeys.size})
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5"
						onClick={handleRefresh}
					>
						<RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
						Refresh
					</Button>
				</div>
				<span className="text-xs text-muted-foreground">
					{items.length} items
				</span>
			</div>

			{/* Results table */}
			{loading && items.length === 0 ? (
				<div className="flex items-center justify-center py-12">
					<p className="text-sm text-muted-foreground">Loading items...</p>
				</div>
			) : items.length === 0 ? (
				<div className="flex items-center justify-center py-12">
					<p className="text-sm text-muted-foreground">
						No items found.{" "}
						{mode === "query" ? "Try adjusting your query." : ""}
					</p>
				</div>
			) : (
				<div className="overflow-x-auto rounded-lg border">
					<Table style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10" style={{ width: 40 }}>
									<input
										type="checkbox"
										checked={
											selectedKeys.size === items.length && items.length > 0
										}
										onChange={handleToggleSelectAll}
										className="size-4 rounded border-input accent-primary"
									/>
								</TableHead>
								{sortedColumns.map((col) => (
									<TableHead
										key={col}
										className="group relative overflow-hidden border-r border-border/50"
										style={{ width: columnWidths[col] ?? 150, maxWidth: columnWidths[col] ?? 150 }}
									>
										<span
											className={cn(
												"block truncate font-mono text-xs pr-2",
												keyNames.includes(col) && "font-semibold",
											)}
										>
											{col}
											{keyNames.includes(col) && " *"}
										</span>
										{/* Resize handle */}
										<div
											role="separator"
											className="absolute right-0 top-0 h-full w-1.5 -translate-x-px cursor-col-resize bg-transparent group-hover:bg-primary/30 active:bg-primary/50"
											onMouseDown={(e) => handleResizeStart(col, e)}
										/>
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item, index) => (
								<TableRow
									key={JSON.stringify(getKeyForItem(item, tableDescription))}
									className="cursor-pointer"
									data-state={selectedKeys.has(index) ? "selected" : undefined}
									onClick={() => handleEditItem(item)}
								>
									<TableCell
										style={{ width: 40 }}
										onClick={(e) => {
											e.stopPropagation();
											handleToggleSelect(index);
										}}
									>
										<input
											type="checkbox"
											checked={selectedKeys.has(index)}
											onChange={() => handleToggleSelect(index)}
											className="size-4 rounded border-input accent-primary"
										/>
									</TableCell>
									{sortedColumns.map((col) => (
										<TableCell
											key={col}
											className="group/cell relative overflow-hidden font-mono text-xs"
											style={{ width: columnWidths[col] ?? 150, maxWidth: columnWidths[col] ?? 150 }}
										>
											<span className="block truncate pr-5">{formatCellValue(item[col])}</span>
											<button
												type="button"
												className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/cell:opacity-100"
												onClick={(e) => {
													e.stopPropagation();
													const val = formatCellValue(item[col]);
													navigator.clipboard.writeText(val);
													toast.success("Copied to clipboard");
												}}
											>
												<Copy className="size-3" />
											</button>
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Pagination */}
			<div className="flex items-center justify-between">
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					disabled={keyStack.length === 0}
					onClick={handlePreviousPage}
				>
					<ChevronLeft className="size-3.5" />
					Previous
				</Button>
				<span className="text-xs text-muted-foreground">
					Page {keyStack.length + 1}
				</span>
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					disabled={!lastEvaluatedKey}
					onClick={handleNextPage}
				>
					Next
					<ChevronRight className="size-3.5" />
				</Button>
			</div>

			{/* Item editor dialog */}
			<ItemEditor
				open={editorOpen}
				onOpenChange={setEditorOpen}
				mode={editorMode}
				tableName={tableName}
				item={editingItem}
				tableDescription={tableDescription}
				onSaved={handleItemSaved}
				onDeleted={handleItemDeleted}
			/>

			{/* Batch delete confirmation */}
			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Items</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete {selectedKeys.size} selected
							items? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeleteDialogOpen(false)}
							disabled={batchDeleting}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleBatchDelete}
							disabled={batchDeleting}
						>
							{batchDeleting
								? "Deleting..."
								: `Delete ${selectedKeys.size} Items`}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
