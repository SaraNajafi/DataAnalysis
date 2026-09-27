-- Seed the provider catalog (idempotent). Keep in sync with src/domain/providers.ts.
INSERT INTO "providers" ("slug", "name", "type", "icon", "sort_order") VALUES
  ('snapp-pay', 'اسنپ‌پی', 'bnpl', 'snapp-pay', 1),
  ('digipay', 'دیجی‌پی', 'bnpl', 'digipay', 2),
  ('tara', 'تارا', 'bnpl', 'tara', 3),
  ('kipa', 'کیپا', 'bnpl', 'kipa', 4),
  ('azkivam', 'ازکی‌وام', 'loan', 'azkivam', 5),
  ('bank', 'بانک', 'bank', 'bank', 6),
  ('other', 'سایر', 'other', 'other', 7)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "type" = EXCLUDED."type", "sort_order" = EXCLUDED."sort_order";
--> statement-breakpoint

-- Defense in depth for Supabase: tables in the public schema are exposed via
-- the Data API (PostgREST) to the `anon`/`authenticated` roles. پی‌نو never
-- queries the database from the browser — all access goes through the server
-- using the table-owner connection, which bypasses RLS. Enabling RLS with NO
-- policies denies every row to any other role, so a leaked anon key exposes nothing.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "otp_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "installments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminder_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;
