import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getClient, unwrap } from "@/api/client";
import { getS3Client, s3Configured } from "@/api/s3client";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState, ErrorState } from "@/components/layout/QueryState";
import { S3NotConfigured } from "@/components/layout/S3NotConfigured";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, truncate } from "@/lib/utils";
import { RefreshCw, FolderOpen } from "lucide-react";

const MAX_OBJECTS_PER_BUCKET = 2000;
const PAGE_SIZE = 1000;
const TOP_N = 50;

interface RecentObject {
  bucketId: string;
  bucketName: string;
  key: string;
  size: number;
  lastModified: Date;
}

interface ScanResult {
  objects: RecentObject[];
  bucketsScanned: number;
  objectsScanned: number;
  failedBuckets: number;
}

async function scanBucket(bucketId: string, bucketName: string): Promise<RecentObject[]> {
  const collected: RecentObject[] = [];
  let token: string | undefined;
  do {
    const result = await getS3Client().send(
      new ListObjectsV2Command({ Bucket: bucketId, MaxKeys: PAGE_SIZE, ContinuationToken: token })
    );
    for (const obj of result.Contents ?? []) {
      if (!obj.Key || obj.Key.endsWith("/")) continue; // skip folder markers
      collected.push({
        bucketId,
        bucketName,
        key: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? new Date(0),
      });
    }
    token = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (token && collected.length < MAX_OBJECTS_PER_BUCKET);
  return collected;
}

function useRecentFiles() {
  return useQuery({
    queryKey: ["recent-files"],
    enabled: s3Configured(),
    retry: false,
    queryFn: async (): Promise<ScanResult> => {
      const buckets = (await unwrap(getClient().GET("/v2/ListBuckets"))) ?? [];
      const results = await Promise.allSettled(
        buckets.map((b) => scanBucket(b.id, b.globalAliases[0] ?? truncate(b.id, 12)))
      );

      const objects: RecentObject[] = [];
      let failedBuckets = 0;
      for (const r of results) {
        if (r.status === "fulfilled") objects.push(...r.value);
        else failedBuckets++;
      }
      objects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      return {
        objects: objects.slice(0, TOP_N),
        bucketsScanned: buckets.length - failedBuckets,
        objectsScanned: objects.length,
        failedBuckets,
      };
    },
  });
}

export function RecentFilesPage() {
  if (!s3Configured()) {
    return (
      <div>
        <PageHeader title="Recent Files" description="Recently modified objects across all buckets" />
        <div className="p-8">
          <S3NotConfigured action="scan bucket contents" />
        </div>
      </div>
    );
  }

  return <RecentFilesContent />;
}

function RecentFilesContent() {
  const { data, isLoading, isFetching, error, refetch } = useRecentFiles();

  return (
    <div>
      <PageHeader
        title="Recent Files"
        description="Recently modified objects across all buckets"
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
        }
      />
      <div className="p-8 space-y-3">
        {data && (
          <p className="text-xs text-muted-foreground">
            Newest {data.objects.length} of {data.objectsScanned.toLocaleString()} objects scanned across{" "}
            {data.bucketsScanned} bucket{data.bucketsScanned === 1 ? "" : "s"}
            {data.failedBuckets > 0 && ` (${data.failedBuckets} could not be scanned)`}. Each bucket is scanned up
            to {MAX_OBJECTS_PER_BUCKET.toLocaleString()} objects; results reflect what was scanned.
          </p>
        )}

        <Card>
          {isLoading ? (
            <LoadingState label="Scanning buckets…" />
          ) : error ? (
            <div className="p-6">
              <ErrorState error={error as Error} />
              <p className="text-xs text-center text-muted-foreground mt-2">
                If this is a CORS error, configure S3 CORS on the buckets or use a proxy.
              </p>
            </div>
          ) : data && data.objects.length === 0 ? (
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground text-sm">
              No objects found in any bucket.
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {["Name", "Bucket", "Size", "Last Modified", ""].map((h, i) => (
                      <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.objects.map((obj) => (
                    <tr key={`${obj.bucketId}/${obj.key}`} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{obj.key.split("/").pop() || obj.key}</td>
                      <td className="px-4 py-3">
                        <Link to={`/buckets/${obj.bucketId}`}>
                          <Badge variant="secondary" className="hover:bg-secondary/70">{obj.bucketName}</Badge>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatBytes(obj.size)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{obj.lastModified.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/buckets/${obj.bucketId}`}>
                            <FolderOpen className="h-3.5 w-3.5" />Open
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
