import { NavLink } from "react-router-dom";
import {
  Server, Archive, Key, ShieldCheck, Wrench, HardDrive, LayoutGrid, Activity, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Cluster", icon: Activity, to: "/cluster" },
  { label: "Layout", icon: LayoutGrid, to: "/layout" },
  { label: "Buckets", icon: Archive, to: "/buckets" },
  { label: "Recent Files", icon: Clock, to: "/recent" },
  { label: "Access Keys", icon: Key, to: "/keys" },
  { label: "Admin Tokens", icon: ShieldCheck, to: "/tokens" },
  { label: "Workers", icon: Wrench, to: "/workers" },
  { label: "Blocks", icon: HardDrive, to: "/blocks" },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-56 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <Server className="h-5 w-5 text-sidebar-primary" />
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-lg tracking-tight">Door</span>
          <span className="text-xs text-sidebar-foreground/60">your garage door</span>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-2 py-4">
        {nav.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-sidebar-border">
        <NavLink
          to="/settings"
          className="text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
        >
          Settings / Connection
        </NavLink>
      </div>
    </aside>
  );
}
