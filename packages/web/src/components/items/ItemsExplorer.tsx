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
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Copy,
	Plus,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type SortDirection = "asc" | "desc";

function compareValues(a: unknown, b: unknown): number {
	if (a == null && b == null) return 0;
	if (a == null) return 1;
	if (b == null) return -1;
	if (typeof a === "number" && typeof b === "number") return a - b;
	if (typeof a === "boolean" && typeof b === "boolean")
		return (a ? 1 : 0) - (b ? 1 : 0);
	const aStr = typeof a === "string" ? a : JSON.stringify(a);
	const bStr = typeof b === "string" ? b : JSON.stringify(b);
	if (aStr < bStr) return -1;
	if (aStr > bStr) return 1;
	return 0;
}

export function ItemsExplorer({
	tableName,
	tableDescription,
}: ItemsExplorerProps) {
	const [mode, setMode] = useState<Mode>("scan");
	const [pages, setPages] = useState<Record<string, unknown>[][]>([]);
	const [pageIndex, setPageIndex] = useState(0);
	const [loading, setLoading] = useState(false);
	const [lastEvaluatedKey, setLastEvaluatedKey] = useState<
		Record<string, unknown> | undefined
	>();
	const [sortColumn, setSortColumn] = useState<string | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
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
				if (startKey === undefined) {
					setPages([result.items]);
					setPageIndex(0);
					setSortColumn(null);
				} else {
					setPages((prev) => [...prev, result.items]);
				}
				setLastEvaluatedKey(result.lastEvaluatedKey);
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
				if (startKey === undefined) {
					setPages([result.items]);
					setPageIndex(0);
					setSortColumn(null);
				} else {
					setPages((prev) => [...prev, result.items]);
				}
				setLastEvaluatedKey(result.lastEvaluatedKey);
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
			performScan();
		}
	}, [mode, performScan]);

	// Clear selection when displayed items change
	useEffect(() => {
		setSelectedKeys(new Set());
	}, [pageIndex, sortColumn, sortDirection, pages]);

	const handleRefresh = () => {
		if (mode === "scan") {
			performScan();
		} else {
			performQuery();
		}
	};

	const handleSort = (col: string) => {
		if (sortColumn === col) {
			setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortColumn(col);
			setSortDirection("asc");
		}
		setPageIndex(0);
	};

	const sortedItems = useMemo(() => {
		if (sortColumn === null) return null;
		const all = pages.flat();
		all.sort((a, b) => {
			const cmp = compareValues(a[sortColumn], b[sortColumn]);
			return sortDirection === "asc" ? cmp : -cmp;
		});
		return all;
	}, [pages, sortColumn, sortDirection]);

	const pageSize = pages[0]?.length ?? 25;
	const totalLoadedItems = useMemo(
		() => pages.reduce((sum, p) => sum + p.length, 0),
		[pages],
	);
	const totalLoadedPages = sortedItems
		? Math.max(1, Math.ceil(totalLoadedItems / pageSize))
		: Math.max(1, pages.length);

	const items: Record<string, unknown>[] = sortedItems
		? sortedItems.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
		: (pages[pageIndex] ?? []);

	const canGoNextLoaded = pageIndex + 1 < totalLoadedPages;
	const canGoNext = canGoNextLoaded || !!lastEvaluatedKey;
	const canGoPrevious = pageIndex > 0;

	const handleNextPage = async () => {
		if (canGoNextLoaded) {
			setPageIndex(pageIndex + 1);
			return;
		}
		if (!lastEvaluatedKey) return;
		if (mode === "scan") {
			await performScan(lastEvaluatedKey);
		} else {
			await performQuery(lastEvaluatedKey);
		}
		setPageIndex((p) => p + 1);
	};

	const handlePreviousPage = () => {
		if (!canGoPrevious) return;
		setPageIndex(pageIndex - 1);
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

	// Detect columns from all loaded items so the column set stays stable
	// as you paginate or change sort.
	const columns = useMemo(() => {
		const set = new Set<string>();
		for (const page of pages) {
			for (const item of page) {
				for (const key of Object.keys(item)) {
					set.add(key);
				}
			}
		}
		return Array.from(set);
	}, [pages]);

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
						onClick={() => performQuery()}
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
										className="size-4 cursor-pointer rounded border-input accent-primary"
									/>
								</TableHead>
								{sortedColumns.map((col) => (
									<TableHead
										key={col}
										className="group relative overflow-hidden border-r border-border/50 p-0"
										style={{ width: columnWidths[col] ?? 150, maxWidth: columnWidths[col] ?? 150 }}
									>
										<button
											type="button"
											onClick={() => handleSort(col)}
											className="flex h-10 w-full cursor-pointer items-center px-2 text-left hover:bg-muted/40"
										>
											<span
												className={cn(
													"block flex-1 truncate font-mono text-xs",
													sortColumn === col ? "pr-6" : "pr-3",
													keyNames.includes(col) && "font-semibold",
												)}
											>
												{col}
												{keyNames.includes(col) && " *"}
											</span>
										</button>
										{sortColumn === col && (
											<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												{sortDirection === "asc" ? (
													<ChevronUp className="size-3.5" />
												) : (
													<ChevronDown className="size-3.5" />
												)}
											</span>
										)}
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
											className="size-4 cursor-pointer rounded border-input accent-primary"
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
												className="absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/cell:opacity-100"
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
					disabled={!canGoPrevious}
					onClick={handlePreviousPage}
				>
					<ChevronLeft className="size-3.5" />
					Previous
				</Button>
				<span className="text-xs text-muted-foreground">
					Page {pageIndex + 1}
				</span>
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					disabled={!canGoNext || loading}
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
