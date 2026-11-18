import { getPayloadWithUser } from "@/lib/payload-auth";
import { Navbar } from "@/components/layout/Navbar";
import { LoginPanel } from "@/components/LoginPanel";
import { DocumentsClient } from "@/components/DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
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
      <DocumentsClient />
    </>
  );
}
