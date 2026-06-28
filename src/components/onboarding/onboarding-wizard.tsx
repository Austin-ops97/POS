"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
  Plus,
  Trash2,
  Sparkles,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import {
  businessInfoSchema,
  businessTypeSchema,
  locationSchema,
  onboardingTaxSchema,
  receiptSettingsSchema,
  productSchema,
  onboardingEmployeeSchema,
} from "@/lib/validations";
import { ONBOARDING_STEPS, ONBOARDING_STEP_LABELS } from "@/lib/onboarding";
import { StepIndicator } from "./step-indicator";
import { useOnboarding } from "./use-onboarding";

const onboardingProductSchema = productSchema.pick({
  name: true,
  price: true,
  sku: true,
  barcode: true,
});

type BusinessInfoData = z.infer<typeof businessInfoSchema>;
type BusinessTypeData = z.infer<typeof businessTypeSchema>;
type LocationData = z.infer<typeof locationSchema>;
type TaxData = z.infer<typeof onboardingTaxSchema>;
type ReceiptData = z.infer<typeof receiptSettingsSchema>;
type ProductData = z.infer<typeof onboardingProductSchema>;
type EmployeeInvite = z.infer<typeof onboardingEmployeeSchema>;

type StripeStatus = {
  status: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
};

type Role = { id: string; name: string };

const BUSINESS_TYPES = [
  { value: "RETAIL", label: "Retail", description: "Sell physical products in-store or online" },
  { value: "SERVICE", label: "Service", description: "Appointments, services, and time-based billing" },
  { value: "RENTAL", label: "Rental", description: "Rent equipment, vehicles, or spaces" },
  { value: "RESTAURANT", label: "Restaurant", description: "Food service with menu and modifiers" },
  { value: "HYBRID", label: "Hybrid", description: "Mix of products, services, and more" },
] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const {
    currentStep,
    stepKey,
    loading,
    submitting,
    setSubmitting,
    businessId,
    setBusinessId,
    patchOnboarding,
    scheduleAutoSave,
    loadBusiness,
    goToStep,
    advanceStep,
    completeOnboarding,
    progress,
  } = useOnboarding();

  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [invites, setInvites] = useState<EmployeeInvite[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const infoForm = useForm<BusinessInfoData>({
    resolver: zodResolver(businessInfoSchema),
    defaultValues: {
      name: "",
      legalName: "",
      phone: "",
      email: "",
      website: "",
      primaryColor: "#1e3a5f",
    },
  });

  const typeForm = useForm<BusinessTypeData>({
    resolver: zodResolver(businessTypeSchema),
    defaultValues: { type: "RETAIL" },
  });

  const locationForm = useForm<LocationData>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: "Main Location",
      street: "",
      city: "",
      state: "",
      zip: "",
      country: "US",
      timezone: "America/New_York",
      taxRegion: "",
    },
  });

  const taxForm = useForm<TaxData>({
    resolver: zodResolver(onboardingTaxSchema),
    defaultValues: {
      name: "Sales Tax",
      rate: 0,
      appliesToProducts: true,
      appliesToServices: true,
    },
  });

  const receiptForm = useForm<ReceiptData>({
    resolver: zodResolver(receiptSettingsSchema),
    defaultValues: {
      receiptFooter: "",
      showCashierOnReceipt: true,
      showCustomerOnReceipt: true,
      showSkuOnReceipt: false,
      enableReceiptPrinting: true,
    },
  });

  const productForm = useForm<ProductData>({
    resolver: zodResolver(onboardingProductSchema),
    defaultValues: { name: "", price: 0, sku: "", barcode: "" },
  });

  const inviteForm = useForm<EmployeeInvite>({
    resolver: zodResolver(onboardingEmployeeSchema),
    defaultValues: { name: "", email: "", roleId: "" },
  });

  const hydrateFromBusiness = useCallback(
    (biz: {
      name: string;
      type: string;
      legalName?: string | null;
      phone?: string | null;
      email?: string | null;
      website?: string | null;
      primaryColor: string;
      locations?: Array<{
        name: string;
        street?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
        country: string;
        timezone: string;
        taxRegion?: string | null;
      }>;
      settings?: {
        receiptFooter?: string | null;
        showCashierOnReceipt: boolean;
        showCustomerOnReceipt: boolean;
        showSkuOnReceipt: boolean;
        enableReceiptPrinting: boolean;
      } | null;
      taxRates?: Array<{
        name: string;
        rate: unknown;
        appliesToProducts: boolean;
        appliesToServices: boolean;
      }>;
    }) => {
      infoForm.reset({
        name: biz.name || "",
        legalName: biz.legalName || "",
        phone: biz.phone || "",
        email: biz.email || "",
        website: biz.website || "",
        primaryColor: biz.primaryColor || "#1e3a5f",
      });
      typeForm.reset({ type: (biz.type as BusinessTypeData["type"]) || "RETAIL" });

      if (biz.locations?.[0]) {
        const loc = biz.locations[0];
        locationForm.reset({
          name: loc.name,
          street: loc.street || "",
          city: loc.city || "",
          state: loc.state || "",
          zip: loc.zip || "",
          country: loc.country || "US",
          timezone: loc.timezone || "America/New_York",
          taxRegion: loc.taxRegion || "",
        });
      }

      if (biz.taxRates?.[0]) {
        const tax = biz.taxRates[0];
        taxForm.reset({
          name: tax.name,
          rate: Number(tax.rate),
          appliesToProducts: tax.appliesToProducts,
          appliesToServices: tax.appliesToServices,
        });
      }

      if (biz.settings) {
        receiptForm.reset({
          receiptFooter: biz.settings.receiptFooter || "",
          showCashierOnReceipt: biz.settings.showCashierOnReceipt,
          showCustomerOnReceipt: biz.settings.showCustomerOnReceipt,
          showSkuOnReceipt: biz.settings.showSkuOnReceipt,
          enableReceiptPrinting: biz.settings.enableReceiptPrinting,
        });
      }
    },
    [infoForm, typeForm, locationForm, taxForm, receiptForm]
  );

  useEffect(() => {
    async function load() {
      const biz = await loadBusiness();
      if (biz) hydrateFromBusiness(biz);
    }
    if (!loading) void load();
  }, [loading, loadBusiness, hydrateFromBusiness]);

  useEffect(() => {
    if (stepKey === "STRIPE_CONNECT") void fetchStripeStatus();
    if (stepKey === "INVITE_EMPLOYEES") void fetchRoles();
  }, [stepKey]);

  async function fetchStripeStatus() {
    try {
      const res = await fetch("/api/stripe/connect");
      if (res.ok) setStripeStatus(await res.json());
    } catch {
      setStripeStatus({ status: "NOT_CONNECTED" });
    }
  }

  async function fetchRoles() {
    try {
      const res = await fetch("/api/roles");
      if (res.ok) {
        const data = await res.json();
        setRoles(data.filter((r: Role) => r.name !== "Owner"));
        if (data.length > 0 && !inviteForm.getValues("roleId")) {
          const cashier = data.find((r: Role) => r.name === "Cashier");
          inviteForm.setValue("roleId", cashier?.id ?? data[0].id);
        }
      }
    } catch {
      /* roles optional */
    }
  }

  async function handleConnectStripe() {
    setSubmitting(true);
    try {
      const baseUrl = window.location.origin;
      const res = await fetch("/api/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${baseUrl}/onboarding`,
          refreshUrl: `${baseUrl}/onboarding`,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start Stripe onboarding");
      }
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
        toast.info("Complete Stripe setup in the new tab, then return here");
      }
      await fetchStripeStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stripe connection failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCurrentStep(skipValidation = false): Promise<boolean> {
    setSubmitting(true);
    try {
      switch (stepKey) {
        case "WELCOME": {
          await advanceStep();
          return true;
        }
        case "BUSINESS_INFO": {
          const parsed = businessInfoSchema.parse(infoForm.getValues());

          if (!businessId) {
            const res = await fetch("/api/business", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsed),
            });
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || "Failed to create business");
            }
            const data = await res.json();
            setBusinessId(data.id);
          } else {
            await patchOnboarding("BUSINESS_INFO", { businessInfo: parsed });
          }
          break;
        }
        case "BUSINESS_TYPE": {
          const parsed = businessTypeSchema.parse(typeForm.getValues());
          await patchOnboarding("BUSINESS_TYPE", { businessType: parsed });
          break;
        }
        case "BUSINESS_ADDRESS": {
          const parsed = locationSchema.parse(locationForm.getValues());
          await patchOnboarding("BUSINESS_ADDRESS", { location: parsed });
          break;
        }
        case "TAX_SETTINGS": {
          const parsed = onboardingTaxSchema.parse(taxForm.getValues());
          await patchOnboarding("TAX_SETTINGS", { taxSettings: parsed });
          break;
        }
        case "RECEIPT_SETTINGS": {
          const parsed = receiptSettingsSchema.parse(receiptForm.getValues());
          await patchOnboarding("RECEIPT_SETTINGS", { receiptSettings: parsed });
          break;
        }
        case "STRIPE_CONNECT": {
          await patchOnboarding("STRIPE_CONNECT", {});
          break;
        }
        case "IMPORT_PRODUCTS": {
          if (products.length > 0) {
            for (const product of products) {
              await fetch("/api/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(product),
              });
            }
          }
          await patchOnboarding("IMPORT_PRODUCTS", {});
          break;
        }
        case "INVITE_EMPLOYEES": {
          for (const invite of invites) {
            await fetch("/api/employees", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(invite),
            });
          }
          await patchOnboarding("INVITE_EMPLOYEES", {});
          await completeOnboarding();
          return true;
        }
        case "COMPLETED": {
          await completeOnboarding();
          return true;
        }
      }

      const next = ONBOARDING_STEPS[currentStep + 1];
      if (next && businessId) await patchOnboarding(next, {});
      await advanceStep();
      if (!skipValidation) toast.success("Progress saved");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    switch (stepKey) {
      case "BUSINESS_INFO":
        void infoForm.handleSubmit(() => saveCurrentStep())();
        break;
      case "BUSINESS_TYPE":
        void typeForm.handleSubmit(() => saveCurrentStep())();
        break;
      case "BUSINESS_ADDRESS":
        void locationForm.handleSubmit(() => saveCurrentStep())();
        break;
      case "TAX_SETTINGS":
        void taxForm.handleSubmit(() => saveCurrentStep())();
        break;
      case "RECEIPT_SETTINGS":
        void receiptForm.handleSubmit(() => saveCurrentStep())();
        break;
      default:
        void saveCurrentStep();
    }
  }

  function handleSkip() {
    void saveCurrentStep(true);
  }

  function handleAddProduct() {
    const values = productForm.getValues();
    const parsed = onboardingProductSchema.parse({
      ...values,
      price: Number(values.price),
    });
    setProducts([...products, parsed]);
    productForm.reset({ name: "", price: 0, sku: "", barcode: "" });
    toast.success("Product added");
  }

  function handleAddInvite() {
    const values = inviteForm.getValues();
    const parsed = onboardingEmployeeSchema.parse(values);
    setInvites([...invites, parsed]);
    inviteForm.reset({
      name: "",
      email: "",
      roleId: roles.find((r) => r.name === "Cashier")?.id ?? roles[0]?.id ?? "",
    });
    toast.success("Team member added");
  }

  // Auto-save on form changes for data steps
  useEffect(() => {
    if (!businessId) return;
    const sub = infoForm.watch((values) => {
      if (stepKey === "BUSINESS_INFO") {
        scheduleAutoSave("BUSINESS_INFO", { businessInfo: values });
      }
    });
    return () => sub.unsubscribe();
  }, [businessId, stepKey, infoForm, scheduleAutoSave]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const isSkippable =
    stepKey === "STRIPE_CONNECT" ||
    stepKey === "IMPORT_PRODUCTS" ||
    stepKey === "INVITE_EMPLOYEES";

  const stepDescriptions: Record<string, string> = {
    WELCOME: "Let's get your business set up in just a few minutes.",
    BUSINESS_INFO: "Tell us the basics about your business.",
    BUSINESS_TYPE: "Choose your industry so we can tailor NexaPOS for you.",
    BUSINESS_ADDRESS: "Where is your primary business location?",
    TAX_SETTINGS: "Configure how taxes are calculated on sales.",
    RECEIPT_SETTINGS: "Customize what appears on customer receipts.",
    STRIPE_CONNECT: "Connect Stripe to accept card payments in-store.",
    IMPORT_PRODUCTS: "Add products now or skip and import later.",
    INVITE_EMPLOYEES: "Invite your team or manage staff later in Settings.",
    COMPLETED: "You're all set!",
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            N
          </div>
          <span className="text-lg font-semibold text-slate-900">NexaPOS</span>
          <Badge variant="secondary" className="ml-auto">
            Setup · {Math.round(progress)}%
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <StepIndicator currentStep={currentStep} className="mb-8" />

        <Card>
          <CardHeader>
            <CardTitle>
              {stepKey === "WELCOME" ? (
                <span className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  Welcome to NexaPOS
                </span>
              ) : (
                ONBOARDING_STEP_LABELS[stepKey]
              )}
            </CardTitle>
            <CardDescription>{stepDescriptions[stepKey]}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {stepKey === "WELCOME" && (
              <div className="space-y-6 py-4 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <Sparkles className="h-10 w-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-slate-900">
                    Your modern point of sale starts here
                  </h2>
                  <p className="mx-auto max-w-md text-sm text-slate-500">
                    We&apos;ll walk you through business setup, payments, and your
                    first products. You can leave anytime — your progress is saved
                    automatically.
                  </p>
                </div>
                <ul className="mx-auto grid max-w-sm gap-2 text-left text-sm text-slate-600">
                  {[
                    "Takes about 5–10 minutes",
                    "Auto-saves as you go",
                    "Card payments via Stripe Connect",
                    "Start selling with cash immediately",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {stepKey === "BUSINESS_INFO" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="name">Business Name *</Label>
                  <Input id="name" {...infoForm.register("name")} placeholder="My Store" />
                  {infoForm.formState.errors.name && (
                    <p className="text-sm text-red-600">{infoForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="legalName">Legal Name</Label>
                  <Input id="legalName" {...infoForm.register("legalName")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" {...infoForm.register("phone")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...infoForm.register("email")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" {...infoForm.register("website")} placeholder="https://" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Brand Color</Label>
                  <div className="flex gap-3">
                    <Input
                      id="primaryColor"
                      type="color"
                      className="h-10 w-16 cursor-pointer p-1"
                      {...infoForm.register("primaryColor")}
                    />
                    <Input {...infoForm.register("primaryColor")} className="flex-1" />
                  </div>
                </div>
              </div>
            )}

            {stepKey === "BUSINESS_TYPE" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    key={bt.value}
                    type="button"
                    onClick={() => typeForm.setValue("type", bt.value)}
                    className={cn(
                      "rounded-xl border-2 p-4 text-left transition-all",
                      typeForm.watch("type") === bt.value
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <p className="font-semibold text-slate-900">{bt.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{bt.description}</p>
                  </button>
                ))}
              </div>
            )}

            {stepKey === "BUSINESS_ADDRESS" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="locName">Location Name *</Label>
                  <Input id="locName" {...locationForm.register("name")} />
                  {locationForm.formState.errors.name && (
                    <p className="text-sm text-red-600">{locationForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="street">Street Address</Label>
                  <Input id="street" {...locationForm.register("street")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" {...locationForm.register("city")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" {...locationForm.register("state")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">ZIP Code</Label>
                  <Input id="zip" {...locationForm.register("zip")} />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Controller
                    control={locationForm.control}
                    name="timezone"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="America/New_York">Eastern</SelectItem>
                          <SelectItem value="America/Chicago">Central</SelectItem>
                          <SelectItem value="America/Denver">Mountain</SelectItem>
                          <SelectItem value="America/Los_Angeles">Pacific</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            )}

            {stepKey === "TAX_SETTINGS" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="taxName">Tax Name *</Label>
                  <Input id="taxName" {...taxForm.register("name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxRate">Tax Rate (%)</Label>
                  <Controller
                    control={taxForm.control}
                    name="rate"
                    render={({ field }) => (
                      <Input
                        id="taxRate"
                        type="number"
                        step="0.001"
                        min="0"
                        max="100"
                        value={field.value != null ? (field.value * 100).toFixed(3).replace(/\.?0+$/, "") : ""}
                        onChange={(e) => {
                          const pct = e.target.value === "" ? 0 : Number(e.target.value);
                          field.onChange(pct / 100);
                        }}
                      />
                    )}
                  />
                  <p className="text-xs text-slate-500">Enter as percentage (e.g. 8.25 for 8.25%)</p>
                </div>
                <div className="flex flex-col gap-3 sm:col-span-2">
                  <div className="flex items-center gap-3">
                    <Controller
                      control={taxForm.control}
                      name="appliesToProducts"
                      render={({ field }) => (
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      )}
                    />
                    <Label className="font-normal">Apply to products</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Controller
                      control={taxForm.control}
                      name="appliesToServices"
                      render={({ field }) => (
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      )}
                    />
                    <Label className="font-normal">Apply to services</Label>
                  </div>
                </div>
              </div>
            )}

            {stepKey === "RECEIPT_SETTINGS" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="receiptFooter">Receipt Footer</Label>
                  <Textarea
                    id="receiptFooter"
                    {...receiptForm.register("receiptFooter")}
                    placeholder="Thank you for your business!"
                    rows={3}
                  />
                </div>
                {(
                  [
                    ["showCashierOnReceipt", "Show cashier name"],
                    ["showCustomerOnReceipt", "Show customer name"],
                    ["showSkuOnReceipt", "Show SKU on line items"],
                    ["enableReceiptPrinting", "Enable receipt printing"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3">
                    <Controller
                      control={receiptForm.control}
                      name={key}
                      render={({ field }) => (
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      )}
                    />
                    <Label className="font-normal">{label}</Label>
                  </div>
                ))}
              </div>
            )}

            {stepKey === "STRIPE_CONNECT" && (
              <div className="space-y-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">Stripe Connect</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Accept cards in-store and online. Payouts go directly to your bank.
                      </p>
                    </div>
                    <Badge
                      variant={
                        stripeStatus?.status === "CONNECTED" ||
                        stripeStatus?.status === "READY"
                          ? "success"
                          : stripeStatus?.status === "PENDING"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {stripeStatus?.status?.replace(/_/g, " ") || "Not Connected"}
                    </Badge>
                  </div>
                  <Button className="mt-4" onClick={handleConnectStripe} disabled={submitting}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Connect with Stripe
                  </Button>
                </div>
                <p className="text-sm text-slate-500">
                  Cash payments work without Stripe. You can connect payments anytime from Settings → Payments.
                </p>
              </div>
            )}

            {stepKey === "IMPORT_PRODUCTS" && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Product Name</Label>
                    <Input {...productForm.register("name")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Price</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      {...productForm.register("price", { valueAsNumber: true })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SKU</Label>
                    <Input {...productForm.register("sku")} />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="button" variant="outline" onClick={handleAddProduct}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add to list
                    </Button>
                  </div>
                </div>
                {products.length > 0 && (
                  <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {products.map((p, i) => (
                      <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                        <span className="font-medium">{p.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-600">{formatCurrency(p.price)}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setProducts(products.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {stepKey === "INVITE_EMPLOYEES" && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input {...inviteForm.register("name")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" {...inviteForm.register("email")} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Role</Label>
                    <Controller
                      control={inviteForm.control}
                      name="roleId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="button" variant="outline" onClick={handleAddInvite}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add team member
                    </Button>
                  </div>
                </div>
                {invites.length > 0 && (
                  <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {invites.map((inv, i) => (
                      <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                        <div>
                          <p className="font-medium">{inv.name}</p>
                          <p className="text-slate-500">{inv.email}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setInvites(invites.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={() => goToStep(currentStep - 1)}
            disabled={currentStep === 0 || submitting}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>

          <div className="flex gap-3">
            {isSkippable && (
              <Button variant="ghost" onClick={handleSkip} disabled={submitting}>
                Skip
              </Button>
            )}
            <Button onClick={handleNext} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {stepKey === "INVITE_EMPLOYEES"
                ? "Complete Setup"
                : stepKey === "WELCOME"
                  ? "Get Started"
                  : "Continue"}
              {stepKey !== "INVITE_EMPLOYEES" && !submitting && (
                <ChevronRight className="ml-1 h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {businessId && (
          <p className="mt-4 text-center text-xs text-slate-400">
            Progress saved automatically ·{" "}
            <button
              type="button"
              className="underline hover:text-slate-600"
              onClick={() => router.push("/dashboard")}
            >
              Exit setup
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
