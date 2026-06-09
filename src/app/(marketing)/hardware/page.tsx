import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const hardware = [
  { name: "Stripe Reader M2", desc: "Mobile Bluetooth card reader for countertop and mobile payments." },
  { name: "Stripe Reader S700", desc: "Smart countertop reader with display for customer-facing interactions." },
  { name: "Tap to Pay", desc: "Accept contactless payments directly on compatible iPhone and Android devices." },
  { name: "Barcode Scanner", desc: "USB and Bluetooth barcode scanners supported in the register." },
  { name: "Receipt Printer", desc: "Thermal receipt printers via browser print or connected devices." },
  { name: "Cash Drawer", desc: "Track opening cash, sales, refunds, and over/short on close." },
];

export default function HardwarePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900">Hardware</h1>
        <p className="mt-4 text-lg text-slate-600">
          Works with Stripe Terminal readers and standard POS peripherals.
        </p>
      </div>
      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {hardware.map((h) => (
          <Card key={h.name}>
            <CardHeader>
              <CardTitle>{h.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500">{h.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
