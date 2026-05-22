import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Eye, EyeOff, Copy, Info, FolderOpen } from "lucide-react";
import { truncate } from "@/lib/utils";
import { Link } from "react-router-dom";

function useKeys() {
  return useQuery({
    queryKey: ["keys"],
    queryFn: async () => {
      const { data, error } = await getClient().GET("/v2/ListKeys");
      if (error) throw new Error(JSON.stringify(error));
      return data ?? [];
    },
  });
}

function CreateKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ accessKeyId: string; secretAccessKey?: string | null } | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await getClient().POST("/v2/CreateKey", { body: { name } });
      if (error) throw new Error(JSON.stringify(error));
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["keys"] });
      if (data) setCreated({ accessKeyId: data.accessKeyId, secretAccessKey: data.secretAccessKey });
    },
    onError: (e: Error) => toast({ title: "Failed to create key", description: e.message, variant: "destructive" }),
  });

  const close = () => { setCreated(null); setName(""); setShowSecret(false); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{created ? "Key Created" : "Create Access Key"}</DialogTitle></DialogHeader>
        {!created ? (
          <>
            <div className="space-y-3 py-2">
              <div>
                <Label htmlFor="kname">Key Name</Label>
                <Input id="kname" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app-key" className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !name}>Create</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4 py-2 text-sm">
              <p className="text-muted-foreground">Copy these credentials now — the secret will not be shown again.</p>
              <div>
                <Label>Access Key ID</Label>
                <div className="flex gap-2 mt-1">
                  <Input readOnly value={created.accessKeyId} className="font-mono text-xs" />
                  <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(created.accessKeyId)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Secret Access Key</Label>
                <div className="flex gap-2 mt-1">
                  <Input readOnly type={showSecret ? "text" : "password"} value={created.secretAccessKey ?? ""} className="font-mono text-xs" />
                  <Button size="icon" variant="ghost" onClick={() => setShowSecret((s) => !s)}>
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(created.secretAccessKey ?? "")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteKeyDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await getClient().POST("/v2/DeleteKey", {
        params: { query: { id } },
      });
      if (error) throw new Error(JSON.stringify(error));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["keys"] }); toast({ title: "Key deleted" }); onClose(); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete Key?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Permanently delete key <span className="font-mono text-foreground">{truncate(id, 20)}</span>.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyDetailDialog({ keyId, onClose }: { keyId: string; onClose: () => void }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["key-info", keyId],
    queryFn: async () => {
      const { data, error } = await getClient().GET("/v2/GetKeyInfo", {
        params: { query: { id: keyId } },
      });
      if (error) throw new Error(JSON.stringify(error));
      return data!;
    },
  });

  const updateCreateBucket = useMutation({
    mutationFn: async (grant: boolean) => {
      const { error } = await getClient().POST("/v2/UpdateKey", {
        params: { query: { id: keyId } },
        body: grant ? { allow: { createBucket: true } } : { deny: { createBucket: true } },
      });
      if (error) throw new Error(JSON.stringify(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["key-info", keyId] }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const permBadge = (on: boolean | undefined, label: string) =>
    on ? <Badge key={label} variant="secondary" className="text-xs">{label}</Badge> : null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Key Details</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : data ? (
          <div className="space-y-5 py-1">

            {/* Identity */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Key ID</span>
                <span className="font-mono text-xs">{data.accessKeyId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span>{data.name || "—"}</span>
              </div>
              {data.created && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(data.created).toLocaleString()}</span>
                </div>
              )}
              {data.expiration && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expires</span>
                  <span className={new Date(data.expiration) < new Date() ? "text-destructive" : ""}>
                    {new Date(data.expiration).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Can create buckets</span>
                <Switch
                  checked={!!data.permissions.createBucket}
                  disabled={updateCreateBucket.isPending}
                  onCheckedChange={(checked) => updateCreateBucket.mutate(checked)}
                />
              </div>
            </div>

            <Separator />

            {/* Bucket access */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Bucket Access ({data.buckets.length})
              </p>
              {data.buckets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No bucket permissions.</p>
              ) : (
                <div className="space-y-2">
                  {data.buckets.map((b) => {
                    const label = b.globalAliases[0] ?? b.localAliases[0] ?? truncate(b.id, 16);
                    return (
                      <div key={b.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs truncate" title={b.id}>{label}</span>
                          {b.globalAliases.length === 0 && b.localAliases.length === 0 && (
                            <span className="text-xs text-muted-foreground font-mono">{truncate(b.id, 12)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                          {permBadge(b.permissions.read, "read")}
                          {permBadge(b.permissions.write, "write")}
                          {permBadge(b.permissions.owner, "owner")}
                          <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" asChild title="Browse bucket">
                            <Link to={`/buckets/${b.id}`}><FolderOpen className="h-3.5 w-3.5" /></Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function KeysPage() {
  const { data: keys, isLoading, error } = useKeys();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  if (isLoading) return <LoadingState label="Loading access keys…" />;
  if (error) return <ErrorState error={error as Error} />;

  return (
    <div>
      <PageHeader
        title="Access Keys"
        description={`${keys?.length ?? 0} keys`}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New Key</Button>}
      />
      <div className="p-8">
        <Card>
          {keys?.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <p>No access keys.</p>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>Create first key</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {["Key ID", "Name", "Created", ""].map((h, i) => (
                      <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys?.map((key) => (
                    <tr key={key.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{key.id}</td>
                      <td className="px-4 py-3 text-muted-foreground">{key.name || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {key.created ? new Date(key.created).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setDetailId(key.id)}
                            title="Details"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(key.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      </div>
      <CreateKeyDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {deleteId && <DeleteKeyDialog id={deleteId} onClose={() => setDeleteId(null)} />}
      {detailId && <KeyDetailDialog keyId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
