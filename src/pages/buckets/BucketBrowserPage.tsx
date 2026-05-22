import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/api/client";
import {
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { getS3Client, s3Configured } from "@/api/s3client";
import { formatBytes, truncate } from "@/lib/utils";
import {
  Folder, File, ArrowLeft, Trash2, Download, Upload as UploadIcon,
  AlertCircle, ChevronRight, ChevronLeft, Settings, ShieldCheck,
  FolderPlus, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;

interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  isFolder: boolean;
}

interface ObjectPage {
  objects: S3Object[];
  nextToken: string | undefined;
  isTruncated: boolean;
}

function useObjects(bucket: string, prefix: string, continuationToken: string | undefined) {
  return useQuery({
    queryKey: ["s3", bucket, prefix, continuationToken ?? ""],
    queryFn: async (): Promise<ObjectPage> => {
      const result = await getS3Client().send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          Delimiter: "/",
          MaxKeys: PAGE_SIZE,
          ContinuationToken: continuationToken,
        })
      );

      const folders: S3Object[] = (result.CommonPrefixes ?? []).map((cp) => ({
        key: cp.Prefix ?? "",
        size: 0,
        lastModified: new Date(0),
        isFolder: true,
      }));

      const files: S3Object[] = (result.Contents ?? [])
        .filter((obj) => obj.Key !== prefix)
        .map((obj) => ({
          key: obj.Key ?? "",
          size: obj.Size ?? 0,
          lastModified: obj.LastModified ?? new Date(0),
          isFolder: false,
        }));

      return {
        objects: [...folders, ...files],
        nextToken: result.NextContinuationToken,
        isTruncated: result.IsTruncated ?? false,
      };
    },
    enabled: s3Configured(),
    retry: false,
  });
}

function Breadcrumb({ bucket, prefix, onNavigate }: { bucket: string; prefix: string; onNavigate: (p: string) => void }) {
  const parts = prefix.split("/").filter(Boolean);
  return (
    <div className="flex items-center gap-1 text-sm flex-wrap">
      <button onClick={() => onNavigate("")} className="text-primary hover:underline font-medium">{bucket}</button>
      {parts.map((part, i) => {
        const path = parts.slice(0, i + 1).join("/") + "/";
        return (
          <span key={path} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            {i === parts.length - 1
              ? <span className="text-foreground">{part}</span>
              : <button onClick={() => onNavigate(path)} className="text-primary hover:underline">{part}</button>}
          </span>
        );
      })}
    </div>
  );
}

function UploadZone({ bucket, prefix, onUploaded }: { bucket: string; prefix: string; onUploaded: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<{ name: string; progress: number }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setUploads(fileArray.map((f) => ({ name: f.name, progress: 0 })));

    await Promise.all(
      fileArray.map(async (file, idx) => {
        try {
          const upload = new Upload({
            client: getS3Client(),
            params: {
              Bucket: bucket,
              Key: prefix + file.name,
              Body: file,
              ContentType: file.type || "application/octet-stream",
            },
            queueSize: 4,
            partSize: 5 * 1024 * 1024,
          });

          upload.on("httpUploadProgress", ({ loaded, total }) => {
            const pct = total ? Math.round(((loaded ?? 0) / total) * 100) : 0;
            setUploads((prev) => prev.map((u, i) => i === idx ? { ...u, progress: pct } : u));
          });

          await upload.done();
          toast({ title: `${file.name} uploaded` });
        } catch (e) {
          toast({ title: `Failed: ${file.name}`, description: String(e), variant: "destructive" });
        }
      })
    );

    setUploads([]);
    onUploaded();
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    },
    [bucket, prefix]
  );

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40 hover:bg-muted/20"
        )}
      >
        <UploadIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">Drop files here or click to select</p>
        <p className="text-xs text-muted-foreground mt-1">Uploads to: <span className="font-mono">{bucket}/{prefix}</span></p>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
      </div>

      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((u) => (
            <div key={u.name}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-mono truncate max-w-xs">{u.name}</span>
                <span className="text-muted-foreground">{u.progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${u.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigureCorsButton({ bucket }: { bucket: string }) {
  const configure = useMutation({
    mutationFn: async () => {
      const { error } = await getClient().POST("/v2/UpdateBucket", {
        params: { query: { id: bucket } },
        body: {
          corsRules: [
            {
              AllowedHeader: ["*"] as unknown[],
              AllowedMethod: ["GET", "PUT", "POST", "DELETE", "HEAD"] as unknown[],
              AllowedOrigin: ["*"] as unknown[],
              ExposeHeader: ["ETag", "Content-Length"] as unknown[],
            },
          ],
        },
      });
      if (error) throw new Error(JSON.stringify(error));
    },
    onSuccess: () => toast({ title: "CORS configured", description: "Bucket now allows cross-origin requests." }),
    onError: (e: Error) => toast({ title: "Failed to configure CORS", description: e.message, variant: "destructive" }),
  });

  return (
    <Button size="sm" variant="outline" onClick={() => configure.mutate()} disabled={configure.isPending}>
      <ShieldCheck className="h-4 w-4" />Configure CORS
    </Button>
  );
}

const IMAGE_EXTS = new Set(["jpg","jpeg","png","gif","webp","svg","bmp","ico","avif"]);
const TEXT_EXTS = new Set(["txt","md","yaml","yml","toml","ini","log","sh","bash","csv","xml","html","htm","css","js","ts","jsx","tsx","py","rb","rs","go","java","c","cpp","h","sql","conf","env"]);

type PreviewType = "image" | "text" | "json" | "pdf" | "unsupported";

function getPreviewType(key: string, contentType = ""): PreviewType {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/") || IMAGE_EXTS.has(ext)) return "image";
  if (ct === "application/pdf" || ext === "pdf") return "pdf";
  if (ct === "application/json" || ext === "json") return "json";
  if (ct.startsWith("text/") || TEXT_EXTS.has(ext)) return "text";
  return "unsupported";
}

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "image"; url: string }
  | { status: "text"; content: string }
  | { status: "json"; content: string }
  | { status: "pdf"; url: string }
  | { status: "unsupported"; contentType: string };

function PreviewModal({ bucket, obj, onClose, onDownload }: {
  bucket: string;
  obj: S3Object;
  onClose: () => void;
  onDownload: (key: string) => void;
}) {
  const filename = obj.key.split("/").pop() ?? obj.key;
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    let blobUrl: string | null = null;
    let cancelled = false;

    async function load() {
      try {
        const result = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: obj.key }));
        if (cancelled) return;

        const contentType = result.ContentType ?? "";
        const type = getPreviewType(obj.key, contentType);

        if (type === "image") {
          const bytes = await result.Body!.transformToByteArray();
          if (cancelled) return;
          blobUrl = URL.createObjectURL(new Blob([bytes], { type: contentType || "image/*" }));
          setState({ status: "image", url: blobUrl });
        } else if (type === "pdf") {
          const bytes = await result.Body!.transformToByteArray();
          if (cancelled) return;
          blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          setState({ status: "pdf", url: blobUrl });
        } else if (type === "json") {
          const text = await result.Body!.transformToString();
          if (cancelled) return;
          try {
            setState({ status: "json", content: JSON.stringify(JSON.parse(text), null, 2) });
          } catch {
            setState({ status: "json", content: text });
          }
        } else if (type === "text") {
          if (obj.size > 2 * 1024 * 1024) {
            setState({ status: "error", message: `File too large to preview (${formatBytes(obj.size)}). Max 2 MB for text.` });
            return;
          }
          const text = await result.Body!.transformToString();
          if (cancelled) return;
          setState({ status: "text", content: text });
        } else {
          setState({ status: "unsupported", contentType });
        }
      } catch (e) {
        if (!cancelled) setState({ status: "error", message: String(e) });
      }
    }

    load();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [bucket, obj.key]);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogTitle className="sr-only">{filename}</DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0 pr-12">
          <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-mono text-sm font-medium truncate flex-1">{filename}</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatBytes(obj.size)}</span>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => onDownload(obj.key)}>
            <Download className="h-3.5 w-3.5" />Download
          </Button>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1 min-h-0">
          {state.status === "loading" && (
            <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Loading preview…</div>
          )}
          {state.status === "error" && (
            <div className="flex items-center justify-center h-64 text-sm text-destructive p-8 text-center">{state.message}</div>
          )}
          {state.status === "image" && (
            <div className="flex items-center justify-center p-6 bg-muted/20 min-h-64">
              <img src={state.url} alt={filename} className="max-w-full max-h-[70vh] object-contain rounded shadow" />
            </div>
          )}
          {state.status === "pdf" && (
            <iframe src={state.url} className="w-full h-[70vh] border-0" title={filename} />
          )}
          {(state.status === "text" || state.status === "json") && (
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">{state.content}</pre>
          )}
          {state.status === "unsupported" && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <p className="text-sm">No preview available for this file type</p>
              {state.contentType && <code className="text-xs bg-muted px-2 py-1 rounded">{state.contentType}</code>}
              <Button size="sm" variant="outline" onClick={() => onDownload(obj.key)}>
                <Download className="h-4 w-4" />Download instead
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateFolderDialog({ bucket, prefix, onCreated, onClose }: {
  bucket: string; prefix: string; onCreated: () => void; onClose: () => void;
}) {
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const safeName = name.trim().replace(/\/+/g, "");
      if (!safeName) throw new Error("Folder name cannot be empty");
      await getS3Client().send(new PutObjectCommand({
        Bucket: bucket,
        Key: prefix + safeName + "/",
        Body: new Uint8Array(0),
      }));
    },
    onSuccess: () => {
      toast({ title: "Folder created" });
      onCreated();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed to create folder", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Create Folder</DialogTitle></DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="folder-name"
          className="font-mono"
          onKeyDown={(e) => e.key === "Enter" && create.mutate()}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            <FolderPlus className="h-4 w-4" />Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BucketBrowserPage() {
  const { id: bucket = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: bucketInfo } = useQuery({
    queryKey: ["bucket-info", bucket],
    queryFn: async () => {
      const { data, error } = await getClient().GET("/v2/GetBucketInfo", {
        params: { query: { id: bucket } },
      });
      if (error) throw new Error(JSON.stringify(error));
      return data!;
    },
    staleTime: 60_000,
  });

  const bucketName = bucketInfo?.globalAliases[0]
    ?? bucketInfo?.keys.flatMap((k) => k.bucketLocalAliases)[0]
    ?? truncate(bucket, 20);

  const [prefix, setPrefix] = useState("");
  const [continuationToken, setContinuationToken] = useState<string | undefined>(undefined);
  const [prevTokens, setPrevTokens] = useState<(string | undefined)[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [previewObj, setPreviewObj] = useState<S3Object | null>(null);

  const { data, isLoading, error, refetch } = useObjects(bucket, prefix, continuationToken);
  const objects = data?.objects ?? [];
  const files = objects.filter((o) => !o.isFolder);
  const pageNum = prevTokens.length + 1;

  const navigateToPrefix = (newPrefix: string) => {
    setPrefix(newPrefix);
    setContinuationToken(undefined);
    setPrevTokens([]);
    setSelected(new Set());
  };

  const nextPage = () => {
    setPrevTokens((p) => [...p, continuationToken]);
    setContinuationToken(data?.nextToken);
    setSelected(new Set());
  };

  const prevPage = () => {
    const token = prevTokens[prevTokens.length - 1];
    setPrevTokens((p) => p.slice(0, -1));
    setContinuationToken(token);
    setSelected(new Set());
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const allSelected = files.length > 0 && selected.size === files.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(files.map((f) => f.key)));

  const del = useMutation({
    mutationFn: async (key: string) => {
      await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    onSuccess: (_d, key) => {
      qc.invalidateQueries({ queryKey: ["s3", bucket, prefix] });
      toast({ title: `Deleted ${key.split("/").pop()}` });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const bulkDelete = useMutation({
    mutationFn: async (keys: string[]) => {
      await getS3Client().send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false },
      }));
      return keys.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["s3", bucket, prefix] });
      setSelected(new Set());
      toast({ title: `Deleted ${count} object${count === 1 ? "" : "s"}` });
    },
    onError: (e: Error) => toast({ title: "Bulk delete failed", description: e.message, variant: "destructive" }),
  });

  const download = async (key: string) => {
    try {
      const result = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const blob = await result.Body!.transformToByteArray();
      const url = URL.createObjectURL(new Blob([blob]));
      const a = document.createElement("a");
      a.href = url;
      a.download = key.split("/").pop() ?? key;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    }
  };

  if (!s3Configured()) {
    return (
      <div>
        <PageHeader title={bucketName} description="Bucket browser" />
        <div className="p-8">
          <Card>
            <CardContent className="flex flex-col items-center py-16 gap-4 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">S3 credentials not configured</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add your S3 endpoint and access key in Settings to browse bucket contents.
                </p>
              </div>
              <Button size="sm" onClick={() => navigate("/settings")}>
                <Settings className="h-4 w-4" />Go to Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={bucketName}
        description={<Breadcrumb bucket={bucket} prefix={prefix} onNavigate={navigateToPrefix} /> as unknown as string}
        actions={
          <div className="flex gap-2">
            <ConfigureCorsButton bucket={bucket} />
            <Button variant="outline" size="sm" asChild>
              <Link to="/buckets"><ArrowLeft className="h-4 w-4" />Buckets</Link>
            </Button>
          </div>
        }
      />
      <div className="p-8 space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <UploadZone bucket={bucket} prefix={prefix} onUploaded={() => refetch()} />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="self-start mt-1"
            onClick={() => setCreateFolderOpen(true)}
          >
            <FolderPlus className="h-4 w-4" />New Folder
          </Button>
        </div>

        {/* Bulk action toolbar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/60 rounded-lg border">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkDelete.isPending}
              onClick={() => {
                if (confirm(`Delete ${selected.size} object${selected.size === 1 ? "" : "s"}?`))
                  bulkDelete.mutate(Array.from(selected));
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />Delete selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        <Card>
          {isLoading ? (
            <LoadingState label="Listing objects…" />
          ) : error ? (
            <div className="p-6">
              <ErrorState error={error as Error} />
              <p className="text-xs text-center text-muted-foreground mt-2">
                If this is a CORS error, configure S3 CORS on the bucket or use a proxy.
              </p>
            </div>
          ) : objects.length === 0 ? (
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground text-sm">
              This folder is empty — drop files above to upload.
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2.5 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="rounded border-muted-foreground"
                        title="Select all files"
                      />
                    </th>
                    {["Name", "Size", "Last Modified", ""].map((h, i) => (
                      <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {objects.map((obj) => {
                    const name = obj.key.slice(prefix.length);
                    const isSelected = selected.has(obj.key);
                    return (
                      <tr
                        key={obj.key}
                        className={cn(
                          "border-b last:border-0 hover:bg-muted/20 transition-colors",
                          isSelected && "bg-primary/5"
                        )}
                      >
                        <td className="px-4 py-3 w-8">
                          {!obj.isFolder && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(obj.key)}
                              className="rounded border-muted-foreground"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            className={cn(
                              "flex items-center gap-2 text-left hover:underline",
                              obj.isFolder ? "text-primary" : "text-foreground hover:text-primary"
                            )}
                            onClick={() => obj.isFolder ? navigateToPrefix(obj.key) : setPreviewObj(obj)}
                          >
                            {obj.isFolder
                              ? <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
                              : <File className="h-4 w-4 text-muted-foreground shrink-0" />}
                            <span className="font-mono text-xs">{name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {obj.isFolder ? <Badge variant="outline">folder</Badge> : formatBytes(obj.size)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {obj.isFolder ? "—" : obj.lastModified.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {!obj.isFolder && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => download(obj.key)}
                                title="Download"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => { if (confirm(`Delete ${name}?`)) del.mutate(obj.key); }}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {(pageNum > 1 || data?.isTruncated) && (
                <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                  <Button
                    variant="outline" size="sm"
                    onClick={prevPage}
                    disabled={pageNum === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />Previous
                  </Button>
                  <span>Page {pageNum}</span>
                  <Button
                    variant="outline" size="sm"
                    onClick={nextPage}
                    disabled={!data?.isTruncated}
                  >
                    Next<ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {createFolderOpen && (
        <CreateFolderDialog
          bucket={bucket}
          prefix={prefix}
          onCreated={() => refetch()}
          onClose={() => setCreateFolderOpen(false)}
        />
      )}
      {previewObj && (
        <PreviewModal
          bucket={bucket}
          obj={previewObj}
          onClose={() => setPreviewObj(null)}
          onDownload={(key) => { download(key); }}
        />
      )}
    </div>
  );
}
