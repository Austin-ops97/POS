"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, ScanBarcode, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductGrid, type ProductGridItem } from "@/components/register/product-grid";
import { CartPanel } from "@/components/register/cart-panel";
import { PaymentModal, type PaymentModalState } from "@/components/register/payment-modal";
import { useCartStore } from "@/stores/cart-store";
import { calculateOrderTotals } from "@/lib/order-calculator";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string };
type Customer = { id: string; firstName: string; lastName?: string | null; email?: string | null };

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
  const [products, setProducts] = useState<ProductGridItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [taxRates, setTaxRates] = useState<TaxRateDisplay[]>(DEFAULT_TAX_RATES);
  const [darkCart, setDarkCart] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CARD" | "CASH">("CASH");
  const [paymentState, setPaymentState] = useState<PaymentModalState>("idle");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [orderNumber, setOrderNumber] = useState<string>();
  const [paidOrderId, setPaidOrderId] = useState<string>();
  const [changeDue, setChangeDue] = useState<number>();
  const [customerEmail, setCustomerEmail] = useState<string>();
  const [cardCheckout, setCardCheckout] = useState<{
    clientSecret: string;
    stripeAccountId: string;
    orderId: string;
  } | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const {
    items,
    discounts,
    customerId,
    notes,
    heldOrderId,
    addItem,
    addDiscount,
    setCustomer,
    setNotes,
    clearCart,
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
        }
      } catch {
        /* location resolved on checkout */
      }
    }
    init();
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

  const handleSelectProduct = (product: ProductGridItem) => {
    addItem({
      productId: product.id,
      name: product.name,
      sku: product.sku || undefined,
      quantity: 1,
      unitPrice: product.price,
      taxable: product.taxable ?? true,
      type: product.type,
    });
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
      const res = await fetch(`/api/products?search=${encodeURIComponent(code)}&barcode=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = await res.json();
        const list = data.products || data;
        const found = list.find(
          (p: { barcode?: string }) => p.barcode === code.trim()
        );
        if (found) {
          handleSelectProduct({
            id: found.id,
            name: found.name,
            price: Number(found.price),
            sku: found.sku,
            barcode: found.barcode,
            categoryId: found.categoryId,
            taxable: found.taxable,
          });
          setBarcode("");
          return;
        }
      }
    } catch {
      /* fall through */
    }
    toast.error("Product not found for barcode");
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

  const handlePayCash = async () => {
    setPaymentMethod("CASH");
    setPaymentOpen(true);
    setPaymentState("loading");
    setProcessing(true);
    setChangeDue(undefined);
    setPaidOrderId(undefined);

    try {
      const checkoutOrder = await resolveOrderForPayment();

      const tenderStr = window.prompt(
        `Cash total: $${totals.total.toFixed(2)}\nEnter amount tendered (optional):`
      );
      let amountTendered: number | undefined;
      if (tenderStr && tenderStr.trim()) {
        amountTendered = parseFloat(tenderStr);
        if (isNaN(amountTendered) || amountTendered < 0) {
          throw new Error("Invalid amount tendered");
        }
      }

      const emailStr = window.prompt(
        "Email receipt to (optional):",
        customerEmail ?? ""
      );
      const emailedTo =
        emailStr && emailStr.trim() ? emailStr.trim() : undefined;

      const cashRes = await fetch("/api/checkout/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: checkoutOrder.id,
          ...(amountTendered !== undefined ? { amountTendered } : {}),
          ...(emailedTo ? { emailedTo } : {}),
        }),
      });
      if (!cashRes.ok) {
        const err = await cashRes.json();
        throw new Error(err.error || "Cash payment failed");
      }
      const result = await cashRes.json();
      const paidOrder = resolveCheckoutOrder(result);

      setPaidOrderId(checkoutOrder.id);
      setOrderNumber(
        paidOrder?.orderNumber || checkoutOrder.orderNumber
      );
      if (typeof result.change === "number") {
        setChangeDue(result.change);
      }
      setPaymentState("success");
      clearCart();

      if (emailedTo) {
        fetch(`/api/orders/${checkoutOrder.id}/receipt/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailedTo }),
        }).catch(() => {
          toast.error("Payment succeeded but receipt email failed");
        });
      }
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : "Payment failed");
      setPaymentState("error");
    } finally {
      setProcessing(false);
    }
  };

  const handlePayCard = async () => {
    setPaymentMethod("CARD");
    setPaymentOpen(true);
    setPaymentState("loading");
    setProcessing(true);
    setCardCheckout(null);

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
        return;
      }

      if (payment.clientSecret && payment.stripeAccountId) {
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

  const handleResumeHeld = async () => {
    setProcessing(true);
    try {
      const res = await fetch("/api/orders?status=HELD&limit=20");
      if (!res.ok) throw new Error("Failed to load held orders");
      const data = await res.json();
      const heldOrders: Array<{
        id: string;
        orderNumber: string;
        total: number;
      }> = data.orders || [];
      if (heldOrders.length === 0) {
        toast.error("No held orders");
        return;
      }
      const list = heldOrders
        .map(
          (o, i) =>
            `${i + 1}. ${o.orderNumber} — $${Number(o.total).toFixed(2)}`
        )
        .join("\n");
      const pick = window.prompt(`Enter held order number:\n${list}`);
      if (!pick) return;
      const index = parseInt(pick, 10) - 1;
      const selected =
        index >= 0 && index < heldOrders.length
          ? heldOrders[index]
          : heldOrders.find((o) => o.orderNumber === pick.trim());
      if (!selected) {
        toast.error("Invalid selection");
        return;
      }

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
        }) => ({
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          taxable: true,
          type: item.product?.type,
        })
      );

      loadHeldOrder(order.id, cartItems);
      toast.success(`Resumed ${order.orderNumber}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resume order");
    } finally {
      setProcessing(false);
    }
  };

  const handleAddCustom = () => {
    const name = window.prompt("Item name");
    if (!name) return;
    const priceStr = window.prompt("Item price");
    if (!priceStr) return;
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) {
      toast.error("Invalid price");
      return;
    }
    addItem({
      name,
      quantity: 1,
      unitPrice: price,
      taxable: true,
      type: "CUSTOM",
    });
  };

  const handleAddDiscount = () => {
    const type = window.prompt("Discount type: percentage or fixed", "percentage");
    if (!type) return;
    const valueStr = window.prompt("Discount value");
    if (!valueStr) return;
    const value = parseFloat(valueStr);
    if (isNaN(value) || value <= 0) {
      toast.error("Invalid discount value");
      return;
    }
    const isPercentage = type.toLowerCase().startsWith("p");
    addDiscount({
      id: `disc-${Date.now()}`,
      name: isPercentage ? `${value}% Off` : `$${value} Off`,
      type: isPercentage ? "PERCENTAGE" : "FIXED_AMOUNT",
      value,
    });
  };

  const handleSelectCustomer = async () => {
    const query = window.prompt("Search customer by name, email, or phone");
    if (!query) return;
    try {
      const res = await fetch(
        `/api/customers?search=${encodeURIComponent(query)}`
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      const customers: Customer[] = data.customers || data;
      if (customers.length === 0) {
        toast.error("No customers found");
        return;
      }
      const c = customers[0];
      setCustomer(
        c.id,
        `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`
      );
      if (c.email) {
        setCustomerEmail(c.email);
      }
      toast.success("Customer selected");
    } catch {
      toast.error("Failed to search customers");
    }
  };

  const handleClosePayment = () => {
    setPaymentOpen(false);
    setPaymentState("idle");
    setPaymentMessage("");
    setOrderNumber(undefined);
    setPaidOrderId(undefined);
    setChangeDue(undefined);
    setCardCheckout(null);
  };

  const filteredProducts =
    activeCategory === "all"
      ? products
      : products.filter((p) => p.categoryId === activeCategory);

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 pl-10 text-base"
            />
          </div>
          <div className="relative w-64">
            <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input
              ref={barcodeRef}
              placeholder="Scan barcode..."
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleBarcodeSubmit(barcode);
              }}
              className="h-12 pl-10 text-base"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0"
            onClick={() => setDarkCart(!darkCart)}
            title={darkCart ? "Light cart panel" : "Dark cart panel"}
          >
            {darkCart ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>

        <div className="border-b border-slate-200 bg-white px-5 py-2">
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
              <TabsTrigger
                value="all"
                className="h-10 rounded-lg px-5 text-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white"
              >
                All
              </TabsTrigger>
              {categories.map((cat) => (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                  className="h-10 rounded-lg px-5 text-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                >
                  {cat.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <ProductGrid
            products={filteredProducts}
            loading={loading}
            onSelect={handleSelectProduct}
          />
        </div>
      </div>

      <div className={cn("w-[400px] shrink-0 xl:w-[440px]")}>
        <CartPanel
          dark={darkCart}
          taxRate={primaryTaxRate(taxRates)}
          onPayCash={handlePayCash}
          onPayCard={handlePayCard}
          onHold={handleHold}
          onResumeHeld={handleResumeHeld}
          onClear={clearCart}
          onAddCustom={handleAddCustom}
          onSelectCustomer={handleSelectCustomer}
          onAddDiscount={handleAddDiscount}
          disabled={processing}
        />
      </div>

      <PaymentModal
        open={paymentOpen}
        onClose={handleClosePayment}
        method={paymentMethod}
        amount={totals.total}
        state={paymentState}
        message={paymentMessage}
        orderNumber={orderNumber}
        orderId={paidOrderId}
        changeDue={changeDue}
        defaultReceiptEmail={customerEmail}
        cardCheckout={
          cardCheckout
            ? {
                ...cardCheckout,
                onSuccess: (confirmedOrderNumber) => {
                  setPaidOrderId(cardCheckout.orderId);
                  setOrderNumber(confirmedOrderNumber);
                  setPaymentState("success");
                  setCardCheckout(null);
                  clearCart();
                },
                onError: (message) => {
                  setPaymentMessage(message);
                  setPaymentState("error");
                  setCardCheckout(null);
                },
                onCancel: handleClosePayment,
              }
            : null
        }
      />
    </div>
  );
}
