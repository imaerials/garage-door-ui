import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, FolderOpen, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { truncate } from "@/lib/utils";

function useBuckets() {
  return useQuery({
    queryKey: ["buckets"],
    queryFn: async () => {
      const { data, error } = await getClient().GET("/v2/ListBuckets");
      if (error) throw new Error(JSON.stringify(error));
      return data ?? [];
    },
  });
}

function CreateBucketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await getClient().POST("/v2/CreateBucket", {
        body: { globalAlias: name || null },
      });
      if (error) throw new Error(JSON.stringify(error));
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
            <Input id="bname" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-bucket" className="mt-1" />
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

function DeleteBucketDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await getClient().POST("/v2/DeleteBucket", {
        params: { query: { id } },
      });
      if (error) throw new Error(JSON.stringify(error));
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
        <DialogHeader><DialogTitle>Delete Bucket?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Permanently delete bucket <span className="font-mono text-foreground">{truncate(id, 20)}</span>.
          The bucket must be empty first.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BucketsPage() {
  const { data: buckets, isLoading, error } = useBuckets();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (isLoading) return <LoadingState label="Loading buckets…" />;
  if (error) return <ErrorState error={error as Error} />;

  return (
    <div>
      <PageHeader
        title="Buckets"
        description={`${buckets?.length ?? 0} buckets`}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New Bucket</Button>}
      />
      <div className="p-8">
        {buckets?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
              <p>No buckets yet.</p>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>Create your first bucket</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {["Bucket ID", "Global Aliases", "Local Aliases", "Created", "Actions", ""].map((h, i) => (
                      <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buckets?.map((bucket) => (
                    <tr key={bucket.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{truncate(bucket.id, 20)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {bucket.globalAliases.map((a) => (
                            <Badge key={a} variant="secondary">{a}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {bucket.localAliases.map((a) => (
                            <Badge key={`${a.accessKeyId}/${a.alias}`} variant="outline">{a.alias}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(bucket.created).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/buckets/${bucket.id}`}>
                              <FolderOpen className="h-3.5 w-3.5" />Browse
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/buckets/${bucket.id}/settings`}>
                              <Settings className="h-3.5 w-3.5" />Manage
                            </Link>
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteId(bucket.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      <CreateBucketDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {deleteId && <DeleteBucketDialog id={deleteId} onClose={() => setDeleteId(null)} />}
    </div>
  );
}
