import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { TableDescription } from "@/lib/api-client";

interface TableSchemaProps {
	description: TableDescription;
}

export function TableSchema({ description }: TableSchemaProps) {
	return (
		<div className="space-y-6 pt-4">
			{/* Key Schema */}
			<section className="space-y-2">
				<h3 className="text-sm font-medium">Key Schema</h3>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Attribute Name</TableHead>
							<TableHead>Key Type</TableHead>
							<TableHead>Data Type</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{description.keySchema?.map((key) => {
							const attrDef = description.attributeDefinitions?.find(
								(a) => a.attributeName === key.attributeName,
							);
							return (
								<TableRow key={key.attributeName}>
									<TableCell className="font-mono text-xs">
										{key.attributeName}
									</TableCell>
									<TableCell>
										<Badge variant="secondary">{key.keyType}</Badge>
									</TableCell>
									<TableCell>
										<Badge variant="outline">
											{attrDef?.attributeType ?? "?"}
										</Badge>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</section>

			{/* Attribute Definitions */}
			<section className="space-y-2">
				<h3 className="text-sm font-medium">Attribute Definitions</h3>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Attribute Name</TableHead>
							<TableHead>Data Type</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{description.attributeDefinitions?.map((attr) => (
							<TableRow key={attr.attributeName}>
								<TableCell className="font-mono text-xs">
									{attr.attributeName}
								</TableCell>
								<TableCell>
									<Badge variant="outline">{attr.attributeType}</Badge>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</section>

			{/* Billing & Capacity */}
			<section className="space-y-2">
				<h3 className="text-sm font-medium">Billing & Capacity</h3>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Property</TableHead>
							<TableHead>Value</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						<TableRow>
							<TableCell>Billing Mode</TableCell>
							<TableCell>
								<Badge variant="secondary">
									{description.billingModeSummary?.billingMode ??
										"PAY_PER_REQUEST"}
								</Badge>
							</TableCell>
						</TableRow>
						{description.provisionedThroughput?.readCapacityUnits != null && (
							<TableRow>
								<TableCell>Read Capacity Units</TableCell>
								<TableCell>
									{description.provisionedThroughput.readCapacityUnits}
								</TableCell>
							</TableRow>
						)}
						{description.provisionedThroughput?.writeCapacityUnits != null && (
							<TableRow>
								<TableCell>Write Capacity Units</TableCell>
								<TableCell>
									{description.provisionedThroughput.writeCapacityUnits}
								</TableCell>
							</TableRow>
						)}
						{description.itemCount != null && (
							<TableRow>
								<TableCell>Item Count</TableCell>
								<TableCell>{description.itemCount}</TableCell>
							</TableRow>
						)}
						{description.tableSizeBytes != null && (
							<TableRow>
								<TableCell>Table Size</TableCell>
								<TableCell>{formatBytes(description.tableSizeBytes)}</TableCell>
							</TableRow>
						)}
						<TableRow>
							<TableCell>Status</TableCell>
							<TableCell>
								<Badge variant="outline">
									{description.tableStatus ?? "UNKNOWN"}
								</Badge>
							</TableCell>
						</TableRow>
					</TableBody>
				</Table>
			</section>

			{/* Global Secondary Indexes */}
			{description.globalSecondaryIndexes &&
				description.globalSecondaryIndexes.length > 0 && (
					<section className="space-y-2">
						<h3 className="text-sm font-medium">Global Secondary Indexes</h3>
						{description.globalSecondaryIndexes.map((gsi) => (
							<div
								key={gsi.indexName}
								className="space-y-2 rounded-lg border p-3"
							>
								<div className="text-sm font-medium">{gsi.indexName}</div>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Attribute Name</TableHead>
											<TableHead>Key Type</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{gsi.keySchema?.map((key) => (
											<TableRow key={key.attributeName}>
												<TableCell className="font-mono text-xs">
													{key.attributeName}
												</TableCell>
												<TableCell>
													<Badge variant="secondary">{key.keyType}</Badge>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
								{gsi.projection && (
									<div className="text-xs text-muted-foreground">
										Projection:{" "}
										<Badge variant="outline" className="ml-1">
											{gsi.projection.projectionType}
										</Badge>
										{gsi.projection.nonKeyAttributes &&
											gsi.projection.nonKeyAttributes.length > 0 && (
												<span className="ml-2">
													({gsi.projection.nonKeyAttributes.join(", ")})
												</span>
											)}
									</div>
								)}
							</div>
						))}
					</section>
				)}

			{/* Local Secondary Indexes */}
			{description.localSecondaryIndexes &&
				description.localSecondaryIndexes.length > 0 && (
					<section className="space-y-2">
						<h3 className="text-sm font-medium">Local Secondary Indexes</h3>
						{description.localSecondaryIndexes.map((lsi) => (
							<div
								key={lsi.indexName}
								className="space-y-2 rounded-lg border p-3"
							>
								<div className="text-sm font-medium">{lsi.indexName}</div>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Attribute Name</TableHead>
											<TableHead>Key Type</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{lsi.keySchema?.map((key) => (
											<TableRow key={key.attributeName}>
												<TableCell className="font-mono text-xs">
													{key.attributeName}
												</TableCell>
												<TableCell>
													<Badge variant="secondary">{key.keyType}</Badge>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
								{lsi.projection && (
									<div className="text-xs text-muted-foreground">
										Projection:{" "}
										<Badge variant="outline" className="ml-1">
											{lsi.projection.projectionType}
										</Badge>
										{lsi.projection.nonKeyAttributes &&
											lsi.projection.nonKeyAttributes.length > 0 && (
												<span className="ml-2">
													({lsi.projection.nonKeyAttributes.join(", ")})
												</span>
											)}
									</div>
								)}
							</div>
						))}
					</section>
				)}
		</div>
	);
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
