import { useQuery } from "@tanstack/react-query";
import { getClient, unwrap } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, truncate } from "@/lib/utils";
import { Server, HardDrive, CheckCircle2, XCircle, Database } from "lucide-react";

function useClusterStatus() {
  return useQuery({
    queryKey: ["cluster", "status"],
    queryFn: () => unwrap(getClient().GET("/v2/GetClusterStatus")),
    refetchInterval: 15_000,
  });
}

function useClusterHealth() {
  return useQuery({
    queryKey: ["cluster", "health"],
    queryFn: () => unwrap(getClient().GET("/v2/GetClusterHealth")),
    refetchInterval: 15_000,
  });
}

function useClusterStats() {
  return useQuery({
    queryKey: ["cluster", "statistics"],
    queryFn: () => unwrap(getClient().GET("/v2/GetClusterStatistics")),
    refetchInterval: 30_000,
  });
}

export function ClusterPage() {
  const status = useClusterStatus();
  const health = useClusterHealth();
  const stats = useClusterStats();

  if (status.isLoading) return <LoadingState label="Loading cluster status…" />;
  if (status.error) return <ErrorState error={status.error as Error} />;

  const nodes = status.data?.nodes ?? [];

  const storageNodes = nodes.filter((n) => n.dataPartition != null);
  const totalCapacity = storageNodes.reduce((s, n) => s + (n.dataPartition?.total ?? 0), 0);
  const totalAvailable = storageNodes.reduce((s, n) => s + (n.dataPartition?.available ?? 0), 0);
  const totalUsed = totalCapacity - totalAvailable;
  const usedPct = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;

  return (
    <div>
      <PageHeader title="Cluster" description="Live cluster status and node health" />
      <div className="p-8 space-y-6">

        {/* Storage summary */}
        {storageNodes.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" /> Storage Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total</p>
                  <p className="text-xl font-bold">{formatBytes(totalCapacity)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Used</p>
                  <p className="text-xl font-bold">{formatBytes(totalUsed)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Free</p>
                  <p className={`text-xl font-bold ${usedPct > 85 ? "text-destructive" : usedPct > 65 ? "text-yellow-500" : "text-green-600"}`}>
                    {formatBytes(totalAvailable)}
                  </p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{usedPct}% used</span>
                  <span>{formatBytes(totalAvailable)} free</span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${usedPct > 85 ? "bg-destructive" : usedPct > 65 ? "bg-yellow-500" : "bg-primary"}`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Health summary */}
        {health.data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Status", value: health.data.status, good: health.data.status === "healthy" },
              { label: "Nodes", value: `${health.data.connectedNodes} / ${health.data.knownNodes}` },
              { label: "Storage Nodes", value: `${health.data.storageNodesUp} / ${health.data.storageNodes}` },
              { label: "Partition Coverage", value: `${health.data.partitionsAllOk} / ${health.data.partitions}` },
            ].map(({ label, value, good }) => (
              <Card key={label}>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className={`text-xl font-bold mt-1 ${good === false ? "text-destructive" : good ? "text-green-600" : ""}`}>
                    {String(value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Layout version + stats */}
        <Card>
          <CardHeader><CardTitle className="text-base">Cluster Info</CardTitle></CardHeader>
          <CardContent className="flex gap-8 text-sm">
            <div><span className="text-muted-foreground">Layout Version: </span><strong>{status.data?.layoutVersion}</strong></div>
            {stats.data?.dataAvail != null && (
              <div><span className="text-muted-foreground">Data Available: </span><strong>{formatBytes(stats.data.dataAvail)}</strong></div>
            )}
            {stats.data?.totalObjectCount != null && (
              <div><span className="text-muted-foreground">Objects: </span><strong>{stats.data.totalObjectCount.toLocaleString()}</strong></div>
            )}
            {stats.data?.bucketCount != null && (
              <div><span className="text-muted-foreground">Buckets: </span><strong>{stats.data.bucketCount}</strong></div>
            )}
          </CardContent>
        </Card>

        {/* Node table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" /> Nodes ({nodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {["Node ID", "Hostname", "Zone", "Role", "Garage Version", "Status"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => {
                    const zone = node.role && "zone" in node.role ? node.role.zone : null;
                    const isStorage = node.role && "capacity" in node.role && node.role.capacity != null;
                    return (
                      <tr key={node.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{truncate(node.id, 16)}</td>
                        <td className="px-4 py-3">{node.hostname ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{zone ?? "—"}</td>
                        <td className="px-4 py-3">
                          {node.role
                            ? <Badge variant="secondary">{isStorage ? "Storage" : "Gateway"}</Badge>
                            : <Badge variant="outline">Unassigned</Badge>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{node.garageVersion ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {node.isUp
                              ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                              : <XCircle className="h-4 w-4 text-destructive" />}
                            <span className={node.isUp ? "text-green-600" : "text-destructive"}>
                              {node.isUp ? "Online" : `Offline${node.lastSeenSecsAgo != null ? ` (${node.lastSeenSecsAgo}s ago)` : ""}`}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Storage per node */}
        {nodes.some((n) => n.dataPartition != null) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <HardDrive className="h-4 w-4" /> Storage Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {nodes
                .filter((n) => n.dataPartition != null)
                .map((node) => {
                  const dp = node.dataPartition!;
                  const used = dp.total - dp.available;
                  const pct = dp.total > 0 ? Math.round((used / dp.total) * 100) : 0;
                  return (
                    <div key={node.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-mono text-xs">{node.hostname ?? truncate(node.id)}</span>
                        <span className="text-muted-foreground">{formatBytes(used)} / {formatBytes(dp.total)} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct > 85 ? "bg-destructive" : pct > 65 ? "bg-yellow-500" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
