"use client";

import React from "react";
import { KeyRound, User as UserIcon } from "lucide-react";
import type { AuthUser } from "@/access/roles";
import { getRoleLabel, getUserInitials } from "@/lib/user-display";
import { NavTab, type NavTabItem } from "@/components/shared/NavTab";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const PROFILE_NAV_ITEMS: NavTabItem[] = [
  {
    href: "/profile",
    title: "Informations du profil",
    icon: <UserIcon className="size-4" />,
  },
  {
    href: "/profile/security",
    title: "Sécurité & Mot de passe",
    icon: <KeyRound className="size-4" />,
  },
];

export function ProfileShell({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  const initials = getUserInitials(user.fullName, user.email);
  const displayName = user.fullName || user.email || "Utilisateur";

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {displayName}
              </h1>
              {user.role && (
                <Badge variant="secondary" className="text-[11px] uppercase">
                  {getRoleLabel(user.role)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {user.email}
              {user.organization ? ` · ${user.organization}` : ""}
            </p>
          </div>
        </div>
      </div>

      <NavTab items={PROFILE_NAV_ITEMS} />

      <div>{children}</div>
    </main>
  );
}
