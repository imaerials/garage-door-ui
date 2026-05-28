import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getClient, unwrap } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Play, Wrench, RefreshCw } from "lucide-react";
import type { components } from "@/api/garage.d";

type WorkerInfo = components["schemas"]["WorkerInfoResp"];

function useWorkers() {
  return useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const data = await unwrap(getClient().POST("/v2/ListWorkers", {
        params: { query: { node: "*" } },
        body: {},
      }));
      // Flatten multi-node response: combine all success arrays
      if (!data) return [] as WorkerInfo[];
      const allWorkers: WorkerInfo[] = [];
      for (const workers of Object.values(data.success)) {
        allWorkers.push(...workers);
      }
      return allWorkers;
    },
    refetchInterval: 10_000,
  });
}

const REPAIR_JOBS = [
  { id: "tables" as const, label: "Repair Tables", description: "Verify and repair metadata tables" },
  { id: "blocks" as const, label: "Repair Blocks", description: "Check block integrity and re-sync" },
  { id: "versions" as const, label: "Repair Versions", description: "Clean up incomplete object versions" },
  { id: "blockRefs" as const, label: "Repair Block Refs", description: "Fix block reference counts" },
  { id: "blockRc" as const, label: "Block RC Sync", description: "Synchronize block reference counters" },
  { id: "rebalance" as const, label: "Rebalance", description: "Rebalance data across nodes" },
];

function LaunchRepairDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [job, setJob] = useState<"tables" | "blocks" | "versions" | "blockRefs" | "blockRc" | "rebalance">("tables");

  const launch = useMutation({
    mutationFn: async () => {
      await unwrap(getClient().POST("/v2/LaunchRepairOperation", {
        params: { query: { node: "*" } },
        body: { repairType: job },
      }));
    },
    onSuccess: () => { toast({ title: "Repair launched" }); onClose(); },
    onError: (e: Error) => toast({ title: "Failed to launch", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Launch Repair Operation</DialogTitle></DialogHeader>
        <div className="space-y-2 py-2">
          {REPAIR_JOBS.map((r) => (
            <label
              key={r.id}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${job === r.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
            >
              <input
                type="radio" name="repair" value={r.id}
                checked={job === r.id} onChange={() => setJob(r.id)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.description}</p>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => launch.mutate()} disabled={launch.isPending}>
            <Play className="h-4 w-4" />Launch on all nodes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MaintenancePanel() {
  const [repairOpen, setRepairOpen] = useState(false);
  const [bucketId, setBucketId] = useState("");
  const [olderThanDays, setOlderThanDays] = useState("1");

  const cleanupUploads = useMutation({
    mutationFn: async () => {
      await unwrap(getClient().POST("/v2/CleanupIncompleteUploads", {
        body: { bucketId, olderThanSecs: Number(olderThanDays) * 86400 },
      }));
    },
    onSuccess: () => toast({ title: "Cleanup started" }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const snapshot = useMutation({
    mutationFn: async () => {
      await unwrap(getClient().POST("/v2/CreateMetadataSnapshot", {
        params: { query: { node: "*" } },
      }));
    },
    onSuccess: () => toast({ title: "Snapshot created" }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Repair Operations</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">Launch background repair jobs across all nodes.</p>
          <Button size="sm" onClick={() => setRepairOpen(true)}><Wrench className="h-4 w-4" />Launch Repair</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Cleanup Uploads</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Remove abandoned incomplete multipart uploads.</p>
          <div>
            <Label htmlFor="cleanup-bucket">Bucket ID</Label>
            <Input id="cleanup-bucket" value={bucketId} onChange={(e) => setBucketId(e.target.value)} placeholder="bucket-id" className="mt-1 text-xs" />
          </div>
          <div>
            <Label htmlFor="cleanup-age">Older than (days)</Label>
            <Input id="cleanup-age" type="number" value={olderThanDays} onChange={(e) => setOlderThanDays(e.target.value)} className="mt-1 text-xs" />
          </div>
          <Button size="sm" variant="outline" onClick={() => cleanupUploads.mutate()} disabled={cleanupUploads.isPending || !bucketId}>
            <RefreshCw className="h-4 w-4" />Cleanup
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Metadata Snapshot</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">Create a snapshot of current metadata state on all nodes.</p>
          <Button size="sm" variant="outline" onClick={() => snapshot.mutate()} disabled={snapshot.isPending}>
            <Play className="h-4 w-4" />Snapshot
          </Button>
        </CardContent>
      </Card>
      <LaunchRepairDialog open={repairOpen} onClose={() => setRepairOpen(false)} />
    </div>
  );
}

function WorkerVariableForm() {
  const [varName, setVarName] = useState("");
  const [varValue, setVarValue] = useState("");
  const [node, setNode] = useState("*");

  const set = useMutation({
    mutationFn: async () => {
      await unwrap(getClient().POST("/v2/SetWorkerVariable", {
        params: { query: { node } },
        body: { variable: varName, value: varValue },
      }));
    },
    onSuccess: () => toast({ title: "Variable set" }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Set Worker Variable</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div><Label>Node</Label><Input value={node} onChange={(e) => setNode(e.target.value)} placeholder="* or node-id" className="mt-1" /></div>
          <div><Label>Variable</Label><Input value={varName} onChange={(e) => setVarName(e.target.value)} className="mt-1" /></div>
          <div><Label>Value</Label><Input value={varValue} onChange={(e) => setVarValue(e.target.value)} className="mt-1" /></div>
        </div>
        <Button size="sm" onClick={() => set.mutate()} disabled={set.isPending || !varName}>Set Variable</Button>
      </CardContent>
    </Card>
  );
}

export function WorkersPage() {
  const { data: workers, isLoading, error } = useWorkers();

  if (isLoading) return <LoadingState label="Loading workers…" />;
  if (error) return <ErrorState error={error as Error} />;

  return (
    <div>
      <PageHeader title="Workers & Maintenance" description="Background workers and maintenance operations" />
      <div className="p-8 space-y-8">
        <Tabs defaultValue="workers">
          <TabsList>
            <TabsTrigger value="workers">Workers</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="variables">Variables</TabsTrigger>
          </TabsList>

          <TabsContent value="workers" className="mt-6">
            <Card>
              {(workers?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">No workers found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {["ID", "Name", "Status", "Queue", "Errors"].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {workers?.map((w) => (
                        <tr key={w.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground text-xs">{w.id}</td>
                          <td className="px-4 py-3 font-medium">{w.name}</td>
                          <td className="px-4 py-3">
                            <Badge variant={w.state === "busy" ? "default" : w.consecutiveErrors > 0 ? "destructive" : "secondary"}>
                              {w.state === "busy" ? "busy" : typeof w.state === "object" ? "throttled" : w.consecutiveErrors > 0 ? "error" : w.state}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{w.queueLength ?? 0}</td>
                          <td className="px-4 py-3 text-muted-foreground">{w.consecutiveErrors}/{w.errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="maintenance" className="mt-6">
            <MaintenancePanel />
          </TabsContent>

          <TabsContent value="variables" className="mt-6">
            <WorkerVariableForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
