import { useCallback, useEffect, useState } from "react";

export const PAGE_SIZES = [10, 25, 50, 100, 200, 300] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

const STORAGE_KEY = "dynascope-page-size";
const DEFAULT_PAGE_SIZE: PageSize = 25;
const CHANGE_EVENT = "dynascope-page-size-change";

function readStored(): PageSize {
	const stored = localStorage.getItem(STORAGE_KEY);
	const n = stored == null ? Number.NaN : Number(stored);
	return (PAGE_SIZES as readonly number[]).includes(n)
		? (n as PageSize)
		: DEFAULT_PAGE_SIZE;
}

export function usePageSize() {
	const [pageSize, setPageSizeState] = useState<PageSize>(() => readStored());

	const setPageSize = useCallback((s: PageSize) => {
		setPageSizeState(s);
		localStorage.setItem(STORAGE_KEY, String(s));
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	useEffect(() => {
		const handler = () => setPageSizeState(readStored());
		window.addEventListener(CHANGE_EVENT, handler);
		return () => window.removeEventListener(CHANGE_EVENT, handler);
	}, []);

	return { pageSize, setPageSize };
}
