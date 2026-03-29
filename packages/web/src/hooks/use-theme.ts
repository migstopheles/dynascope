import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function applyTheme(theme: Theme) {
	const resolved = theme === "system" ? getSystemTheme() : theme;
	document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(() => {
		const stored = localStorage.getItem("dynascope-theme");
		return (stored as Theme) ?? "system";
	});

	const setTheme = useCallback((t: Theme) => {
		setThemeState(t);
		localStorage.setItem("dynascope-theme", t);
		applyTheme(t);
	}, []);

	// Apply on mount and listen for system theme changes
	useEffect(() => {
		applyTheme(theme);

		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => {
			if (theme === "system") applyTheme("system");
		};
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [theme]);

	const cycleTheme = useCallback(() => {
		setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
	}, [theme, setTheme]);

	return { theme, setTheme, cycleTheme };
}
