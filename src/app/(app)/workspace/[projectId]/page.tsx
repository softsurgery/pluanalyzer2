import { getPayloadWithUser } from "@/lib/payload-auth";
import { resolveWorkspaceTabSettings } from "@/types/workspace";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { WorkspaceClient } from "@/components/WorkspaceClient";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { payload, user } = await getPayloadWithUser();
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  if (!user) {
    return (
      <main className="px-4 pb-12">
        <LoginPanel />
      </main>
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
    <WorkspaceClient
      initialProjectId={resolvedParams.projectId}
      initialTab={resolvedSearchParams.tab}
      userRole={user.role}
      tabSettings={tabSettings}
    />
  );
}
