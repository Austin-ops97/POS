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
type Customer = { id: string; firstName: string; lastName?: string | null };

export default function RegisterPage() {
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [products, setProducts] = useState<ProductGridItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [darkCart, setDarkCart] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CARD" | "CASH">("CASH");
  const [paymentState, setPaymentState] = useState<PaymentModalState>("idle");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [orderNumber, setOrderNumber] = useState<string>();

  const barcodeRef = useRef<HTMLInputElement>(null);
  const {
    items,
    discounts,
    customerId,
    notes,
    addItem,
    addDiscount,
    setCustomer,
    clearCart,
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
    [{ name: "Sales Tax", rate: 0.08, appliesToProducts: true, appliesToServices: true }]
  );

  useEffect(() => {
    async function init() {
      try {
        const bizRes = await fetch("/api/business");
        if (bizRes.ok) {
          const biz = await bizRes.json();
          setLocationId(biz.defaultLocation?.id || biz.locations?.[0]?.id || null);
        }
      } catch {
        /* location resolved on checkout */
      }
    }
    init();
  }, []);

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

      if (data.categories) {
        setCategories(data.categories);
      } else {
        const cats = new Map<string, Category>();
        for (const p of productList) {
          if (p.categoryId) {
            cats.set(p.categoryId, { id: p.categoryId, name: p.categoryId });
          }
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

  const createOrder = async () => {
    if (!locationId) {
      const bizRes = await fetch("/api/business");
      if (bizRes.ok) {
        const biz = await bizRes.json();
        const loc = biz.defaultLocation?.id || biz.locations?.[0]?.id;
        if (!loc) throw new Error("No location configured");
        setLocationId(loc);
        return fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...buildCheckoutPayload(), locationId: loc }),
        });
      }
      throw new Error("No location configured");
    }
    return fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCheckoutPayload()),
    });
  };

  const handlePayCash = async () => {
    setPaymentMethod("CASH");
    setPaymentOpen(true);
    setPaymentState("loading");
    setProcessing(true);

    try {
      const checkoutRes = await createOrder();
      if (!checkoutRes.ok) {
        const err = await checkoutRes.json();
        throw new Error(err.error || "Failed to create order");
      }
      const order = await checkoutRes.json();

      const cashRes = await fetch("/api/checkout/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id || order.order?.id }),
      });
      if (!cashRes.ok) {
        const err = await cashRes.json();
        throw new Error(err.error || "Cash payment failed");
      }
      const result = await cashRes.json();

      setOrderNumber(result.orderNumber || order.orderNumber);
      setPaymentState("success");
      clearCart();
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

    try {
      const checkoutRes = await createOrder();
      if (!checkoutRes.ok) {
        const err = await checkoutRes.json();
        throw new Error(err.error || "Failed to create order");
      }
      const order = await checkoutRes.json();
      const orderId = order.id || order.order?.id;

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
        setOrderNumber(payment.orderNumber || order.orderNumber);
        setPaymentState("success");
        clearCart();
      } else if (payment.clientSecret) {
        setPaymentState("loading");
        setPaymentMessage("Complete payment on terminal or Tap to Pay device");
        await pollPaymentStatus(orderId);
      } else {
        setOrderNumber(payment.orderNumber || order.orderNumber);
        setPaymentState("success");
        clearCart();
      }
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : "Payment failed");
      setPaymentState("error");
    } finally {
      setProcessing(false);
    }
  };

  const pollPaymentStatus = async (orderId: string) => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (res.ok) {
          const order = await res.json();
          if (order.status === "PAID") {
            setOrderNumber(order.orderNumber);
            setPaymentState("success");
            clearCart();
            return;
          }
          if (order.status === "FAILED") {
            throw new Error("Card payment was declined");
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("declined")) {
          setPaymentMessage(err.message);
          setPaymentState("error");
          return;
        }
      }
    }
    setPaymentMessage("Payment timed out. Check terminal status.");
    setPaymentState("error");
  };

  const handleHold = async () => {
    if (items.length === 0) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/checkout/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCheckoutPayload()),
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
          onPayCash={handlePayCash}
          onPayCard={handlePayCard}
          onHold={handleHold}
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
      />
    </div>
  );
}
