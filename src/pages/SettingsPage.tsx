import { useRef, useState } from "react";
import { getToken, setToken, getBaseUrl, setBaseUrl, refreshClient, clearCredentials, testConnection } from "@/api/client";
import { getS3Settings, setS3Settings, refreshS3Client } from "@/api/s3client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Save, RotateCcw, Eye, EyeOff, Download, Upload, Plug, Loader2, CheckCircle2, XCircle } from "lucide-react";

declare global {
  interface Window {
    __GARAGE_CONFIG__?: { apiUrl?: string; adminToken?: string };
  }
}

interface ExportedConfig {
  adminApiUrl: string;
  adminToken: string;
  s3Endpoint: string;
  s3KeyId: string;
  s3Secret: string;
}

const runtimeConfig = window.__GARAGE_CONFIG__ ?? {};
const hasRuntimeConfig = !!(runtimeConfig.adminToken || runtimeConfig.apiUrl);

export function SettingsPage() {
  const [token, setTokenInput] = useState(getToken);
  const [baseUrl, setBaseUrlInput] = useState(getBaseUrl);

  const s3 = getS3Settings();
  const [s3Endpoint, setS3Endpoint] = useState(s3.endpoint);
  const [s3KeyId, setS3KeyId] = useState(s3.keyId);
  const [s3Secret, setS3Secret] = useState(s3.secret);
  const [showSecret, setShowSecret] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const testAdmin = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testConnection(baseUrl, token);
    setTestResult(result);
    setTesting(false);
  };

  const saveAdmin = () => {
    setToken(token);
    setBaseUrl(baseUrl);
    refreshClient();
    toast({ title: "Admin settings saved" });
  };

  const saveS3 = () => {
    setS3Settings({ endpoint: s3Endpoint, keyId: s3KeyId, secret: s3Secret });
    refreshS3Client();
    toast({ title: "S3 settings saved" });
  };

  const reset = () => {
    clearCredentials();
    setTokenInput(runtimeConfig.adminToken ?? "");
    setBaseUrlInput(runtimeConfig.apiUrl ?? "/api");
    refreshClient();
    toast({ title: "Reset to defaults" });
  };

  const exportConfig = () => {
    const config: ExportedConfig = {
      adminApiUrl: baseUrl,
      adminToken: token,
      s3Endpoint,
      s3KeyId,
      s3Secret,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "garage-ui-config.json";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Configuration exported" });
  };

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const config = JSON.parse(ev.target?.result as string) as Partial<ExportedConfig>;
        if (config.adminApiUrl !== undefined) setBaseUrlInput(config.adminApiUrl);
        if (config.adminToken !== undefined) setTokenInput(config.adminToken);
        if (config.s3Endpoint !== undefined) setS3Endpoint(config.s3Endpoint);
        if (config.s3KeyId !== undefined) setS3KeyId(config.s3KeyId);
        if (config.s3Secret !== undefined) setS3Secret(config.s3Secret);

        setToken(config.adminToken ?? token);
        setBaseUrl(config.adminApiUrl ?? baseUrl);
        refreshClient();
        setS3Settings({
          endpoint: config.s3Endpoint ?? s3Endpoint,
          keyId: config.s3KeyId ?? s3KeyId,
          secret: config.s3Secret ?? s3Secret,
        });
        refreshS3Client();

        toast({ title: "Configuration imported", description: "All settings applied." });
      } catch {
        toast({ title: "Import failed", description: "Invalid JSON file.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure API connections"
        actions={
          <div className="flex gap-2">
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={importConfig} />
            <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
              <Upload className="h-4 w-4" />Import
            </Button>
            <Button variant="outline" size="sm" onClick={exportConfig}>
              <Download className="h-4 w-4" />Export
            </Button>
          </div>
        }
      />
      <div className="p-8 max-w-xl space-y-6">

        {hasRuntimeConfig && (
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="pt-4 pb-3 text-sm text-blue-800 dark:text-blue-300">
              Runtime configuration detected from container environment.
              Browser-stored values take priority.
            </CardContent>
          </Card>
        )}

        {/* Admin API */}
        <Card>
          <CardHeader>
            <CardTitle>Admin API</CardTitle>
            <CardDescription>
              Used for cluster management, buckets, keys, workers, and blocks.
              In dev, use <code className="bg-muted px-1 rounded text-xs">/api</code> (Vite proxy → port 3903).
              For direct access use the full URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="base-url">Base URL</Label>
                {runtimeConfig.apiUrl && !localStorage.getItem("garage_base_url") && (
                  <Badge variant="secondary" className="text-xs">from container</Badge>
                )}
              </div>
              <Input
                id="base-url"
                value={baseUrl}
                onChange={(e) => { setBaseUrlInput(e.target.value); setTestResult(null); }}
                placeholder="http://192.168.68.71:3903"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="admin-token">Admin Token</Label>
                {runtimeConfig.adminToken && !localStorage.getItem("garage_admin_token") && (
                  <Badge variant="secondary" className="text-xs">from container</Badge>
                )}
              </div>
              <Input
                id="admin-token"
                type="password"
                value={token}
                onChange={(e) => { setTokenInput(e.target.value); setTestResult(null); }}
                placeholder="Bearer token…"
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={saveAdmin} className="flex-1">
                <Save className="h-4 w-4" />Save
              </Button>
              <Button variant="outline" onClick={testAdmin} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                Test Connection
              </Button>
              {hasRuntimeConfig && (
                <Button variant="outline" onClick={reset}>
                  <RotateCcw className="h-4 w-4" />Reset
                </Button>
              )}
            </div>
            {testResult && (
              <div
                className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
                  testResult.ok
                    ? "bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* S3 API */}
        <Card>
          <CardHeader>
            <CardTitle>S3 API</CardTitle>
            <CardDescription>
              Used for browsing bucket contents, uploading, downloading, and deleting files.
              Requires an access key from the <strong>Access Keys</strong> page.
              Point the endpoint directly at Garage's S3 port (3900). To avoid CORS errors,
              click <strong>Configure CORS</strong> in the bucket browser after connecting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="s3-endpoint">S3 Endpoint URL</Label>
              <Input
                id="s3-endpoint"
                value={s3Endpoint}
                onChange={(e) => setS3Endpoint(e.target.value)}
                placeholder="/s3  (proxied) or http://192.168.68.71:3900 (direct)"
                className="mt-1 font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="s3-key-id">Access Key ID</Label>
              <Input
                id="s3-key-id"
                value={s3KeyId}
                onChange={(e) => setS3KeyId(e.target.value)}
                placeholder="GKxxxxxxxxxxxxxxxxxxxx"
                className="mt-1 font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="s3-secret">Secret Access Key</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="s3-secret"
                  type={showSecret ? "text" : "password"}
                  value={s3Secret}
                  onChange={(e) => setS3Secret(e.target.value)}
                  placeholder="Secret key…"
                  className="font-mono text-sm"
                />
                <Button size="icon" variant="ghost" onClick={() => setShowSecret((s) => !s)}>
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button onClick={saveS3} className="w-full">
              <Save className="h-4 w-4" />Save S3 Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
