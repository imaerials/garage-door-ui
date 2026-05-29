import { useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient, unwrap } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, FolderOpen, Settings, Archive, Copy, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { formatBytes, truncate } from "@/lib/utils";

function useBuckets() {
  return useQuery({
    queryKey: ["buckets"],
    queryFn: async () => (await unwrap(getClient().GET("/v2/ListBuckets"))) ?? [],
  });
}

// Fetch size/object stats for every bucket. Keyed identically to the detail and
// browser pages so the cache is shared across navigation.
function useBucketInfos(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["bucket-info", id],
      queryFn: async () => unwrap(getClient().GET("/v2/GetBucketInfo", { params: { query: { id } } })),
      staleTime: 60_000,
    })),
  });
}

function copyText(text: string, label: string) {
  navigator.clipboard?.writeText(text);
  toast({ title: `${label} copied` });
}

function CreateBucketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      await unwrap(getClient().POST("/v2/CreateBucket", {
        body: { globalAlias: name || null },
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buckets"] });
      toast({ title: "Bucket created" });
      setName("");
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed to create bucket", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Bucket</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="bname">Global Alias (optional)</Label>
            <Input
              id="bname" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="my-bucket" className="mt-1"
              onKeyDown={(e) => e.key === "Enter" && create.mutate()}
              autoFocus
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              A friendly cluster-wide name. You can add or change aliases later from the bucket's Manage page.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBucketDialog({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      await unwrap(getClient().POST("/v2/DeleteBucket", {
        params: { query: { id } },
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buckets"] });
      toast({ title: "Bucket deleted" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete bucket?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Permanently delete <span className="font-mono text-foreground">{name}</span>. The bucket must be empty first.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

export function BucketsPage() {
  const { data: buckets, isLoading, error } = useBuckets();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const ids = (buckets ?? []).map((b) => b.id);
  const infoResults = useBucketInfos(ids);
  const infoById = new Map(ids.map((id, i) => [id, infoResults[i]]));

  if (isLoading) return <LoadingState label="Loading buckets…" />;
  if (error) return <ErrorState error={error as Error} />;

  const friendlyName = (b: NonNullable<typeof buckets>[number]) =>
    b.globalAliases[0] ?? b.localAliases[0]?.alias ?? null;

  const q = query.trim().toLowerCase();
  const filtered = (buckets ?? []).filter((b) => {
    if (!q) return true;
    return (
      b.id.toLowerCase().includes(q) ||
      b.globalAliases.some((a) => a.toLowerCase().includes(q)) ||
      b.localAliases.some((a) => a.alias.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      <PageHeader
        title="Buckets"
        description={`${buckets?.length ?? 0} bucket${buckets?.length === 1 ? "" : "s"}`}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New Bucket</Button>}
      />
      <div className="p-8 space-y-5">
        {buckets?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 gap-4 text-center text-muted-foreground">
              <div className="rounded-full bg-muted p-3"><Archive className="h-7 w-7" /></div>
              <div>
                <p className="font-medium text-foreground">No buckets yet</p>
                <p className="text-sm mt-1">Create your first bucket to start storing objects.</p>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Create bucket</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, alias, or ID…"
                className="pl-9"
              />
            </div>

            {filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No buckets match “{query}”.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((bucket) => {
                  const name = friendlyName(bucket);
                  const display = name ?? truncate(bucket.id, 16);
                  const info = infoById.get(bucket.id);
                  const stats = info?.data;
                  const statsLoading = info?.isLoading;
                  return (
                    <Card key={bucket.id} className="flex flex-col overflow-hidden hover:border-primary/40 transition-colors">
                      <CardContent className="p-5 flex flex-col gap-3 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="rounded-md bg-primary/10 text-primary p-2 shrink-0">
                              <Archive className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold truncate" title={display}>{display}</p>
                              <button
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-mono mt-0.5"
                                onClick={() => copyText(bucket.id, "Bucket ID")}
                                title="Copy full bucket ID"
                              >
                                {truncate(bucket.id, 18)}<Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget({ id: bucket.id, name: display })}
                            title="Delete bucket"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {(bucket.globalAliases.length > 0 || bucket.localAliases.length > 0) && (
                          <div className="flex flex-wrap gap-1">
                            {bucket.globalAliases.map((a) => <Badge key={a} variant="secondary">{a}</Badge>)}
                            {bucket.localAliases.map((a) => (
                              <Badge key={`${a.accessKeyId}/${a.alias}`} variant="outline">{a.alias}</Badge>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 mt-auto pt-1">
                          <Stat label="Size" value={stats ? formatBytes(stats.bytes) : statsLoading ? "…" : "—"} />
                          <Stat label="Objects" value={stats ? stats.objects.toLocaleString() : statsLoading ? "…" : "—"} />
                        </div>
                      </CardContent>

                      <div className="flex border-t divide-x text-sm">
                        <Link
                          to={`/buckets/${bucket.id}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 font-medium text-primary hover:bg-muted/40 transition-colors"
                        >
                          <FolderOpen className="h-4 w-4" />Browse
                        </Link>
                        <Link
                          to={`/buckets/${bucket.id}/settings`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        >
                          <Settings className="h-4 w-4" />Manage
                        </Link>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <CreateBucketDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {deleteTarget && (
        <DeleteBucketDialog id={deleteTarget.id} name={deleteTarget.name} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
