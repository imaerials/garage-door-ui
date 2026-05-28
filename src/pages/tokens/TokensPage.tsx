import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient, unwrap } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Copy, ShieldCheck } from "lucide-react";
import { truncate } from "@/lib/utils";

function useTokens() {
  return useQuery({
    queryKey: ["tokens"],
    queryFn: async () => (await unwrap(getClient().GET("/v2/ListAdminTokens"))) ?? [],
  });
}

function CreateTokenDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [secretToken, setSecretToken] = useState<string | null>(null);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const body: { name: string; expiration?: string; neverExpires?: boolean } = { name };
      if (expiry) body.expiration = new Date(expiry).toISOString();
      else body.neverExpires = true;
      return unwrap(getClient().POST("/v2/CreateAdminToken", { body }));
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tokens"] });
      setSecretToken(data?.secretToken ?? null);
    },
    onError: (e: Error) => toast({ title: "Failed to create token", description: e.message, variant: "destructive" }),
  });

  const close = () => { setSecretToken(null); setName(""); setExpiry(""); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{secretToken ? "Token Created" : "Create Admin Token"}</DialogTitle></DialogHeader>
        {!secretToken ? (
          <>
            <div className="space-y-3 py-2">
              <div>
                <Label htmlFor="tname">Name</Label>
                <Input id="tname" value={name} onChange={(e) => setName(e.target.value)} placeholder="ci-deploy" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="texpiry">Expiration (optional — leave blank for no expiry)</Label>
                <Input id="texpiry" type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="mt-1" />
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
              <p className="text-muted-foreground">Copy this token now — it will not be shown again.</p>
              <div>
                <Label>Bearer Token</Label>
                <div className="flex gap-2 mt-1">
                  <Input readOnly value={secretToken} className="font-mono text-xs" />
                  <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(secretToken)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={close}>Done</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteTokenDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      await unwrap(getClient().POST("/v2/DeleteAdminToken", {
        params: { query: { id } },
      }));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tokens"] }); toast({ title: "Token deleted" }); onClose(); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete Token?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">Permanently revoke token <span className="font-mono text-foreground">{truncate(id, 20)}</span>.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>Revoke</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TokensPage() {
  const { data: tokens, isLoading, error } = useTokens();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (isLoading) return <LoadingState label="Loading admin tokens…" />;
  if (error) return <ErrorState error={error as Error} />;

  return (
    <div>
      <PageHeader
        title="Admin Tokens"
        description={`${tokens?.length ?? 0} tokens`}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New Token</Button>}
      />
      <div className="p-8">
        <Card>
          {tokens?.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mb-3 opacity-30" />
              <p>No admin tokens.</p>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>Create first token</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {["Token ID", "Name", "Expires", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tokens?.map((token) => {
                    const isExpired = token.expired;
                    return (
                      <tr key={token.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{truncate(token.id ?? "—", 20)}</td>
                        <td className="px-4 py-3">{token.name || "—"}</td>
                        <td className="px-4 py-3">
                          {token.expiration ? (
                            <Badge variant={isExpired ? "destructive" : "secondary"}>
                              {new Date(token.expiration).toLocaleDateString()}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Never</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(token.id ?? null)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <CreateTokenDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {deleteId && <DeleteTokenDialog id={deleteId} onClose={() => setDeleteId(null)} />}
    </div>
  );
}
