"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, ScanBarcode, Moon, Sun, Camera, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductGrid, type ProductGridItem } from "@/components/register/product-grid";
import { CartPanel } from "@/components/register/cart-panel";
import { PaymentModal, type PaymentModalState } from "@/components/register/payment-modal";
import { CashTenderModal } from "@/components/register/cash-tender-modal";
import { CustomItemDialog } from "@/components/register/custom-item-dialog";
import { DiscountDialog } from "@/components/register/discount-dialog";
import { CustomerPickerDialog } from "@/components/register/customer-picker-dialog";
import { HeldOrdersDialog, type HeldOrderSummary } from "@/components/register/held-orders-dialog";
import {
  ModifierPickerDialog,
  type ModifierGroupChoice,
} from "@/components/register/modifier-picker-dialog";
import { RegisterPinLock } from "@/components/register/register-pin-lock";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useCartStore } from "@/stores/cart-store";
import { calculateOrderTotals } from "@/lib/order-calculator";
import { formatCurrency } from "@/lib/utils";
import { isValidReceiptEmail } from "@/lib/register/receipt-email";
import { BarcodeScanner } from "@/components/barcode/barcode-scanner";

type Category = { id: string; name: string };

const REGISTER_SESSION_KEY = "nexapos.register.session";

type CheckoutOrderPayload = {
  id?: string;
  orderNumber?: string;
};

type TaxRateDisplay = {
  name: string;
  rate: number;
  appliesToProducts: boolean;
  appliesToServices: boolean;
};

const DEFAULT_TAX_RATES: TaxRateDisplay[] = [];

function primaryTaxRate(rates: TaxRateDisplay[]) {
  if (rates.length === 0) return 0;
  const productRate = rates.find((r) => r.appliesToProducts);
  return productRate?.rate ?? rates[0].rate;
}

function resolveCheckoutOrder(data: unknown): CheckoutOrderPayload | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as {
    order?: CheckoutOrderPayload;
  } & CheckoutOrderPayload;
  const order = payload.order ?? payload;
  if (!order.id && !order.orderNumber) return null;
  return order;
}

function resolveLocationFromBusiness(biz: {
  defaultLocation?: { id: string };
  locations?: Array<{ id: string; isDefault?: boolean }>;
}) {
  return (
    biz.defaultLocation?.id ||
    biz.locations?.find((l) => l.isDefault)?.id ||
    biz.locations?.[0]?.id ||
    null
  );
}

export default function RegisterPage() {
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [products, setProducts] = useState<ProductGridItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [taxRates, setTaxRates] = useState<TaxRateDisplay[]>(DEFAULT_TAX_RATES);
  const [darkCart, setDarkCart] = useState(true);
  const [processing, setProcessing] = useState(false);
  const checkoutInFlightRef = useRef(false);
  const receiptEmailRef = useRef("");
  const skipReceiptRef = useRef(false);

  const [cartOpen, setCartOpen] = useState(false);
  const [cashTenderOpen, setCashTenderOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CARD" | "CASH">("CASH");
  const [paymentState, setPaymentState] = useState<PaymentModalState>("idle");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [orderNumber, setOrderNumber] = useState<string>();
  const [paidOrderId, setPaidOrderId] = useState<string>();
  const [changeDue, setChangeDue] = useState<number>();
  const [customerEmail, setCustomerEmail] = useState<string>();
  const [receiptEmail, setReceiptEmail] = useState("");
  const [skipReceiptEmail, setSkipReceiptEmail] = useState(false);
  const [cardCheckout, setCardCheckout] = useState<{
    clientSecret: string;
    stripeAccountId: string;
    orderId: string;
  } | null>(null);

  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [heldOrdersOpen, setHeldOrdersOpen] = useState(false);
  const [modifierProduct, setModifierProduct] = useState<ProductGridItem | null>(null);
  const [requirePin, setRequirePin] = useState(false);
  const [pinChecked, setPinChecked] = useState(false);
  const [registerUnlocked, setRegisterUnlocked] = useState(false);
  const [cashierName, setCashierName] = useState<string | null>(null);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const {
    items,
    discounts,
    customerId,
    customerName,
    notes,
    heldOrderId,
    addItem,
    addDiscount,
    setCustomer,
    setNotes,
    clearCart,
    startNewSale,
    loadHeldOrder,
  } = useCartStore();

  const totals = calculateOrderTotals(
    items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxable: i.taxable,
      modifiers: i.modifiers,
    })),
    discounts.map((d) => ({ name: d.name, type: d.type, value: d.value })),
    taxRates
  );

  useEffect(() => {
    async function init() {
      try {
        const bizRes = await fetch("/api/business");
        if (bizRes.ok) {
          const biz = await bizRes.json();
          const loc = resolveLocationFromBusiness(biz);
          setLocationId(loc);
          const settings = biz.settings ?? null;
          const pinRequired = Boolean(settings?.requirePinAtRegister);
          setRequirePin(pinRequired);
          if (settings?.sessionTimeoutMinutes) {
            setSessionTimeoutMinutes(Number(settings.sessionTimeoutMinutes));
          }
          if (!pinRequired) {
            setRegisterUnlocked(true);
          } else {
            try {
              const raw = sessionStorage.getItem(REGISTER_SESSION_KEY);
              if (raw) {
                const session = JSON.parse(raw) as {
                  employeeName: string;
                  expiresAt: number;
                };
                if (session.expiresAt > Date.now()) {
                  setCashierName(session.employeeName);
                  setRegisterUnlocked(true);
                } else {
                  sessionStorage.removeItem(REGISTER_SESSION_KEY);
                }
              }
            } catch {
              sessionStorage.removeItem(REGISTER_SESSION_KEY);
            }
          }
        }
      } catch {
        setRegisterUnlocked(true);
      } finally {
        setPinChecked(true);
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (!locationId) return;

    const taxUrl = `/api/tax-rates?locationId=${encodeURIComponent(locationId)}`;

    async function loadTaxRates() {
      try {
        const res = await fetch(taxUrl);
        if (!res.ok) return;
        const data = (await res.json()) as { taxRates?: TaxRateDisplay[] };
        if (data.taxRates?.length) {
          setTaxRates(data.taxRates);
        }
      } catch {
        /* keep default display rates */
      }
    }

    void loadTaxRates();
  }, [locationId]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (activeCategory !== "all") params.set("categoryId", activeCategory);
      params.set("isActive", "true");

      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();

      const productList: ProductGridItem[] = (data.products || data).map(
        (p: {
          id: string;
          name: string;
          price: number | string;
          sku?: string;
          barcode?: string;
          categoryId?: string;
          imageUrl?: string;
          type?: string;
          taxable?: boolean;
          modifierGroups?: ModifierGroupChoice[];
        }) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
          sku: p.sku,
          barcode: p.barcode,
          categoryId: p.categoryId,
          imageUrl: p.imageUrl,
          type: p.type,
          taxable: p.taxable,
          modifierGroups: p.modifierGroups,
        })
      );
      setProducts(productList);

      if (data.categories?.length) {
        setCategories(data.categories.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      } else {
        const cats = new Map<string, Category>();
        for (const p of (data.products || data) as { categoryId?: string; category?: { id: string; name: string } }[]) {
          if (p.category?.id) cats.set(p.category.id, { id: p.category.id, name: p.category.name });
          else if (p.categoryId) cats.set(p.categoryId, { id: p.categoryId, name: p.categoryId });
        }
        if (cats.size > 0) setCategories(Array.from(cats.values()));
      }
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [search, activeCategory]);

  useEffect(() => {
    const timer = setTimeout(fetchProducts, 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  const addProductToCart = (
    product: ProductGridItem,
    modifiers?: { name: string; priceAdjustment: number }[]
  ) => {
    const adjustment = (modifiers || []).reduce((sum, m) => sum + m.priceAdjustment, 0);
    addItem({
      productId: product.id,
      name: product.name,
      sku: product.sku || undefined,
      quantity: 1,
      unitPrice: product.price + adjustment,
      taxable: product.taxable ?? true,
      type: product.type,
      modifiers,
    });
  };

  const handleSelectProduct = (product: ProductGridItem) => {
    if (product.modifierGroups && product.modifierGroups.length > 0) {
      setModifierProduct(product);
      return;
    }
    addProductToCart(product);
  };

  const handleBarcodeSubmit = async (code: string) => {
    if (!code.trim()) return;
    const match = products.find((p) => p.barcode === code.trim());
    if (match) {
      handleSelectProduct(match);
      setBarcode("");
      return;
    }
    try {
      // Exact local barcode lookup only — never call external catalog at checkout
      const res = await fetch(
        `/api/catalog/barcodes/${encodeURIComponent(code.trim())}?localOnly=true${
          locationId ? `&locationId=${encodeURIComponent(locationId)}` : ""
        }`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.status === "LOCAL_MATCH" && data.product) {
          handleSelectProduct({
            id: data.product.id,
            name: data.product.name,
            price:
              data.variant?.price != null
                ? Number(data.variant.price)
                : Number(data.product.price),
            sku: data.variant?.sku ?? data.product.sku,
            barcode: data.product.barcode,
            categoryId: data.product.categoryId,
            taxable: data.product.taxable,
          });
          setBarcode("");
          return;
        }
      }
    } catch {
      /* fall through */
    }
    toast.error("Barcode not found in this business", {
      action: {
        label: "Add product",
        onClick: () => {
          window.location.href = `/products/new?barcode=${encodeURIComponent(code.trim())}`;
        },
      },
    });
    setBarcode("");
  };

  const buildCheckoutPayload = () => ({
    locationId,
    customerId: customerId || undefined,
    items: items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxable: i.taxable,
      modifiers: i.modifiers,
    })),
    discounts: discounts.map((d) => ({
      name: d.name,
      type: d.type,
      value: d.value,
    })),
    notes: notes || undefined,
  });

  const resolveLocationId = async (): Promise<string> => {
    if (locationId) return locationId;

    const bizRes = await fetch("/api/business");
    if (!bizRes.ok) throw new Error("No location configured");
    const biz = await bizRes.json();
    const loc = resolveLocationFromBusiness(biz);
    if (!loc) throw new Error("No location configured");
    setLocationId(loc);
    return loc;
  };

  const createOrder = async () => {
    const loc = await resolveLocationId();
    return fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buildCheckoutPayload(), locationId: loc }),
    });
  };

  const resolveOrderForPayment = async (): Promise<{
    id: string;
    orderNumber?: string;
  }> => {
    const loc = await resolveLocationId();

    if (heldOrderId) {
      const holdRes = await fetch("/api/checkout/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildCheckoutPayload(),
          locationId: loc,
          orderId: heldOrderId,
        }),
      });
      if (!holdRes.ok) {
        const err = await holdRes.json();
        throw new Error(err.error || "Failed to update held order");
      }
      const holdData = await holdRes.json();
      const order = resolveCheckoutOrder(holdData);
      if (!order?.id) {
        throw new Error("Failed to update held order");
      }
      return { id: order.id, orderNumber: order.orderNumber };
    }

    const checkoutRes = await createOrder();
    if (!checkoutRes.ok) {
      const err = await checkoutRes.json();
      throw new Error(err.error || "Failed to create order");
    }
    const checkoutData = await checkoutRes.json();
    const checkoutOrder = resolveCheckoutOrder(checkoutData);
    if (!checkoutOrder?.id) {
      throw new Error("Failed to create order");
    }
    return { id: checkoutOrder.id, orderNumber: checkoutOrder.orderNumber };
  };

  const sendReceiptEmailSafe = (orderId: string, email: string) => {
    if (!email.trim() || !isValidReceiptEmail(email)) return;
    fetch(`/api/orders/${orderId}/receipt/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? "Failed to email receipt");
        }
        toast.success(`Receipt emailed to ${email.trim()}`);
      })
      .catch(() => {
        toast.error("Payment succeeded but receipt email failed");
      });
  };

  const resetCheckoutUi = () => {
    setPaymentOpen(false);
    setCashTenderOpen(false);
    setPaymentState("idle");
    setPaymentMessage("");
    setOrderNumber(undefined);
    setPaidOrderId(undefined);
    setChangeDue(undefined);
    setCardCheckout(null);
    setReceiptEmail("");
    setSkipReceiptEmail(false);
    setCustomerEmail(undefined);
    setProcessing(false);
    checkoutInFlightRef.current = false;
  };

  const handleNewSale = () => {
    startNewSale();
    resetCheckoutUi();
  };

  const handleClosePayment = () => {
    if (paymentState === "success") {
      handleNewSale();
      return;
    }
    resetCheckoutUi();
  };

  const handlePayCash = () => {
    if (items.length === 0) {
      toast.error("Add items before checkout");
      return;
    }
    if (checkoutInFlightRef.current || processing) return;
    setPaymentMethod("CASH");
    setReceiptEmail(customerEmail ?? "");
    setSkipReceiptEmail(false);
    setCashTenderOpen(true);
  };

  const handleCashTenderConfirm = async (data: {
    amountTendered: number;
    changeDue: number;
    receiptEmail?: string;
    skipReceipt: boolean;
  }) => {
    if (checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    setCashTenderOpen(false);
    setPaymentOpen(true);
    setPaymentState("loading");
    setProcessing(true);
    setChangeDue(undefined);
    setPaidOrderId(undefined);

    try {
      const checkoutOrder = await resolveOrderForPayment();

      const cashRes = await fetch("/api/checkout/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: checkoutOrder.id,
          amountTendered: data.amountTendered,
        }),
      });
      if (!cashRes.ok) {
        const err = await cashRes.json();
        throw new Error(err.error || "Cash payment failed");
      }
      const result = await cashRes.json();
      const paidOrder = resolveCheckoutOrder(result);

      setPaidOrderId(checkoutOrder.id);
      setOrderNumber(paidOrder?.orderNumber || checkoutOrder.orderNumber);
      setChangeDue(
        typeof result.change === "number" ? result.change : data.changeDue
      );
      if (data.receiptEmail) {
        setCustomerEmail(data.receiptEmail);
      }
      setPaymentState("success");
      clearCart();

      if (!data.skipReceipt && data.receiptEmail) {
        sendReceiptEmailSafe(checkoutOrder.id, data.receiptEmail);
      }
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : "Payment failed");
      setPaymentState("error");
    } finally {
      setProcessing(false);
      checkoutInFlightRef.current = false;
    }
  };

  const handlePayCard = async () => {
    if (items.length === 0) {
      toast.error("Add items before checkout");
      return;
    }
    if (checkoutInFlightRef.current || processing) return;
    checkoutInFlightRef.current = true;
    setPaymentMethod("CARD");
    setPaymentOpen(true);
    setPaymentState("loading");
    setProcessing(true);
    setCardCheckout(null);
    const emailForReceipt = customerEmail ?? "";
    setReceiptEmail(emailForReceipt);
    receiptEmailRef.current = emailForReceipt;
    setSkipReceiptEmail(false);
    skipReceiptRef.current = false;

    let enteredCardEntry = false;
    try {
      const checkoutOrder = await resolveOrderForPayment();
      const orderId = checkoutOrder.id;

      const payRes = await fetch("/api/checkout/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!payRes.ok) {
        const err = await payRes.json();
        throw new Error(err.error || "Card payment failed");
      }
      const payment = await payRes.json();

      if (payment.status === "succeeded" || payment.paid) {
        setPaidOrderId(orderId);
        setOrderNumber(payment.orderNumber || checkoutOrder.orderNumber);
        setPaymentState("success");
        clearCart();
        if (!skipReceiptRef.current && receiptEmailRef.current.trim()) {
          sendReceiptEmailSafe(orderId, receiptEmailRef.current);
        }
        return;
      }

      if (payment.clientSecret && payment.stripeAccountId) {
        enteredCardEntry = true;
        setCardCheckout({
          clientSecret: payment.clientSecret,
          stripeAccountId: payment.stripeAccountId,
          orderId,
        });
        setPaymentState("card_entry");
        return;
      }

      throw new Error("Unable to start card payment");
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : "Payment failed");
      setPaymentState("error");
    } finally {
      setProcessing(false);
      if (!enteredCardEntry) {
        checkoutInFlightRef.current = false;
      }
    }
  };

  const handleHold = async () => {
    if (items.length === 0) return;
    setProcessing(true);
    try {
      const loc = await resolveLocationId();
      const res = await fetch("/api/checkout/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildCheckoutPayload(),
          locationId: loc,
          ...(heldOrderId ? { orderId: heldOrderId } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to hold order");
      }
      toast.success("Order held successfully");
      clearCart();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to hold order");
    } finally {
      setProcessing(false);
    }
  };

  const handleResumeHeld = () => {
    setHeldOrdersOpen(true);
  };

  const loadHeldOrderById = async (selected: HeldOrderSummary) => {
    setProcessing(true);
    try {
      const orderRes = await fetch(`/api/orders/${selected.id}`);
      if (!orderRes.ok) throw new Error("Failed to load order");
      const orderData = await orderRes.json();
      const order = orderData.order ?? orderData;

      clearCart();
      if (order.customer?.id) {
        setCustomer(
          order.customer.id,
          `${order.customer.firstName}${order.customer.lastName ? ` ${order.customer.lastName}` : ""}`
        );
        if (order.customer.email) setCustomerEmail(order.customer.email);
      }
      if (order.notes) setNotes(order.notes);

      const cartItems = (order.items || []).map(
        (item: {
          productId?: string;
          variantId?: string;
          name: string;
          sku?: string;
          quantity: number;
          unitPrice: number;
          product?: { type?: string };
          modifiers?: { name: string; priceAdjustment: number }[] | null;
        }) => ({
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          taxable: true,
          type: item.product?.type,
          modifiers: item.modifiers ?? undefined,
        })
      );

      loadHeldOrder(order.id, cartItems);
      toast.success(`Resumed ${order.orderNumber}`);
      setCartOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resume order");
    } finally {
      setProcessing(false);
    }
  };

  const handleAddCustom = () => setCustomItemOpen(true);
  const handleAddDiscount = () => setDiscountOpen(true);
  const handleSelectCustomer = () => setCustomerOpen(true);

  const filteredProducts =
    activeCategory === "all"
      ? products
      : products.filter((p) => p.categoryId === activeCategory);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const cartPanelProps = {
    dark: darkCart,
    taxRate: primaryTaxRate(taxRates),
    onPayCash: handlePayCash,
    onPayCard: handlePayCard,
    onHold: handleHold,
    onResumeHeld: handleResumeHeld,
    onClear: clearCart,
    onAddCustom: handleAddCustom,
    onSelectCustomer: handleSelectCustomer,
    onAddDiscount: handleAddDiscount,
    disabled: processing || paymentOpen || cashTenderOpen,
  };

  return (
    <div className="page-flush relative flex h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] overflow-hidden sm:h-[calc(100dvh-4rem)] sm:max-h-[calc(100dvh-4rem)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
        <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 pl-10 text-base"
              enterKeyHint="search"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none lg:w-64">
              <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                ref={barcodeRef}
                placeholder="Scan barcode..."
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleBarcodeSubmit(barcode);
                }}
                className="h-12 pl-10 text-base"
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0"
              aria-label="Open camera barcode scanner"
              onClick={() => setScannerOpen(true)}
            >
              <Camera className="h-5 w-5" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="hidden h-12 w-12 shrink-0 lg:inline-flex"
              onClick={() => setDarkCart(!darkCart)}
              aria-label={darkCart ? "Use light cart panel" : "Use dark cart panel"}
            >
              {darkCart ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
            </Button>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-3 py-2 sm:px-5">
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
              <TabsTrigger
                value="all"
                className="h-10 min-h-10 shrink-0 rounded-lg px-4 text-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white sm:px-5"
              >
                All
              </TabsTrigger>
              {categories.map((cat) => (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                  className="h-10 min-h-10 shrink-0 rounded-lg px-4 text-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white sm:px-5"
                >
                  {cat.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto p-3 pb-24 sm:p-5 lg:pb-5">
          <ProductGrid
            products={filteredProducts}
            loading={loading}
            onSelect={handleSelectProduct}
          />
        </div>
      </div>

      <div className="hidden w-[min(400px,38vw)] shrink-0 xl:w-[440px] lg:block">
        <CartPanel {...cartPanelProps} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <Button
          type="button"
          size="xl"
          className="pointer-events-auto h-14 w-full shadow-lg"
          onClick={() => setCartOpen(true)}
          aria-label={`Open cart, ${itemCount} items, total ${formatCurrency(totals.total)}`}
        >
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          <span>Cart · {itemCount}</span>
          <span className="ml-auto font-bold">{formatCurrency(totals.total)}</span>
        </Button>
      </div>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="h-[min(92dvh,100%)] p-0 lg:hidden" showClose>
          <SheetHeader className="sr-only">
            <SheetTitle>Current sale cart</SheetTitle>
            <SheetDescription>Review items and complete payment</SheetDescription>
          </SheetHeader>
          <CartPanel {...cartPanelProps} className="h-full border-0" />
        </SheetContent>
      </Sheet>

      <CashTenderModal
        open={cashTenderOpen}
        total={totals.total}
        defaultReceiptEmail={customerEmail}
        processing={processing}
        onConfirm={handleCashTenderConfirm}
        onCancel={() => setCashTenderOpen(false)}
      />

      <PaymentModal
        open={paymentOpen}
        onClose={handleClosePayment}
        onNewSale={handleNewSale}
        method={paymentMethod}
        amount={totals.total}
        state={paymentState}
        message={paymentMessage}
        orderNumber={orderNumber}
        orderId={paidOrderId}
        changeDue={changeDue}
        customerName={customerName ?? undefined}
        defaultReceiptEmail={customerEmail}
        receiptEmail={receiptEmail}
        onReceiptEmailChange={(email) => {
          setReceiptEmail(email);
          receiptEmailRef.current = email;
        }}
        skipReceiptEmail={skipReceiptEmail}
        onSkipReceiptEmailChange={(skip) => {
          setSkipReceiptEmail(skip);
          skipReceiptRef.current = skip;
        }}
        cardCheckout={
          cardCheckout
            ? {
                ...cardCheckout,
                onSuccess: (confirmedOrderNumber) => {
                  const orderId = cardCheckout.orderId;
                  setPaidOrderId(orderId);
                  setOrderNumber(confirmedOrderNumber);
                  setPaymentState("success");
                  setCardCheckout(null);
                  clearCart();
                  checkoutInFlightRef.current = false;
                  setProcessing(false);
                  setCartOpen(false);
                  if (!skipReceiptRef.current && receiptEmailRef.current.trim()) {
                    sendReceiptEmailSafe(orderId, receiptEmailRef.current);
                  }
                },
                onError: (message) => {
                  setPaymentMessage(message);
                  setPaymentState("error");
                  setCardCheckout(null);
                  checkoutInFlightRef.current = false;
                  setProcessing(false);
                },
                onCancel: handleClosePayment,
              }
            : null
        }
      />

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        continuous={false}
        title="Scan to add to cart"
        onScan={(result) => {
          void handleBarcodeSubmit(result.rawValue);
        }}
      />

      <CustomItemDialog
        open={customItemOpen}
        onOpenChange={setCustomItemOpen}
        onSubmit={({ name, unitPrice }) => {
          addItem({
            name,
            quantity: 1,
            unitPrice,
            taxable: true,
            type: "CUSTOM",
          });
        }}
      />

      <DiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        onSubmit={addDiscount}
      />

      <CustomerPickerDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        hasCustomer={Boolean(customerId)}
        onClear={() => {
          setCustomer(null, null);
          setCustomerEmail(undefined);
          setCustomerOpen(false);
          toast.success("Customer removed");
        }}
        onSelect={(c) => {
          setCustomer(
            c.id,
            `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`
          );
          if (c.email) setCustomerEmail(c.email);
          toast.success("Customer selected");
        }}
      />

      <HeldOrdersDialog
        open={heldOrdersOpen}
        onOpenChange={setHeldOrdersOpen}
        onSelect={(order) => {
          void loadHeldOrderById(order);
        }}
      />

      {modifierProduct ? (
        <ModifierPickerDialog
          open={Boolean(modifierProduct)}
          onOpenChange={(open) => {
            if (!open) setModifierProduct(null);
          }}
          productName={modifierProduct.name}
          basePrice={modifierProduct.price}
          groups={modifierProduct.modifierGroups || []}
          onConfirm={(modifiers) => {
            addProductToCart(modifierProduct, modifiers);
            setModifierProduct(null);
          }}
        />
      ) : null}

      {pinChecked && requirePin && !registerUnlocked ? (
        <RegisterPinLock
          onUnlocked={(employee) => {
            const expiresAt = Date.now() + sessionTimeoutMinutes * 60 * 1000;
            sessionStorage.setItem(
              REGISTER_SESSION_KEY,
              JSON.stringify({
                employeeId: employee.id,
                employeeName: employee.name,
                expiresAt,
              })
            );
            setCashierName(employee.name);
            setRegisterUnlocked(true);
            toast.success(`Unlocked for ${employee.name}`);
          }}
        />
      ) : null}

      {cashierName && requirePin ? (
        <div className="absolute right-3 top-3 z-20 hidden rounded-lg bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm lg:block">
          Cashier: {cashierName}
        </div>
      ) : null}
    </div>
  );
}
