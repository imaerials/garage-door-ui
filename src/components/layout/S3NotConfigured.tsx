import { useNavigate } from "react-router-dom";
import { AlertCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shared empty state shown when S3 credentials are missing. Used by the bucket
 * browser and the Recent Files page so the "go configure S3" guidance stays
 * consistent in one place.
 */
export function S3NotConfigured({ action = "browse bucket contents" }: { action?: string }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardContent className="flex flex-col items-center py-16 gap-4 text-center">
        <div className="rounded-full bg-muted p-3">
          <AlertCircle className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">S3 credentials not configured</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Add your S3 endpoint and access key in Settings to {action}.
          </p>
        </div>
        <Button size="sm" onClick={() => navigate("/settings")}>
          <Settings className="h-4 w-4" />Go to Settings
        </Button>
      </CardContent>
    </Card>
  );
}
