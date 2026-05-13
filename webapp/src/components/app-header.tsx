import { Link, useRouterState } from "@tanstack/react-router";
import { Sparkles, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const BASE_NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/learn", label: "Learn" },
  { to: "/practice", label: "Practice" },
  { to: "/doubtsolver", label: "Doubt Solver" },
  { to: "/interview", label: "Talk with Buddy" },
] as const;

export function AppHeader() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, profile, signOut } = useAuth();

  const nav = profile?.type === "admin"
    ? [...BASE_NAV, { to: "/admin", label: "Admin" } as const]
    : BASE_NAV;

  const initials = profile?.displayName
    ? profile.displayName
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 glass">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight"
        >
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          StudyBuddy AI
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => {
            const active = path === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="hidden text-right md:block">
                <p className="text-sm font-medium">{profile?.displayName ?? user.displayName}</p>
                <p className="text-xs text-muted-foreground">{profile?.email ?? user.email}</p>
              </div>
              {profile?.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName ?? "User"}
                  className="h-9 w-9 rounded-full object-cover ring-2 ring-primary/30"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet to-mint text-sm font-semibold text-ink">
                  {initials}
                </div>
              )}
              <button
                onClick={() => signOut()}
                title="Sign out"
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Link
              to="/"
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
