-- Remove confirmed NexaPOS demo/seed records, then drop subscription & onboarding schema.
-- Preserves real merchant data, Stripe Connect, payments, webhooks, Terminal readers.

-- ─── 1. Delete confirmed demo seed records (narrow identifiers only) ─────────

-- Demo refunds (by known seed IDs / demo business)
DELETE FROM "RefundItem"
WHERE "refundId" IN (
  SELECT r.id FROM "Refund" r
  WHERE r.id = 'refund-1'
     OR r."businessId" = 'demo-business'
     OR r."employeeId" LIKE 'demo-%'
);

DELETE FROM "Refund"
WHERE id = 'refund-1'
   OR "businessId" = 'demo-business'
   OR "employeeId" LIKE 'demo-%';

-- Demo payments
DELETE FROM "Payment"
WHERE id IN ('pay-card-1', 'pay-cash-1', 'pay-refund-1')
   OR "businessId" = 'demo-business'
   OR "stripePaymentIntentId" LIKE 'pi_demo_%';

-- Demo order items
DELETE FROM "OrderItem"
WHERE id LIKE 'oi-%'
   OR "orderId" IN (
     SELECT id FROM "Order"
     WHERE id LIKE 'order-%'
        OR "orderNumber" LIKE 'ORD-DEMO-%'
        OR "businessId" = 'demo-business'
   );

-- Demo receipts tied to demo orders
DELETE FROM "Receipt"
WHERE "orderId" IN (
  SELECT id FROM "Order"
  WHERE "orderNumber" LIKE 'ORD-DEMO-%'
     OR "businessId" = 'demo-business'
);

DELETE FROM "OrderDiscount"
WHERE "orderId" IN (
  SELECT id FROM "Order"
  WHERE "orderNumber" LIKE 'ORD-DEMO-%'
     OR "businessId" = 'demo-business'
);

DELETE FROM "Order"
WHERE id LIKE 'order-%'
   OR "orderNumber" LIKE 'ORD-DEMO-%'
   OR "businessId" = 'demo-business';

-- Demo workforce
DELETE FROM "TimeBreak"
WHERE "timeEntryId" IN (
  SELECT id FROM "TimeEntry" WHERE "businessId" = 'demo-business'
);

DELETE FROM "TimeEntry" WHERE "businessId" = 'demo-business';
DELETE FROM "Shift" WHERE id = 'demo-shift-1' OR "businessId" = 'demo-business';
DELETE FROM "TimeOffRequest" WHERE "businessId" = 'demo-business';
DELETE FROM "PayrollBonus" WHERE "businessId" = 'demo-business';
DELETE FROM "PtoLedgerEntry" WHERE "businessId" = 'demo-business';

-- Demo compensation
DELETE FROM "EmployeeCompensation"
WHERE id LIKE 'demo-%'
   OR "employeeId" LIKE 'demo-%';

DELETE FROM "EmployeeEmergencyContact"
WHERE "employeeId" LIKE 'demo-%';

DELETE FROM "EmployeeLocation"
WHERE "employeeId" LIKE 'demo-%'
   OR "locationId" = 'demo-location';

-- Demo inventory
DELETE FROM "InventoryMovement"
WHERE "businessId" = 'demo-business';

DELETE FROM "InventoryItem"
WHERE "businessId" = 'demo-business'
   OR "locationId" = 'demo-location'
   OR "productId" LIKE 'prod-%';

-- Demo products / categories / customers / tax
DELETE FROM "ProductModifierGroup"
WHERE "productId" LIKE 'prod-%';

DELETE FROM "ProductVariant"
WHERE "productId" LIKE 'prod-%';

DELETE FROM "Product"
WHERE id LIKE 'prod-%'
   OR "businessId" = 'demo-business';

DELETE FROM "Category"
WHERE id LIKE 'cat-%'
   OR "businessId" = 'demo-business';

DELETE FROM "Customer"
WHERE id LIKE 'cust-%'
   OR "businessId" = 'demo-business';

DELETE FROM "TaxRate"
WHERE id = 'demo-tax'
   OR "businessId" = 'demo-business';

DELETE FROM "ModuleSetting" WHERE "businessId" = 'demo-business';
DELETE FROM "BusinessSetting" WHERE "businessId" = 'demo-business';
DELETE FROM "WorkforceSettings" WHERE "businessId" = 'demo-business';
DELETE FROM "StripeAccount" WHERE "businessId" = 'demo-business';
DELETE FROM "TerminalReader" WHERE "businessId" = 'demo-business';
DELETE FROM "Discount" WHERE "businessId" = 'demo-business';
DELETE FROM "AuditLog" WHERE "businessId" = 'demo-business';
DELETE FROM "RegisterSession" WHERE "businessId" = 'demo-business';

-- Demo employees
DELETE FROM "EmployeeProfile"
WHERE id LIKE 'demo-%'
   OR "businessId" = 'demo-business';

DELETE FROM "Location"
WHERE id = 'demo-location'
   OR "businessId" = 'demo-business';

-- Drop subscription rows for demo business first (table still exists)
DELETE FROM "Subscription" WHERE "businessId" = 'demo-business';

DELETE FROM "Business"
WHERE id = 'demo-business'
   OR (name = 'Demo Market & Services' AND email = 'demo@nexapos.com');

-- ─── 2. Drop Subscription table and related enums ────────────────────────────

DROP TABLE IF EXISTS "Subscription";

DROP TYPE IF EXISTS "SubscriptionPlan";
DROP TYPE IF EXISTS "SubscriptionStatus";

-- ─── 3. Drop Business demo/onboarding columns and OnboardingStep enum ────────

ALTER TABLE "Business" DROP COLUMN IF EXISTS "demoMode";
ALTER TABLE "Business" DROP COLUMN IF EXISTS "onboardingStep";
ALTER TABLE "Business" DROP COLUMN IF EXISTS "onboardingComplete";

DROP TYPE IF EXISTS "OnboardingStep";
