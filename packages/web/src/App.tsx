import { Shell } from "@/components/layout/Shell";
import { TableDetailPage } from "@/components/tables/TableDetailPage";
import { TableListPage } from "@/components/tables/TableListPage";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Route, Routes } from "react-router-dom";

export function App() {
	return (
		<BrowserRouter>
			<TooltipProvider>
				<Shell>
					<Routes>
						<Route path="/" element={<TableListPage />} />
						<Route path="/tables/:name" element={<TableDetailPage />} />
					</Routes>
				</Shell>
				<Toaster />
			</TooltipProvider>
		</BrowserRouter>
	);
}
