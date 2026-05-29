import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient, unwrap } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatBytes, truncate } from "@/lib/utils";
import { Server, HardDrive, CheckCircle2, XCircle, Database, Plus } from "lucide-react";

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

function ConnectNodeDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const qc = useQueryClient();

  const connect = useMutation({
    mutationFn: async () => {
      const addrs = text.split("\n").map((l) => l.trim()).filter(Boolean);
      if (addrs.length === 0) throw new Error("Enter at least one node address");
      const res = await unwrap(getClient().POST("/v2/ConnectClusterNodes", { body: addrs }));
      return { addrs, res: res ?? [] };
    },
    onSuccess: ({ addrs, res }) => {
      qc.invalidateQueries({ queryKey: ["cluster"] });
      const failed = res
        .map((r, i) => ({ r, addr: addrs[i] ?? `#${i + 1}` }))
        .filter(({ r }) => !r.success);
      const ok = res.length - failed.length;
      if (ok > 0) toast({ title: `Connected to ${ok} node${ok === 1 ? "" : "s"}` });
      failed.forEach(({ r, addr }) =>
        toast({ title: `Failed: ${truncate(addr, 30)}`, description: r.error ?? "Unknown error", variant: "destructive" })
      );
      if (failed.length === 0) onClose();
    },
    onError: (e: Error) => toast({ title: "Connect failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Connect Cluster Nodes</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Enter node RPC addresses, one per line, in the form{" "}
          <code className="text-foreground">&lt;node-id&gt;@&lt;host&gt;:&lt;port&gt;</code>.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"abcd1234…@192.168.1.10:3901\nef567890…@192.168.1.11:3901"}
          rows={4}
          autoFocus
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => connect.mutate()} disabled={!text.trim() || connect.isPending}>Connect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-xs break-all">{value}</span>
    </div>
  );
}

function NodeDetailDialog({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const info = useQuery({
    queryKey: ["node-info", nodeId],
    queryFn: async () => {
      const data = await unwrap(getClient().GET("/v2/GetNodeInfo", { params: { query: { node: nodeId } } }));
      return { success: data?.success?.[nodeId] ?? null, error: data?.error?.[nodeId] ?? null };
    },
  });
  const stats = useQuery({
    queryKey: ["node-stats", nodeId],
    queryFn: async () => {
      const data = await unwrap(getClient().GET("/v2/GetNodeStatistics", { params: { query: { node: nodeId } } }));
      return { success: data?.success?.[nodeId] ?? null, error: data?.error?.[nodeId] ?? null };
    },
  });

  const node = info.data?.success;
  const stat = stats.data?.success;
  const nodeErr = info.data?.error;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm break-all">{node?.hostname ?? truncate(nodeId, 24)}</DialogTitle>
        </DialogHeader>

        {info.isLoading ? (
          <LoadingState label="Loading node info…" />
        ) : info.error ? (
          <ErrorState error={info.error as Error} />
        ) : nodeErr ? (
          <p className="text-sm text-destructive py-2">{nodeErr}</p>
        ) : node ? (
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Node Info</CardTitle></CardHeader>
              <CardContent className="divide-y">
                <StatRow label="Node ID" value={truncate(node.nodeId, 32)} />
                <StatRow label="Hostname" value={node.hostname ?? "—"} />
                <StatRow label="Garage Version" value={node.garageVersion} />
                <StatRow label="DB Engine" value={node.dbEngine} />
                <StatRow label="Rust Version" value={node.rustVersion} />
                {node.garageFeatures && node.garageFeatures.length > 0 && (
                  <StatRow
                    label="Features"
                    value={<span className="flex flex-wrap justify-end gap-1">{node.garageFeatures.map((f) => <Badge key={f} variant="outline">{f}</Badge>)}</span>}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Statistics</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {stats.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading statistics…</p>
                ) : stats.error ? (
                  <ErrorState error={stats.error as Error} />
                ) : stats.data?.error ? (
                  <p className="text-sm text-destructive">{stats.data.error}</p>
                ) : stat ? (
                  <>
                    {stat.blockManagerStats && (
                      <div className="divide-y">
                        <StatRow label="RC entries" value={stat.blockManagerStats.rcEntries.toLocaleString()} />
                        <StatRow label="Resync queue" value={stat.blockManagerStats.resyncQueueLen.toLocaleString()} />
                        <StatRow label="Resync errors" value={stat.blockManagerStats.resyncErrors.toLocaleString()} />
                      </div>
                    )}
                    {stat.tableStats && stat.tableStats.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/40">
                              {["Table", "Items", "Merkle", "GC Queue", "Insert Queue"].map((h) => (
                                <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {stat.tableStats.map((t) => (
                              <tr key={t.tableName} className="border-b last:border-0">
                                <td className="px-3 py-1.5 font-mono">{t.tableName}</td>
                                <td className="px-3 py-1.5">{t.items.toLocaleString()}</td>
                                <td className="px-3 py-1.5">{t.merkleItems.toLocaleString()}</td>
                                <td className="px-3 py-1.5">{t.gcQueueLen.toLocaleString()}</td>
                                <td className="px-3 py-1.5">{t.insertQueueLen.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {stat.freeform?.trim() && (
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/40 rounded p-3 max-h-64 overflow-auto">{stat.freeform}</pre>
                    )}
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ClusterPage() {
  const status = useClusterStatus();
  const health = useClusterHealth();
  const stats = useClusterStats();
  const [connectOpen, setConnectOpen] = useState(false);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);

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
      <PageHeader
        title="Cluster"
        description="Live cluster status and node health"
        actions={<Button size="sm" onClick={() => setConnectOpen(true)}><Plus className="h-4 w-4" />Connect Node</Button>}
      />
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
                        <td className="px-4 py-3 font-mono text-xs">
                          <button
                            className="text-primary hover:underline text-left"
                            onClick={() => setDetailNodeId(node.id)}
                            title="View node details"
                          >
                            {truncate(node.id, 16)}
                          </button>
                        </td>
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

      {connectOpen && <ConnectNodeDialog onClose={() => setConnectOpen(false)} />}
      {detailNodeId && <NodeDetailDialog nodeId={detailNodeId} onClose={() => setDetailNodeId(null)} />}
    </div>
  );
}
