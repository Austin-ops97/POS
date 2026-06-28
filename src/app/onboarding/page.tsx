"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2,
  MapPin,
  Settings2,
  CreditCard,
  Package,
  Crown,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  businessProfileSchema,
  locationSchema,
  posConfigSchema,
  productSchema,
} from "@/lib/validations";
import { STRIPE_PLANS } from "@/lib/stripe";

const STEPS = [
  { key: "BUSINESS_PROFILE", label: "Business", icon: Building2 },
  { key: "LOCATION_SETUP", label: "Location", icon: MapPin },
  { key: "POS_CONFIG", label: "POS Setup", icon: Settings2 },
  { key: "STRIPE_CONNECT", label: "Payments", icon: CreditCard },
  { key: "FIRST_PRODUCTS", label: "Products", icon: Package },
  { key: "CHOOSE_PLAN", label: "Plan", icon: Crown },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const MODULE_KEY_ALIASES: Record<string, string> = {
  retail: "RETAIL",
  physical_products: "RETAIL",
  service: "SERVICE",
  services: "SERVICE",
  rental: "RENTAL",
  rentals: "RENTAL",
};

function resolveModuleEnabled(
  moduleMap: Record<string, boolean>,
  canonicalKey: string,
  fallback: boolean
): boolean {
  if (canonicalKey in moduleMap) return moduleMap[canonicalKey];
  for (const [alias, key] of Object.entries(MODULE_KEY_ALIASES)) {
    if (key === canonicalKey && alias in moduleMap) {
      return moduleMap[alias];
    }
  }
  return fallback;
}

const onboardingProductSchema = productSchema.pick({
  name: true,
  price: true,
  sku: true,
  barcode: true,
});

type BusinessData = z.infer<typeof businessProfileSchema>;
type LocationData = z.infer<typeof locationSchema>;
type PosConfigData = z.infer<typeof posConfigSchema>;
type ProductData = z.infer<typeof onboardingProductSchema>;

type StripeStatus = {
  status: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  demoMode?: boolean;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>("STARTER");
  const [products, setProducts] = useState<ProductData[]>([]);

  const profileForm = useForm<BusinessData>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: {
      name: "",
      type: "RETAIL",
      legalName: "",
      phone: "",
      email: "",
      website: "",
      primaryColor: "#1e3a5f",
    },
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

  const posForm = useForm<PosConfigData>({
    resolver: zodResolver(posConfigSchema),
    defaultValues: {
      sellPhysical: true,
      sellServices: false,
      rentItems: false,
      trackInventory: true,
      acceptCash: true,
      barcodeScanning: true,
      receiptPrinting: true,
      employeePinLogin: false,
      multipleLocations: false,
    },
  });

  const productForm = useForm<ProductData>({
    resolver: zodResolver(onboardingProductSchema),
    defaultValues: { name: "", price: 0, sku: "", barcode: "" },
  });

  useEffect(() => {
    async function loadBusiness() {
      try {
        const res = await fetch("/api/business");
        if (res.ok) {
          const data = await res.json();
          const biz = data.business || data;
          setBusinessId(biz.id);

          profileForm.reset({
            name: biz.name || "",
            type: biz.type || "RETAIL",
            legalName: biz.legalName || "",
            phone: biz.phone || "",
            email: biz.email || "",
            website: biz.website || "",
            primaryColor: biz.primaryColor || "#1e3a5f",
          });

          const stepIndex = STEPS.findIndex(
            (s) => s.key === biz.onboardingStep
          );
          if (stepIndex >= 0 && biz.onboardingStep !== "COMPLETED") {
            setCurrentStep(stepIndex);
          } else if (biz.onboardingComplete) {
            router.push("/dashboard");
            return;
          }

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

          if (biz.moduleSettings) {
            const modules = Object.fromEntries(
              biz.moduleSettings.map((m: { module: string; enabled: boolean }) => [
                m.module,
                m.enabled,
              ])
            );
            posForm.reset({
              sellPhysical: resolveModuleEnabled(modules, "RETAIL", true),
              sellServices: resolveModuleEnabled(modules, "SERVICE", false),
              rentItems: resolveModuleEnabled(modules, "RENTAL", false),
              trackInventory: modules.inventory ?? true,
              acceptCash: biz.settings?.enableCash ?? true,
              barcodeScanning: biz.settings?.enableBarcodeScanning ?? true,
              receiptPrinting: biz.settings?.enableReceiptPrinting ?? true,
              employeePinLogin: biz.settings?.requirePinAtRegister ?? false,
              multipleLocations: modules.multipleLocations ?? false,
            });
          }
        }
      } catch {
        /* new user — start fresh */
      } finally {
        setLoading(false);
      }
    }
    loadBusiness();
  }, [profileForm, locationForm, posForm, router]);

  useEffect(() => {
    if (currentStep === 3) {
      fetchStripeStatus();
    }
  }, [currentStep]);

  async function fetchStripeStatus() {
    try {
      const res = await fetch("/api/stripe/connect");
      if (res.ok) {
        const data = await res.json();
        setStripeStatus(data);
      }
    } catch {
      setStripeStatus({ status: "NOT_CONNECTED", demoMode: true });
    }
  }

  async function patchOnboarding(step: StepKey, data: Record<string, unknown>) {
    const res = await fetch("/api/business/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, ...data }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save step");
    }
    return res.json();
  }

  async function handleStepSubmit() {
    setSubmitting(true);
    try {
      switch (STEPS[currentStep].key) {
        case "BUSINESS_PROFILE": {
          const values = profileForm.getValues();
          const parsed = businessProfileSchema.parse(values);

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
            setBusinessId(data.business?.id || data.id);
          } else {
            await patchOnboarding("BUSINESS_PROFILE", { businessProfile: parsed });
          }
          break;
        }
        case "LOCATION_SETUP": {
          const values = locationForm.getValues();
          const parsed = locationSchema.parse(values);
          await patchOnboarding("LOCATION_SETUP", { location: parsed });
          break;
        }
        case "POS_CONFIG": {
          const values = posForm.getValues();
          const parsed = posConfigSchema.parse(values);
          await patchOnboarding("POS_CONFIG", { posConfig: parsed });
          break;
        }
        case "STRIPE_CONNECT": {
          await patchOnboarding("STRIPE_CONNECT", {
            stripeSkipped: stripeStatus?.status !== "CONNECTED",
          });
          break;
        }
        case "FIRST_PRODUCTS": {
          if (products.length > 0) {
            for (const product of products) {
              await fetch("/api/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(product),
              });
            }
          }
          await patchOnboarding("FIRST_PRODUCTS", {
            productsAdded: products.length,
            skipped: products.length === 0,
          });
          break;
        }
        case "CHOOSE_PLAN": {
          await patchOnboarding("CHOOSE_PLAN", { plan: selectedPlan });

          if (selectedPlan !== "ENTERPRISE") {
            const res = await fetch("/api/stripe/billing", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plan: selectedPlan }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.url) {
                window.location.href = data.url;
                return;
              }
            }
          }

          await patchOnboarding("CHOOSE_PLAN", { plan: selectedPlan, complete: true });
          toast.success("Onboarding complete!");
          router.push("/dashboard");
          return;
        }
      }

      if (currentStep < STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
        toast.success("Step saved");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConnectStripe() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
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

  function handleAddProduct() {
    const values = productForm.getValues();
    const parsed = onboardingProductSchema.parse({
      ...values,
      price: Number(values.price),
    });
    setProducts([...products, parsed]);
    productForm.reset({ name: "", price: 0, sku: "", barcode: "" });
    toast.success("Product added to list");
  }

  function handleNext() {
    switch (STEPS[currentStep].key) {
      case "BUSINESS_PROFILE":
        profileForm.handleSubmit(() => handleStepSubmit())();
        break;
      case "LOCATION_SETUP":
        locationForm.handleSubmit(() => handleStepSubmit())();
        break;
      case "POS_CONFIG":
        posForm.handleSubmit(() => handleStepSubmit())();
        break;
      default:
        handleStepSubmit();
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const step = STEPS[currentStep];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            N
          </div>
          <span className="text-lg font-semibold text-slate-900">NexaPOS</span>
          <Badge variant="secondary" className="ml-auto">
            Setup Wizard
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <nav className="mb-10">
          <ol className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === currentStep;
              const isComplete = i < currentStep;
              return (
                <li key={s.key} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors",
                        isComplete
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : isActive
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-400"
                      )}
                    >
                      {isComplete ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "mt-2 hidden text-xs font-medium sm:block",
                        isActive ? "text-slate-900" : "text-slate-400"
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "mx-2 h-0.5 flex-1",
                        i < currentStep ? "bg-emerald-500" : "bg-slate-200"
                      )}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <Card>
          <CardHeader>
            <CardTitle>
              Step {currentStep + 1}: {step.label}
            </CardTitle>
            <CardDescription>
              {currentStep === 0 && "Tell us about your business to get started."}
              {currentStep === 1 && "Set up your primary store location."}
              {currentStep === 2 && "Configure which POS features you need."}
              {currentStep === 3 && "Connect Stripe to accept card payments."}
              {currentStep === 4 && "Add your first products or skip for now."}
              {currentStep === 5 && "Choose the plan that fits your business."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {step.key === "BUSINESS_PROFILE" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="name">Business Name *</Label>
                  <Input
                    id="name"
                    {...profileForm.register("name")}
                    placeholder="My Store"
                  />
                  {profileForm.formState.errors.name && (
                    <p className="text-sm text-red-600">
                      {profileForm.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Business Type *</Label>
                  <Controller
                    control={profileForm.control}
                    name="type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RETAIL">Retail</SelectItem>
                          <SelectItem value="SERVICE">Service</SelectItem>
                          <SelectItem value="RENTAL">Rental</SelectItem>
                          <SelectItem value="RESTAURANT">Restaurant</SelectItem>
                          <SelectItem value="HYBRID">Hybrid</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="legalName">Legal Name</Label>
                  <Input id="legalName" {...profileForm.register("legalName")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" {...profileForm.register("phone")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...profileForm.register("email")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" {...profileForm.register("website")} placeholder="https://" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-3">
                    <Input
                      id="primaryColor"
                      type="color"
                      className="h-10 w-16 cursor-pointer p-1"
                      {...profileForm.register("primaryColor")}
                    />
                    <Input
                      {...profileForm.register("primaryColor")}
                      placeholder="#1e3a5f"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            )}

            {step.key === "LOCATION_SETUP" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="locName">Location Name *</Label>
                  <Input id="locName" {...locationForm.register("name")} />
                  {locationForm.formState.errors.name && (
                    <p className="text-sm text-red-600">
                      {locationForm.formState.errors.name.message}
                    </p>
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

            {step.key === "POS_CONFIG" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["sellPhysical", "Sell physical products"],
                    ["sellServices", "Sell services"],
                    ["rentItems", "Rent items"],
                    ["trackInventory", "Track inventory"],
                    ["acceptCash", "Accept cash payments"],
                    ["barcodeScanning", "Barcode scanning"],
                    ["receiptPrinting", "Receipt printing"],
                    ["employeePinLogin", "Employee PIN login"],
                    ["multipleLocations", "Multiple locations"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3 rounded-lg border border-slate-200 p-4">
                    <Controller
                      control={posForm.control}
                      name={key}
                      render={({ field }) => (
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      )}
                    />
                    <Label className="cursor-pointer font-normal">{label}</Label>
                  </div>
                ))}
              </div>
            )}

            {step.key === "STRIPE_CONNECT" && (
              <div className="space-y-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">Stripe Account</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Connect Stripe to accept card payments and use Terminal.
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

                  {stripeStatus?.chargesEnabled && (
                    <p className="mt-3 text-sm text-emerald-600">
                      Charges and payouts are enabled.
                    </p>
                  )}

                  <Button
                    className="mt-4"
                    onClick={handleConnectStripe}
                    disabled={submitting}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Connect with Stripe
                  </Button>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-800">Demo Mode</p>
                  <p className="mt-1 text-sm text-amber-700">
                    You can skip Stripe setup and continue in demo mode. Card payments
                    will be simulated until you connect a live Stripe account.
                  </p>
                </div>
              </div>
            )}

            {step.key === "FIRST_PRODUCTS" && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="prodName">Product Name</Label>
                    <Input id="prodName" {...productForm.register("name")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prodPrice">Price</Label>
                    <Input
                      id="prodPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      {...productForm.register("price", { valueAsNumber: true })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prodSku">SKU</Label>
                    <Input id="prodSku" {...productForm.register("sku")} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="prodBarcode">Barcode</Label>
                    <Input id="prodBarcode" {...productForm.register("barcode")} />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="button" variant="outline" onClick={handleAddProduct}>
                      Add Product
                    </Button>
                  </div>
                </div>

                {products.length > 0 && (
                  <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {products.map((p, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between px-4 py-3 text-sm"
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="text-slate-600">
                          {formatCurrency(p.price)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {step.key === "CHOOSE_PLAN" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(STRIPE_PLANS).map(([key, plan]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPlan(key)}
                    className={cn(
                      "rounded-xl border-2 p-5 text-left transition-all",
                      selectedPlan === key
                        ? "border-slate-900 bg-slate-50 shadow-sm"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                      {selectedPlan === key && (
                        <Check className="h-5 w-5 text-slate-900" />
                      )}
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {plan.price === 0
                        ? "Custom"
                        : formatCurrency(plan.price / 100)}
                      {plan.price > 0 && (
                        <span className="text-sm font-normal text-slate-500">
                          /mo
                        </span>
                      )}
                    </p>
                    <ul className="mt-3 space-y-1">
                      {plan.features.map((f) => (
                        <li key={f} className="text-sm text-slate-600">
                          • {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0 || submitting}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>

          <div className="flex gap-3">
            {(step.key === "STRIPE_CONNECT" || step.key === "FIRST_PRODUCTS") && (
              <Button
                variant="ghost"
                onClick={handleStepSubmit}
                disabled={submitting}
              >
                Skip
              </Button>
            )}
            <Button onClick={handleNext} disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {currentStep === STEPS.length - 1 ? "Complete Setup" : "Continue"}
              {currentStep < STEPS.length - 1 && !submitting && (
                <ChevronRight className="ml-1 h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
