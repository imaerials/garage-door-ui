import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Check, FolderOpen, Plus, Tag, Trash2, X,
} from "lucide-react";
import { getClient, unwrap } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatBytes, truncate } from "@/lib/utils";

function useBucketInfo(id: string) {
  return useQuery({
    queryKey: ["bucket-info", id],
    queryFn: async () => {
      return unwrap(getClient().GET("/v2/GetBucketInfo", {
        params: { query: { id } },
      }));
    },
  });
}

type BucketInfo = NonNullable<ReturnType<typeof useBucketInfo>["data"]>;

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Section({ title, description, children, actions }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {actions}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function OverviewSection({ info }: { info: BucketInfo }) {
  return (
    <Section title="Overview">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <StatCell label="Objects" value={info.objects.toLocaleString()} />
        <StatCell label="Size" value={formatBytes(info.bytes)} />
        <StatCell label="Unfinished uploads" value={info.unfinishedUploads.toLocaleString()} />
        <StatCell label="Multipart parts" value={info.unfinishedMultipartUploadParts.toLocaleString()} />
      </div>
      <Separator />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Bucket ID</p>
          <p className="font-mono text-xs mt-1 break-all">{info.id}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
          <p className="mt-1">{new Date(info.created).toLocaleString()}</p>
        </div>
      </div>
    </Section>
  );
}

function AliasesSection({ id, info }: { id: string; info: BucketInfo }) {
  const qc = useQueryClient();
  const [newGlobal, setNewGlobal] = useState("");
  const [newLocal, setNewLocal] = useState("");
  const [newLocalKey, setNewLocalKey] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bucket-info", id] });
    qc.invalidateQueries({ queryKey: ["buckets"] });
  };

  const addAlias = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      await unwrap(getClient().POST("/v2/AddBucketAlias", { body: body as never }));
    },
    onSuccess: () => { invalidate(); toast({ title: "Alias added" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const removeAlias = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      await unwrap(getClient().POST("/v2/RemoveBucketAlias", { body: body as never }));
    },
    onSuccess: () => { invalidate(); toast({ title: "Alias removed" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const localAliases = info.keys.flatMap((k) =>
    k.bucketLocalAliases.map((alias) => ({ accessKeyId: k.accessKeyId, alias, keyName: k.name }))
  );

  return (
    <Section
      title="Aliases"
      description="Friendly names that resolve to this bucket. Global aliases work cluster-wide; local aliases are scoped to an access key."
    >
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Global aliases</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {info.globalAliases.length === 0 && (
            <span className="text-sm text-muted-foreground">No global aliases.</span>
          )}
          {info.globalAliases.map((a) => (
            <Badge key={a} variant="secondary" className="gap-1.5 pr-1">
              {a}
              <button
                className="rounded-sm hover:bg-foreground/10 p-0.5"
                disabled={removeAlias.isPending}
                onClick={() => removeAlias.mutate({ bucketId: id, globalAlias: a })}
                title="Remove alias"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newGlobal.trim()) return;
            addAlias.mutate({ bucketId: id, globalAlias: newGlobal.trim() });
            setNewGlobal("");
          }}
        >
          <Input
            value={newGlobal}
            onChange={(e) => setNewGlobal(e.target.value)}
            placeholder="my-bucket"
            className="max-w-xs"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!newGlobal.trim() || addAlias.isPending}>
            <Plus className="h-3.5 w-3.5" />Add global alias
          </Button>
        </form>
      </div>

      <Separator />

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Local aliases</p>
        <div className="space-y-1.5 mb-3">
          {localAliases.length === 0 && (
            <span className="text-sm text-muted-foreground">No local aliases.</span>
          )}
          {localAliases.map(({ accessKeyId, alias, keyName }) => (
            <div key={`${accessKeyId}/${alias}`} className="flex items-center justify-between rounded-md border px-3 py-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{alias}</span>
                <span className="text-xs text-muted-foreground">
                  via <span className="font-mono">{accessKeyId}</span>
                  {keyName && ` (${keyName})`}
                </span>
              </div>
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                disabled={removeAlias.isPending}
                onClick={() => removeAlias.mutate({ bucketId: id, accessKeyId, localAlias: alias })}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newLocal.trim() || !newLocalKey.trim()) return;
            addAlias.mutate({ bucketId: id, accessKeyId: newLocalKey.trim(), localAlias: newLocal.trim() });
            setNewLocal("");
            setNewLocalKey("");
          }}
        >
          <Input
            value={newLocalKey}
            onChange={(e) => setNewLocalKey(e.target.value)}
            placeholder="access key ID"
            className="max-w-xs font-mono text-xs"
          />
          <Input
            value={newLocal}
            onChange={(e) => setNewLocal(e.target.value)}
            placeholder="alias"
            className="max-w-xs"
          />
          <Button type="submit" size="sm" variant="outline"
            disabled={!newLocal.trim() || !newLocalKey.trim() || addAlias.isPending}
          >
            <Plus className="h-3.5 w-3.5" />Add local alias
          </Button>
        </form>
      </div>
    </Section>
  );
}

function QuotasSection({ id, info }: { id: string; info: BucketInfo }) {
  const qc = useQueryClient();
  const [maxSize, setMaxSize] = useState("");
  const [maxObjects, setMaxObjects] = useState("");

  useEffect(() => {
    setMaxSize(info.quotas?.maxSize != null ? String(info.quotas.maxSize) : "");
    setMaxObjects(info.quotas?.maxObjects != null ? String(info.quotas.maxObjects) : "");
  }, [info.quotas?.maxSize, info.quotas?.maxObjects]);

  const save = useMutation({
    mutationFn: async (clear: boolean) => {
      const parsedSize = maxSize.trim() === "" ? null : Number(maxSize);
      const parsedObjects = maxObjects.trim() === "" ? null : Number(maxObjects);
      if (!clear && (Number.isNaN(parsedSize as number) || Number.isNaN(parsedObjects as number))) {
        throw new Error("Quota values must be numbers");
      }
      await unwrap(getClient().POST("/v2/UpdateBucket", {
        params: { query: { id } },
        body: {
          quotas: clear
            ? { maxSize: null, maxObjects: null }
            : { maxSize: parsedSize, maxObjects: parsedObjects },
        },
      }));
    },
    onSuccess: (_data, clear) => {
      qc.invalidateQueries({ queryKey: ["bucket-info", id] });
      toast({ title: clear ? "Quotas cleared" : "Quotas updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const hasQuotas = info.quotas?.maxSize != null || info.quotas?.maxObjects != null;
  const sizeHint = maxSize && !Number.isNaN(Number(maxSize)) ? formatBytes(Number(maxSize)) : null;

  return (
    <Section
      title="Quotas"
      description="Limit the bucket's total size and object count. Both must be set (or both empty) per API constraints."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="max-size">Max size (bytes)</Label>
          <Input
            id="max-size" value={maxSize} onChange={(e) => setMaxSize(e.target.value)}
            placeholder="leave empty for no limit"
            className="mt-1 font-mono text-sm"
          />
          {sizeHint && <p className="mt-1 text-xs text-muted-foreground">≈ {sizeHint}</p>}
        </div>
        <div>
          <Label htmlFor="max-objects">Max objects</Label>
          <Input
            id="max-objects" value={maxObjects} onChange={(e) => setMaxObjects(e.target.value)}
            placeholder="leave empty for no limit"
            className="mt-1 font-mono text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => save.mutate(false)} disabled={save.isPending}>Save</Button>
        {hasQuotas && (
          <Button size="sm" variant="outline" onClick={() => save.mutate(true)} disabled={save.isPending}>
            Clear quotas
          </Button>
        )}
      </div>
    </Section>
  );
}

function KeyPermissionsSection({ id, info }: { id: string; info: BucketInfo }) {
  const qc = useQueryClient();

  const { data: allKeys } = useQuery({
    queryKey: ["keys"],
    queryFn: async () => {
      return (await unwrap(getClient().GET("/v2/ListKeys"))) ?? [];
    },
  });

  type PermArgs = { accessKeyId: string; read: boolean; write: boolean; owner: boolean };

  const allow = useMutation({
    mutationFn: async ({ accessKeyId, read, write, owner }: PermArgs) => {
      await unwrap(getClient().POST("/v2/AllowBucketKey", {
        body: { accessKeyId, bucketId: id, permissions: { read, write, owner } },
      }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bucket-info", id] }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deny = useMutation({
    mutationFn: async ({ accessKeyId, read, write, owner }: PermArgs) => {
      await unwrap(getClient().POST("/v2/DenyBucketKey", {
        body: { accessKeyId, bucketId: id, permissions: { read, write, owner } },
      }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bucket-info", id] }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const isPending = allow.isPending || deny.isPending;
  const grantedIds = new Set(info.keys.map((k) => k.accessKeyId));
  const ungranted = (allKeys ?? []).filter((k) => !grantedIds.has(k.id));

  return (
    <Section
      title="Access keys"
      description="Grant individual S3 access keys read/write/owner permissions on this bucket."
    >
      {info.keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No keys have permission on this bucket.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left py-2 font-medium">Key</th>
                <th className="text-center py-2 font-medium w-20">Read</th>
                <th className="text-center py-2 font-medium w-20">Write</th>
                <th className="text-center py-2 font-medium w-20">Owner</th>
                <th className="text-right py-2 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody>
              {info.keys.map((k) => (
                <tr key={k.accessKeyId} className="border-b last:border-0">
                  <td className="py-2.5">
                    <div className="font-mono text-xs">{k.accessKeyId}</div>
                    {k.name && <div className="text-xs text-muted-foreground">{k.name}</div>}
                  </td>
                  {(["read", "write", "owner"] as const).map((perm) => (
                    <td key={perm} className="text-center py-2.5">
                      <Switch
                        checked={!!k.permissions[perm]}
                        disabled={isPending}
                        onCheckedChange={(checked) => {
                          const args = { accessKeyId: k.accessKeyId, read: false, write: false, owner: false, [perm]: true };
                          if (checked) allow.mutate(args);
                          else deny.mutate(args);
                        }}
                      />
                    </td>
                  ))}
                  <td className="text-right py-2.5">
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      disabled={isPending}
                      onClick={() => deny.mutate({ accessKeyId: k.accessKeyId, read: true, write: true, owner: true })}
                      title="Revoke all"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ungranted.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Grant access to a key</p>
            <div className="space-y-1">
              {ungranted.map((k) => (
                <div key={k.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/40">
                  <div>
                    <span className="font-mono text-xs">{k.id}</span>
                    {k.name && <span className="ml-2 text-xs text-muted-foreground">{k.name}</span>}
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    disabled={isPending}
                    onClick={() => allow.mutate({ accessKeyId: k.id, read: true, write: true, owner: false })}
                  >
                    <Check className="h-3 w-3" />Grant read+write
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

function DeleteBucketDialog({ id, name, onClose, onDeleted }: {
  id: string; name: string; onClose: () => void; onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      await unwrap(getClient().POST("/v2/DeleteBucket", { params: { query: { id } } }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buckets"] });
      toast({ title: "Bucket deleted" });
      onDeleted();
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete bucket?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Permanently delete <span className="font-mono text-foreground">{name}</span>. The bucket must be empty.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BucketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data: info, isLoading, error } = useBucketInfo(id ?? "");

  if (!id) return <ErrorState error={new Error("Missing bucket id")} />;
  if (isLoading) return <LoadingState label="Loading bucket…" />;
  if (error || !info) return <ErrorState error={(error as Error) ?? new Error("No data")} />;

  const displayName = info.globalAliases[0]
    ?? info.keys.flatMap((k) => k.bucketLocalAliases)[0]
    ?? truncate(info.id, 16);

  return (
    <div>
      <PageHeader
        title={displayName}
        description={`Bucket ${truncate(info.id, 20)}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/buckets"><ArrowLeft className="h-3.5 w-3.5" />All buckets</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/buckets/${id}`}><FolderOpen className="h-3.5 w-3.5" />Browse files</Link>
            </Button>
            <Button variant="outline" size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />Delete
            </Button>
          </>
        }
      />
      <div className="p-8 space-y-6 max-w-5xl">
        <OverviewSection info={info} />
        <AliasesSection id={id} info={info} />
        <QuotasSection id={id} info={info} />
        <KeyPermissionsSection id={id} info={info} />
      </div>
      {deleteOpen && (
        <DeleteBucketDialog id={id} name={displayName}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => navigate("/buckets")}
        />
      )}
    </div>
  );
}
