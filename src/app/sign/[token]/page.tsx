import { PublicEsignView } from "@/components/office/public-esign-view";

export default async function PublicSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicEsignView token={token} />;
}
