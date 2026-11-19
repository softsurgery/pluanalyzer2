import { redirect } from "next/navigation";
import { getPayloadWithUser } from "@/lib/payload-auth";
import { resolveWorkspaceTabSettings } from "@/types/workspace";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { WorkspaceClient } from "@/components/WorkspaceClient";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; tab?: string; new?: string }>;
}) {
  const { payload, user } = await getPayloadWithUser();
  const resolvedParams = await searchParams;
  if (resolvedParams.projectId) {
    const tabQuery = resolvedParams.tab
      ? `?tab=${encodeURIComponent(resolvedParams.tab)}`
      : "";
    redirect(`/workspace/${resolvedParams.projectId}${tabQuery}`);
  }
  if (resolvedParams.new === "1" || resolvedParams.new === "true") {
    redirect("/workspace/new");
  }

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
      initialTab={resolvedParams.tab}
      userRole={user.role}
      tabSettings={tabSettings}
    />
  );
}
