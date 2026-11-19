import { getPayloadWithUser } from "@/lib/payload-auth";
import { Navbar } from "@/components/layout/Navbar";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { CreateProjectClient } from "@/components/CreateProjectClient";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const { user } = await getPayloadWithUser();

  if (!user) {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-background">
        <Navbar user={null} />
        <LoginPanel />
      </div>
    );
  }

  return (
    <>
      <Navbar user={user} />
      <CreateProjectClient />
    </>
  );
}
