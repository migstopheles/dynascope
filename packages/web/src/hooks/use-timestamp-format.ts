import { useCallback, useEffect, useState } from "react";

type TimestampFormat = "unix" | "human";

const STORAGE_KEY = "dynascope-timestamp-format";

function readStored(): TimestampFormat {
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored === "human" ? "human" : "unix";
}

export function useTimestampFormat() {
	const [format, setFormatState] = useState<TimestampFormat>(() => readStored());

	const setFormat = useCallback((f: TimestampFormat) => {
		setFormatState(f);
		localStorage.setItem(STORAGE_KEY, f);
		window.dispatchEvent(new Event("dynascope-timestamp-format-change"));
	}, []);

	const toggleFormat = useCallback(() => {
		setFormat(format === "unix" ? "human" : "unix");
	}, [format, setFormat]);

	// Stay in sync if other components flip the value
	useEffect(() => {
		const handler = () => setFormatState(readStored());
		window.addEventListener("dynascope-timestamp-format-change", handler);
		return () =>
			window.removeEventListener("dynascope-timestamp-format-change", handler);
	}, []);

	return { format, setFormat, toggleFormat };
}

export function isTimestampColumn(col: string): boolean {
	return /(_at|At)$/.test(col);
}

export function formatHumanTimestamp(value: unknown): string | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	// Heuristic: treat large values as milliseconds, smaller as seconds.
	// 1e12 ≈ year 33658 in seconds, year 2001 in ms.
	const ms = value > 1e12 ? value : value * 1000;
	const date = new Date(ms);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleString();
}
