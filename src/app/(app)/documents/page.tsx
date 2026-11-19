import { getPayloadWithUser } from "@/lib/payload-auth";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { DocumentsClient } from "@/components/DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const { user } = await getPayloadWithUser();

  if (!user) {
    return (
      <main className="px-4 pb-12">
        <LoginPanel />
      </main>
    );
  }

  return <DocumentsClient />;
}
