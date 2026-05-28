import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient, unwrap } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, RotateCcw, History, Eye, AlertTriangle } from "lucide-react";
import { truncate } from "@/lib/utils";
import type { components } from "@/api/garage.d";

type NodeRoleChange = components["schemas"]["NodeRoleChange"];

function hasCapacity(role: NodeRoleChange): role is NodeRoleChange & { capacity?: number | null; zone: string } {
  return "zone" in role;
}

function useLayout() {
  return useQuery({
    queryKey: ["layout"],
    queryFn: () => unwrap(getClient().GET("/v2/GetClusterLayout")),
  });
}

function useLayoutHistory() {
  return useQuery({
    queryKey: ["layout-history"],
    queryFn: () => unwrap(getClient().GET("/v2/GetClusterLayoutHistory")),
  });
}

function CurrentLayout() {
  const { data: layout, isLoading, error } = useLayout();

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error as Error} />;

  const roles = layout?.roles ?? [];
  const staged = layout?.stagedRoleChanges ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Version</p>
            <p className="text-2xl font-bold mt-1">{layout?.version}</p>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Partition Size</p>
            <p className="text-2xl font-bold mt-1">{layout?.partitionSize != null ? `${Math.round(layout.partitionSize / 1024 / 1024)} MB` : "—"}</p>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Staged Changes</p>
            <p className={`text-2xl font-bold mt-1 ${staged.length > 0 ? "text-yellow-600" : ""}`}>{staged.length}</p>
          </CardContent>
        </Card>
      </div>

      {staged.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />Staged Changes (not yet applied)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {staged.map((r) => (
                <div key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{truncate(r.id)}</span>
                  {hasCapacity(r) ? (
                    <>
                      <Badge variant="warning">{r.zone}</Badge>
                      <span>{r.capacity != null ? `${r.capacity} bytes capacity` : "gateway"}</span>
                    </>
                  ) : (
                    <Badge variant="destructive">remove</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Current Roles ({roles.length})</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {["Node ID", "Zone", "Tags", "Capacity", "Stored Partitions"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs">{truncate(role.id, 20)}</td>
                  <td className="px-4 py-3"><Badge variant="secondary">{role.zone}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{role.tags.join(", ") || "—"}</td>
                  <td className="px-4 py-3">{role.capacity != null ? `${Math.round(role.capacity / 1024 / 1024 / 1024)} GB` : "gateway"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{role.storedPartitions ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function LayoutActions({ hasStagedChanges = false }: { hasStagedChanges?: boolean }) {
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const qc = useQueryClient();

  const apply = useMutation({
    mutationFn: async () => {
      const layout = await unwrap(getClient().GET("/v2/GetClusterLayout"));
      await unwrap(getClient().POST("/v2/ApplyClusterLayout", {
        body: { version: (layout?.version ?? 0) + 1 },
      }));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["layout"] }); toast({ title: "Layout applied" }); },
    onError: (e: Error) => toast({ title: "Failed to apply", description: e.message, variant: "destructive" }),
  });

  const revert = useMutation({
    mutationFn: async () => {
      await unwrap(getClient().POST("/v2/RevertClusterLayout"));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["layout"] }); toast({ title: "Layout reverted" }); },
    onError: (e: Error) => toast({ title: "Failed to revert", description: e.message, variant: "destructive" }),
  });

  const preview = useMutation({
    mutationFn: async () => {
      return unwrap(getClient().POST("/v2/PreviewClusterLayoutChanges"));
    },
    onSuccess: (data) => setPreviewResult(JSON.stringify(data, null, 2)),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => preview.mutate()}><Eye className="h-4 w-4" />Preview Changes</Button>
        {hasStagedChanges && (
          <>
            <Button size="sm" onClick={() => apply.mutate()} disabled={apply.isPending}>
              <CheckCircle className="h-4 w-4" />Apply Layout
            </Button>
            <Button size="sm" variant="outline" onClick={() => revert.mutate()} disabled={revert.isPending}>
              <RotateCcw className="h-4 w-4" />Revert
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => setSkipOpen(true)}>Skip Dead Nodes</Button>
      </div>
      {previewResult && (
        <div className="rounded-md bg-muted p-4 font-mono text-xs overflow-x-auto whitespace-pre">
          {previewResult}
        </div>
      )}
      <SkipDeadNodesDialog open={skipOpen} onClose={() => setSkipOpen(false)} />
    </div>
  );
}

function SkipDeadNodesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [version, setVersion] = useState("");
  const [allowMissing, setAllowMissing] = useState(false);
  const qc = useQueryClient();

  const skip = useMutation({
    mutationFn: async () => {
      await unwrap(getClient().POST("/v2/ClusterLayoutSkipDeadNodes", {
        body: { version: Number(version), allowMissingData: allowMissing },
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["layout"] });
      toast({ title: "Dead nodes skipped" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Skip Dead Nodes</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Apply the layout even if some nodes are currently offline.</p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="skip-version">Target Layout Version</Label>
            <Input id="skip-version" type="number" value={version} onChange={(e) => setVersion(e.target.value)} className="mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <input id="allow-missing" type="checkbox" checked={allowMissing} onChange={(e) => setAllowMissing(e.target.checked)} />
            <Label htmlFor="allow-missing">Allow missing data (unsafe)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => skip.mutate()} disabled={skip.isPending || !version}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LayoutHistory() {
  const { data: history, isLoading, error } = useLayoutHistory();

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error as Error} />;

  const versions = history?.versions ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <History className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Layout History ({versions.length})</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              {["Version", "Status", "Storage Nodes", "Gateway Nodes"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.version} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3"><Badge variant="outline">v{v.version}</Badge></td>
                <td className="px-4 py-3">
                  <Badge variant={v.status === "Current" ? "default" : v.status === "Draining" ? "warning" : "secondary"}>
                    {v.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{v.storageNodes}</td>
                <td className="px-4 py-3 text-muted-foreground">{v.gatewayNodes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function LayoutPage() {
  return (
    <div>
      <PageHeader title="Cluster Layout" description="Manage node roles, zones, and layout versions" />
      <div className="p-8">
        <Tabs defaultValue="current">
          <TabsList>
            <TabsTrigger value="current">Current Layout</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <div className="mt-6 space-y-4">
            <TabsContent value="current"><CurrentLayout /></TabsContent>
            <TabsContent value="actions">
              <Card>
                <CardHeader><CardTitle className="text-base">Layout Operations</CardTitle></CardHeader>
                <CardContent><LayoutActions /></CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="history"><LayoutHistory /></TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
