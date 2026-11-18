import { getPayloadWithUser } from "@/lib/payload-auth";
import { Navbar } from "@/components/layout/Navbar";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user } = await getPayloadWithUser();

  if (!user) {
    return (
      <div className="flex flex-col flex-1 min-h-screen bg-background">
        <Navbar user={null} />
        <LoginPanel />
      </div>
    );
  }

  return (
    <>
      <Navbar user={user} />
      <DashboardClient />
    </>
  );
}
