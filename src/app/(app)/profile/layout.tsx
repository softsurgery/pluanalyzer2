import React from "react";
import { getPayloadWithUser } from "@/lib/payload-auth";
import { Navbar } from "@/components/layout/Navbar";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { ProfileShell } from "@/components/profile/ProfileShell";

export const dynamic = "force-dynamic";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getPayloadWithUser();

  if (!user) {
    return (
      <>
        <Navbar user={null} />
        <main className="px-4 pb-12">
          <LoginPanel />
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar user={user} />
      <ProfileShell user={user}>{children}</ProfileShell>
    </>
  );
}
