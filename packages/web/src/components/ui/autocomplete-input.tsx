import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

interface AutocompleteInputProps {
	value: string;
	onChange: (value: string) => void;
	suggestions: string[];
	loading?: boolean;
	placeholder?: string;
	hint?: string;
}

export function AutocompleteInput({
	value,
	onChange,
	suggestions,
	loading,
	placeholder,
	hint,
}: AutocompleteInputProps) {
	const [open, setOpen] = useState(false);
	const [focusIndex, setFocusIndex] = useState(-1);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const filtered = useMemo(() => {
		if (!value.trim()) return suggestions;
		const lower = value.toLowerCase();
		return suggestions.filter((s) => s.toLowerCase().includes(lower));
	}, [value, suggestions]);

	// Close on outside click
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (
				wrapperRef.current &&
				!wrapperRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	// Reset focus index when filtered list changes
	useEffect(() => {
		setFocusIndex(-1);
	}, [filtered]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!open || filtered.length === 0) {
			if (e.key === "ArrowDown" && suggestions.length > 0) {
				setOpen(true);
				e.preventDefault();
			}
			return;
		}

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setFocusIndex((i) => Math.min(i + 1, filtered.length - 1));
				break;
			case "ArrowUp":
				e.preventDefault();
				setFocusIndex((i) => Math.max(i - 1, 0));
				break;
			case "Enter":
				e.preventDefault();
				if (focusIndex >= 0 && focusIndex < filtered.length) {
					onChange(filtered[focusIndex]);
					setOpen(false);
				}
				break;
			case "Escape":
				setOpen(false);
				break;
		}
	};

	// Scroll focused item into view
	useEffect(() => {
		if (focusIndex < 0 || !listRef.current) return;
		const items = listRef.current.querySelectorAll("[data-item]");
		items[focusIndex]?.scrollIntoView({ block: "nearest" });
	}, [focusIndex]);

	return (
		<div ref={wrapperRef} className="relative">
			<Input
				ref={inputRef}
				value={value}
				onChange={(e) => {
					onChange(e.target.value);
					setOpen(true);
				}}
				onFocus={() => {
					if (suggestions.length > 0) setOpen(true);
				}}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
			/>
			{open && (filtered.length > 0 || loading || hint) && (
				<div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
					<div ref={listRef} className="max-h-48 overflow-y-auto p-1">
						{loading && (
							<div className="px-2 py-1.5 text-xs text-muted-foreground">
								Loading values...
							</div>
						)}
						{!loading && filtered.length === 0 && (
							<div className="px-2 py-1.5 text-xs text-muted-foreground">
								No matches
							</div>
						)}
						{filtered.map((item, i) => (
							<button
								key={item}
								type="button"
								data-item
								className={cn(
									"flex w-full items-center rounded-sm px-2 py-1.5 text-left font-mono text-xs transition-colors",
									i === focusIndex
										? "bg-accent text-accent-foreground"
										: "hover:bg-muted",
								)}
								onMouseEnter={() => setFocusIndex(i)}
								onClick={() => {
									onChange(item);
									setOpen(false);
									inputRef.current?.focus();
								}}
							>
								{item}
							</button>
						))}
					</div>
					{hint && (
						<div className="border-t px-2 py-1 text-[10px] text-muted-foreground">
							{hint}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
