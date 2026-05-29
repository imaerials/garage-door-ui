import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClusterPage } from "@/pages/cluster/ClusterPage";
import { BucketsPage } from "@/pages/buckets/BucketsPage";
import { BucketBrowserPage } from "@/pages/buckets/BucketBrowserPage";
import { BucketDetailPage } from "@/pages/buckets/BucketDetailPage";
import { KeysPage } from "@/pages/keys/KeysPage";
import { TokensPage } from "@/pages/tokens/TokensPage";
import { WorkersPage } from "@/pages/workers/WorkersPage";
import { BlocksPage } from "@/pages/blocks/BlocksPage";
import { RecentFilesPage } from "@/pages/recent/RecentFilesPage";
import { LayoutPage } from "@/pages/layout/LayoutPage";
import { SettingsPage } from "@/pages/SettingsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry client errors (bad token, bad request) — only transient ones.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
      staleTime: 5_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/cluster" replace />} />
            <Route path="/cluster" element={<ClusterPage />} />
            <Route path="/layout" element={<LayoutPage />} />
            <Route path="/buckets" element={<BucketsPage />} />
            <Route path="/buckets/:id" element={<BucketBrowserPage />} />
            <Route path="/buckets/:id/settings" element={<BucketDetailPage />} />
            <Route path="/recent" element={<RecentFilesPage />} />
            <Route path="/keys" element={<KeysPage />} />
            <Route path="/tokens" element={<TokensPage />} />
            <Route path="/workers" element={<WorkersPage />} />
            <Route path="/blocks" element={<BlocksPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
