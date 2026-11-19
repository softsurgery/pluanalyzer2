"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, FolderKanban, MapPin } from "lucide-react";
import type { AuthUser } from "@/access/roles";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/shared/ModeToggle";
import { UserNav } from "@/components/UserNav";
import { cn } from "@/lib/utils";

interface NavbarProps {
  className?: string;
  user: AuthUser | null;
}

export function Navbar({ className, user }: NavbarProps) {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Projets", icon: FolderKanban },
    { href: "/workspace", label: "Analyse PLU & Carte", icon: MapPin },
    { href: "/documents", label: "Documents PLU", icon: FileText },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-card/95 backdrop-blur",
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-semibold text-foreground"
          >
            <div className="text-sm font-bold tracking-tight">PLU Analyzer</div>
          </Link>

          {user && (
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/"
                    ? pathname === "/" || pathname.startsWith("/projects")
                    : pathname === item.href;
                return (
                  <Button
                    key={item.href}
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    asChild
                    className={
                      active
                        ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        : "text-muted-foreground"
                    }
                  >
                    <Link href={item.href}>
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </Button>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <>
              <UserNav user={user} />
              <Separator orientation="vertical" className="h-6" />
            </>
          )}
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
