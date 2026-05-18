import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import type { TableDescription } from "@/lib/api-client";
import { fromDynamoItem, isDynamoItem, toDynamoItem } from "@/lib/dynamo-json";
import Editor from "@monaco-editor/react";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface ItemEditorProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "edit";
	tableName: string;
	item?: Record<string, unknown>;
	tableDescription: TableDescription;
	onSaved: () => void;
	onDeleted: () => void;
}

type JsonFormat = "plain" | "dynamodb";

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

function formatItem(item: Record<string, unknown>, format: JsonFormat): string {
	if (format === "dynamodb") {
		return JSON.stringify(toDynamoItem(item), null, 2);
	}
	return JSON.stringify(item, null, 2);
}

function parseEditorValue(
	value: string,
	format: JsonFormat,
): { ok: true; item: Record<string, unknown> } | { ok: false; error: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch (err) {
		return {
			ok: false,
			error: `Invalid JSON: ${err instanceof Error ? err.message : "Parse error"}`,
		};
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { ok: false, error: "Value must be a JSON object" };
	}

	const obj = parsed as Record<string, unknown>;

	if (format === "dynamodb") {
		if (!isDynamoItem(obj)) {
			return {
				ok: false,
				error:
					'Invalid DynamoDB JSON. Each attribute must have a type descriptor (e.g. {"S": "value"})',
			};
		}
		return { ok: true, item: fromDynamoItem(obj) };
	}

	return { ok: true, item: obj };
}

export function ItemEditor({
	open,
	onOpenChange,
	mode,
	tableName,
	item,
	tableDescription,
	onSaved,
	onDeleted,
}: ItemEditorProps) {
	const [editorValue, setEditorValue] = useState("");
	const [format, setFormat] = useState<JsonFormat>("plain");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [isDark, setIsDark] = useState(
		document.documentElement.classList.contains("dark"),
	);

	// Watch for dark mode changes
	useEffect(() => {
		const observer = new MutationObserver(() => {
			setIsDark(document.documentElement.classList.contains("dark"));
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);

	// Initialize editor content when dialog opens
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-init only on open/mode/item change, not format
	useEffect(() => {
		if (!open) return;
		setJsonError(null);

		if (mode === "edit" && item) {
			setEditorValue(formatItem(item, format));
		} else {
			const template: Record<string, string> = {};
			if (tableDescription.keySchema) {
				for (const ks of tableDescription.keySchema) {
					template[ks.attributeName] = "";
				}
			}
			setEditorValue(formatItem(template, format));
		}
	}, [open, mode, item, tableDescription]);

	// Convert content when format toggle changes
	const handleFormatChange = (newFormat: JsonFormat) => {
		const result = parseEditorValue(editorValue, format);
		if (result.ok) {
			setEditorValue(formatItem(result.item, newFormat));
			setJsonError(null);
		}
		setFormat(newFormat);
	};

	const handleSave = async () => {
		const result = parseEditorValue(editorValue, format);
		if (!result.ok) {
			setJsonError(result.error);
			return;
		}
		setJsonError(null);

		setSaving(true);
		try {
			await api.putItem(tableName, result.item);
			toast.success(mode === "create" ? "Item created" : "Item updated");
			onSaved();
		} catch (err) {
			toast.error(
				`Failed to save item: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!item) return;

		setDeleting(true);
		try {
			const key = getKeyForItem(item, tableDescription);
			await api.deleteItem(tableName, key);
			toast.success("Item deleted");
			onDeleted();
		} catch (err) {
			toast.error(
				`Failed to delete item: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Create Item" : "Edit Item"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Enter the item data as JSON. Key attributes are required."
							: "Modify the item JSON below. Key attributes cannot be changed."}
					</DialogDescription>
				</DialogHeader>

				{/* Format toggle */}
				<div className="flex items-center gap-1 rounded-md border p-0.5 w-fit">
					<button
						type="button"
						className={`cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors ${
							format === "plain"
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => handleFormatChange("plain")}
					>
						JSON
					</button>
					<button
						type="button"
						className={`cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors ${
							format === "dynamodb"
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => handleFormatChange("dynamodb")}
					>
						DynamoDB JSON
					</button>
				</div>

				{/* Monaco editor */}
				<div className="overflow-hidden rounded-md border">
					<Editor
						height="400px"
						language="json"
						theme={isDark ? "vs-dark" : "vs-light"}
						value={editorValue}
						onChange={(value) => setEditorValue(value ?? "")}
						options={{
							minimap: { enabled: false },
							fontSize: 13,
							lineNumbers: "on",
							scrollBeyondLastLine: false,
							automaticLayout: true,
							tabSize: 2,
							wordWrap: "on",
							formatOnPaste: true,
							scrollbar: {
								verticalScrollbarSize: 8,
								horizontalScrollbarSize: 8,
							},
						}}
					/>
				</div>

				{jsonError && <p className="text-xs text-destructive">{jsonError}</p>}

				<DialogFooter>
					{mode === "edit" && (
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={deleting || saving}
							className="mr-auto gap-1.5"
						>
							<Trash2 className="size-3.5" />
							{deleting ? "Deleting..." : "Delete"}
						</Button>
					)}
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={saving || deleting}
					>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={saving || deleting}>
						{saving ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
