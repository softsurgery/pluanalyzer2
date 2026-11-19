import { getPayloadWithUser } from "@/lib/payload-auth";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { NewProjectWorkspaceClient } from "@/components/NewProjectWorkspaceClient";

export const dynamic = "force-dynamic";

export default async function NewWorkspacePage() {
  const { user } = await getPayloadWithUser();

  if (!user) {
    return (
      <main className="px-4 pb-12">
        <LoginPanel />
      </main>
    );
  }

  return <NewProjectWorkspaceClient />;
}
