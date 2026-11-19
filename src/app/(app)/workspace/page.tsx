import { getPayloadWithUser } from "@/lib/payload-auth";
import { resolveWorkspaceTabSettings } from "@/types/workspace";
import { Navbar } from "@/components/layout/Navbar";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { WorkspaceClient } from "@/components/WorkspaceClient";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; tab?: string }>;
}) {
  const { payload, user } = await getPayloadWithUser();
  const resolvedParams = await searchParams;

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

  let workspaceTabs = null;
  try {
    const settings = await payload.findGlobal({
      slug: "workspace-settings",
    });
    workspaceTabs = settings?.tabs;
  } catch {
    // Fallback to defaults if global record is not yet initialized
  }

  const tabSettings = resolveWorkspaceTabSettings(workspaceTabs);

  return (
    <>
      <Navbar user={user} />
      <WorkspaceClient
        initialProjectId={resolvedParams.projectId}
        initialTab={resolvedParams.tab}
        userRole={user.role}
        tabSettings={tabSettings}
      />
    </>
  );
}
