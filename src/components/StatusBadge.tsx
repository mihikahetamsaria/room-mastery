import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: "confirmed" | "cancelled" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border font-medium uppercase tracking-wide",
        status === "confirmed"
          ? "border-success/40 bg-success/10 text-success"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {status}
    </Badge>
  );
}

export function PurposeBadge({ purpose }: { purpose: string }) {
  return (
    <Badge variant="outline" className="border-border bg-secondary text-secondary-foreground">
      {purpose}
    </Badge>
  );
}
