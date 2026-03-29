import { ConnectionSettings } from "@/components/connection/ConnectionSettings";
import { CreateTableDialog } from "@/components/tables/CreateTableDialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api-client";
import type { TableSummary } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
	Database,
	Monitor,
	Moon,
	PanelLeft,
	PanelLeftClose,
	Plus,
	Settings,
	Sun,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

interface ShellProps {
	children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
	const [tables, setTables] = useState<TableSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [connected, setConnected] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
	const { theme, cycleTheme } = useTheme();
	const location = useLocation();

	const fetchTables = useCallback(async () => {
		try {
			const result = await api.listTables();
			setTables(result);
			setConnected(true);
		} catch {
			setConnected(false);
			setTables([]);
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

	const handleConnectionUpdated = () => {
		fetchTables();
	};

	const activeTable = location.pathname.startsWith("/tables/")
		? decodeURIComponent(location.pathname.split("/tables/")[1])
		: null;

	return (
		<div className="flex h-screen overflow-hidden">
			{/* Sidebar */}
			<aside
				className={cn(
					"flex h-full flex-col border-r bg-sidebar transition-all duration-200",
					sidebarOpen ? "w-[250px]" : "w-0 overflow-hidden",
				)}
			>
				{/* Sidebar header */}
				<div className="flex h-12 items-center justify-between px-3">
					<div className="flex items-center gap-2">
						<Database className="size-4 text-sidebar-primary" />
						<span className="font-heading text-sm font-semibold text-sidebar-foreground">
							Dynascope
						</span>
					</div>
					<div className="flex items-center gap-1">
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										variant="ghost"
										size="icon-xs"
										onClick={() => setConnectionDialogOpen(true)}
									/>
								}
							>
								<div className="relative">
									<Settings className="size-3.5 text-sidebar-foreground/70" />
									<span
										className={cn(
											"absolute -top-0.5 -right-0.5 size-1.5 rounded-full",
											connected ? "bg-green-500" : "bg-red-500",
										)}
									/>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								{connected ? "Connected" : "Disconnected"} - Click to configure
							</TooltipContent>
						</Tooltip>
					</div>
				</div>

				<Separator className="bg-sidebar-border" />

				{/* Table list */}
				<ScrollArea className="flex-1">
					<div className="p-2">
						{loading ? (
							<div className="px-2 py-4 text-center text-xs text-sidebar-foreground/60">
								Loading tables...
							</div>
						) : tables.length === 0 ? (
							<div className="px-2 py-4 text-center text-xs text-sidebar-foreground/60">
								{connected ? "No tables found" : "Not connected"}
							</div>
						) : (
							<nav className="flex flex-col gap-0.5">
								{tables?.map((table) => (
									<Link
										key={table.tableName}
										to={`/tables/${encodeURIComponent(table.tableName)}`}
										className={cn(
											"flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
											activeTable === table.tableName &&
												"bg-sidebar-accent font-medium text-sidebar-accent-foreground",
										)}
									>
										<Database className="size-3.5 shrink-0 text-sidebar-foreground/70" />
										<span className="truncate">{table.tableName}</span>
									</Link>
								))}
							</nav>
						)}
					</div>
				</ScrollArea>

				<Separator className="bg-sidebar-border" />

				{/* Sidebar footer */}
				<div className="p-2">
					<Button
						variant="outline"
						size="sm"
						className="w-full justify-start gap-2"
						onClick={() => setCreateDialogOpen(true)}
					>
						<Plus className="size-3.5" />
						Create Table
					</Button>
				</div>
			</aside>

			{/* Main content */}
			<div className="flex flex-1 flex-col overflow-hidden">
				{/* Top bar with sidebar toggle */}
				<div className="flex h-12 items-center justify-between border-b px-3">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => setSidebarOpen(!sidebarOpen)}
								/>
							}
						>
							{sidebarOpen ? (
								<PanelLeftClose className="size-4" />
							) : (
								<PanelLeft className="size-4" />
							)}
						</TooltipTrigger>
						<TooltipContent>
							{sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={cycleTheme}
								/>
							}
						>
							{theme === "light" ? (
								<Sun className="size-4" />
							) : theme === "dark" ? (
								<Moon className="size-4" />
							) : (
								<Monitor className="size-4" />
							)}
						</TooltipTrigger>
						<TooltipContent>
							Theme: {theme} (click to cycle)
						</TooltipContent>
					</Tooltip>
				</div>

				{/* Page content */}
				<main className="flex-1 overflow-y-auto p-4">{children}</main>
			</div>

			{/* Dialogs */}
			<CreateTableDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
				onCreated={handleTableCreated}
			/>
			<ConnectionSettings
				open={connectionDialogOpen}
				onOpenChange={setConnectionDialogOpen}
				onUpdated={handleConnectionUpdated}
			/>
		</div>
	);
}
