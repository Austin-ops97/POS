import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { CustomerForm } from "@/components/dashboard/customer-form";
import { Button } from "@/components/ui/button";

export default async function NewCustomerPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/customers">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add Customer</h1>
          <p className="text-sm text-slate-500">
            Create a new customer profile
          </p>
        </div>
      </div>
      <CustomerForm />
    </div>
  );
}
