import { Badge } from "@/components/ui/badge";
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
import { api } from "@/lib/api-client";
import type { ConnectionInfo } from "@/lib/api-client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface ConnectionSettingsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onUpdated: () => void;
}

export function ConnectionSettings({
	open,
	onOpenChange,
	onUpdated,
}: ConnectionSettingsProps) {
	const [endpoint, setEndpoint] = useState("");
	const [region, setRegion] = useState("");
	const [accessKeyId, setAccessKeyId] = useState("");
	const [secretAccessKey, setSecretAccessKey] = useState("");
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<
		"unknown" | "connected" | "error"
	>("unknown");
	const [connectionError, setConnectionError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			fetchConnection();
		}
	}, [open]);

	const fetchConnection = async () => {
		setLoading(true);
		try {
			const info: ConnectionInfo = await api.getConnection();
			setEndpoint(info.endpoint ?? "");
			setRegion(info.region ?? "");
			// Don't fill in credentials from the server (they're masked)
			setAccessKeyId("");
			setSecretAccessKey("");
		} catch {
			// Connection info not available
		} finally {
			setLoading(false);
		}
	};

	const handleTest = async () => {
		setTesting(true);
		setConnectionStatus("unknown");
		setConnectionError(null);
		try {
			const result = await api.testConnection();
			if (result.ok) {
				setConnectionStatus("connected");
				toast.success("Connection successful");
			} else {
				setConnectionStatus("error");
				setConnectionError(result.error ?? "Connection failed");
				toast.error(result.error ?? "Connection failed");
			}
		} catch (err) {
			setConnectionStatus("error");
			const message =
				err instanceof Error ? err.message : "Connection test failed";
			setConnectionError(message);
			toast.error(message);
		} finally {
			setTesting(false);
		}
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			await api.updateConnection({
				endpoint: endpoint || undefined,
				region: region || undefined,
				accessKeyId: accessKeyId || undefined,
				secretAccessKey: secretAccessKey || undefined,
			});
			toast.success("Connection settings updated");
			onUpdated();
			onOpenChange(false);
		} catch (err) {
			toast.error(
				`Failed to update connection: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Connection Settings</DialogTitle>
					<DialogDescription>
						Configure the DynamoDB connection endpoint and credentials.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-4 text-center text-sm text-muted-foreground">
						Loading settings...
					</div>
				) : (
					<div className="space-y-4">
						{/* Connection status */}
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground">Status:</span>
							{connectionStatus === "connected" && (
								<Badge variant="secondary" className="text-green-600">
									Connected
								</Badge>
							)}
							{connectionStatus === "error" && (
								<Badge variant="destructive">Error</Badge>
							)}
							{connectionStatus === "unknown" && (
								<Badge variant="outline">Unknown</Badge>
							)}
						</div>
						{connectionError && (
							<p className="text-xs text-destructive">{connectionError}</p>
						)}

						{/* Endpoint */}
						<div className="space-y-2">
							<Label htmlFor="conn-endpoint">Endpoint URL</Label>
							<Input
								id="conn-endpoint"
								value={endpoint}
								onChange={(e) => setEndpoint(e.target.value)}
								placeholder="http://localhost:8000"
							/>
						</div>

						{/* Region */}
						<div className="space-y-2">
							<Label htmlFor="conn-region">Region</Label>
							<Input
								id="conn-region"
								value={region}
								onChange={(e) => setRegion(e.target.value)}
								placeholder="us-east-1"
							/>
						</div>

						{/* Access Key ID */}
						<div className="space-y-2">
							<Label htmlFor="conn-access-key">
								Access Key ID{" "}
								<span className="text-muted-foreground">(optional)</span>
							</Label>
							<Input
								id="conn-access-key"
								value={accessKeyId}
								onChange={(e) => setAccessKeyId(e.target.value)}
								placeholder="Leave blank to use defaults"
							/>
						</div>

						{/* Secret Access Key */}
						<div className="space-y-2">
							<Label htmlFor="conn-secret-key">
								Secret Access Key{" "}
								<span className="text-muted-foreground">(optional)</span>
							</Label>
							<Input
								id="conn-secret-key"
								type="password"
								value={secretAccessKey}
								onChange={(e) => setSecretAccessKey(e.target.value)}
								placeholder="Leave blank to use defaults"
							/>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleTest}
						disabled={testing || saving}
					>
						{testing ? "Testing..." : "Test Connection"}
					</Button>
					<Button onClick={handleSave} disabled={saving || testing}>
						{saving ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
