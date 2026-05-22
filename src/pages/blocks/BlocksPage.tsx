import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Search, RefreshCw, Trash2 } from "lucide-react";
import type { components } from "@/api/garage.d";

type BlockError = components["schemas"]["BlockError"];

function useBlockErrors() {
  return useQuery({
    queryKey: ["block-errors"],
    queryFn: async () => {
      const { data, error } = await getClient().GET("/v2/ListBlockErrors", {
        params: { query: { node: "*" } },
      });
      if (error) throw new Error(JSON.stringify(error));
      if (!data) return [] as BlockError[];
      // Flatten multi-node response
      const all: BlockError[] = [];
      for (const errors of Object.values(data.success)) {
        all.push(...errors);
      }
      return all;
    },
    refetchInterval: 30_000,
  });
}

function BlockErrorsPanel() {
  const { data: errors, isLoading, error, refetch } = useBlockErrors();
  const qc = useQueryClient();

  const retry = useMutation({
    mutationFn: async (hash: string) => {
      const { error } = await getClient().POST("/v2/RetryBlockResync", {
        params: { query: { node: "*" } },
        body: { blockHashes: [hash] },
      });
      if (error) throw new Error(JSON.stringify(error));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["block-errors"] }); toast({ title: "Resync queued" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const purge = useMutation({
    mutationFn: async (hash: string) => {
      const { error } = await getClient().POST("/v2/PurgeBlocks", {
        params: { query: { node: "*" } },
        body: [hash],
      });
      if (error) throw new Error(JSON.stringify(error));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["block-errors"] }); toast({ title: "Block purged" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <LoadingState label="Loading block errors…" />;
  if (error) return <ErrorState error={error as Error} />;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Block Errors ({errors?.length ?? 0})</CardTitle>
        <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
      </CardHeader>
      {(errors?.length ?? 0) === 0 ? (
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          No block errors detected.
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {["Block Hash", "Errors", "Last Try", "Next Try", "Refcount", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errors?.map((e) => (
                <tr key={e.blockHash} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs">{e.blockHash.slice(0, 24)}…</td>
                  <td className="px-4 py-3 text-destructive">{e.errorCount}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{e.lastTrySecsAgo}s ago</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">in {e.nextTryInSecs}s</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.refcount}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => retry.mutate(e.blockHash)}>
                        <RefreshCw className="h-3 w-3" />Retry
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => purge.mutate(e.blockHash)}>
                        <Trash2 className="h-3 w-3" />Purge
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function InspectObjectPanel() {
  const [bucketId, setBucketId] = useState("");
  const [key, setKey] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const inspect = useMutation({
    mutationFn: async () => {
      const { data, error } = await getClient().GET("/v2/InspectObject", {
        params: { query: { bucketId, key } },
      });
      if (error) throw new Error(JSON.stringify(error));
      return data;
    },
    onSuccess: (data) => setResult(JSON.stringify(data, null, 2)),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Inspect Object</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="inspect-bucket">Bucket ID</Label>
            <Input id="inspect-bucket" value={bucketId} onChange={(e) => setBucketId(e.target.value)} placeholder="bucket-id…" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="inspect-key">Object Key</Label>
            <Input id="inspect-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="path/to/object" className="mt-1" />
          </div>
        </div>
        <Button size="sm" onClick={() => inspect.mutate()} disabled={inspect.isPending || !bucketId || !key}>
          <Search className="h-4 w-4" />Inspect
        </Button>
        {result && (
          <div className="rounded-md bg-muted p-4 font-mono text-xs overflow-x-auto whitespace-pre">
            {result}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BlockInfoPanel() {
  const [hash, setHash] = useState("");
  const [node, setNode] = useState("self");
  const [result, setResult] = useState<string | null>(null);

  const getInfo = useMutation({
    mutationFn: async () => {
      const { data, error } = await getClient().POST("/v2/GetBlockInfo", {
        params: { query: { node } },
        body: { blockHash: hash },
      });
      if (error) throw new Error(JSON.stringify(error));
      return data;
    },
    onSuccess: (data) => setResult(JSON.stringify(data, null, 2)),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Block Info</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label htmlFor="block-hash">Block Hash</Label>
            <Input id="block-hash" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Block hash…" className="mt-1 font-mono text-xs" />
          </div>
          <div>
            <Label htmlFor="block-node">Node</Label>
            <Input id="block-node" value={node} onChange={(e) => setNode(e.target.value)} placeholder="self" className="mt-1" />
          </div>
        </div>
        <Button size="sm" onClick={() => getInfo.mutate()} disabled={getInfo.isPending || !hash}>
          <Search className="h-4 w-4" />Look up
        </Button>
        {result && (
          <div className="rounded-md bg-muted p-4 font-mono text-xs overflow-x-auto whitespace-pre">
            {result}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BlocksPage() {
  return (
    <div>
      <PageHeader title="Block Inspection" description="Inspect, repair, and manage storage blocks" />
      <div className="p-8">
        <Tabs defaultValue="errors">
          <TabsList>
            <TabsTrigger value="errors">Block Errors</TabsTrigger>
            <TabsTrigger value="inspect">Inspect Object</TabsTrigger>
            <TabsTrigger value="block-info">Block Info</TabsTrigger>
          </TabsList>
          <div className="mt-6 space-y-4">
            <TabsContent value="errors"><BlockErrorsPanel /></TabsContent>
            <TabsContent value="inspect"><InspectObjectPanel /></TabsContent>
            <TabsContent value="block-info"><BlockInfoPanel /></TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
