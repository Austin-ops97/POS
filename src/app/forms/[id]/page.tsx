import { PublicFormView } from "@/components/office/public-form-view";

export default async function PublicFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicFormView formId={id} />;
}
