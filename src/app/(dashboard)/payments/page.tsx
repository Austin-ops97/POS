import { PaymentsDashboard } from "@/components/dashboard/payments-dashboard";

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
        <p className="text-sm text-slate-500">
          Balances, payouts, and Stripe Connect health — without leaving NexaPOS
        </p>
      </div>
      <PaymentsDashboard />
    </div>
  );
}
