import { AlertCircle, Loader2 } from "lucide-react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-destructive gap-3">
      <AlertCircle className="h-8 w-8" />
      <p className="text-sm font-medium">{error.message}</p>
    </div>
  );
}
