import { getPayloadWithUser } from "@/lib/payload-auth";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user } = await getPayloadWithUser();

  if (!user) {
    return (
      <div className="flex flex-col flex-1 min-h-screen bg-background">
        <LoginPanel />
      </div>
    );
  }

  return <DashboardClient />;
}
