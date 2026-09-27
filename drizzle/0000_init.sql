CREATE TYPE "public"."credit_account_source" AS ENUM('manual', 'provider_api', 'bank_api', 'import');--> statement-breakpoint
CREATE TYPE "public"."credit_account_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."installment_frequency" AS ENUM('monthly', 'biweekly', 'weekly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."provider_type" AS ENUM('bnpl', 'bank', 'loan', 'other');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_name" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"custom_provider_name" text,
	"title" text,
	"installment_amount" bigint NOT NULL,
	"initial_installment_count" integer NOT NULL,
	"remaining_installments" integer NOT NULL,
	"first_due_date" date NOT NULL,
	"frequency" "installment_frequency" DEFAULT 'monthly' NOT NULL,
	"custom_frequency_days" integer,
	"total_original_debt" bigint NOT NULL,
	"status" "credit_account_status" DEFAULT 'active' NOT NULL,
	"source" "credit_account_source" DEFAULT 'manual' NOT NULL,
	"client_request_id" uuid,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_accounts_amount_positive" CHECK ("credit_accounts"."installment_amount" > 0),
	CONSTRAINT "credit_accounts_counts_non_negative" CHECK ("credit_accounts"."initial_installment_count" >= 0 AND "credit_accounts"."remaining_installments" >= 0),
	CONSTRAINT "credit_accounts_custom_frequency" CHECK (("credit_accounts"."frequency" <> 'custom') OR ("credit_accounts"."custom_frequency_days" BETWEEN 1 AND 365))
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_account_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"amount" bigint NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installments_amount_positive" CHECK ("installments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "otp_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_number" text NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"request_ip_hash" text,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" "provider_type" NOT NULL,
	"icon" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credit_account_id" uuid,
	"days_before" integer[] DEFAULT '{1}'::integer[] NOT NULL,
	"due_date_reminder" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_number_format" CHECK ("users"."phone_number" ~ '^\+989[0-9]{9}$')
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_credit_account_id_credit_accounts_id_fk" FOREIGN KEY ("credit_account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_preferences" ADD CONSTRAINT "reminder_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_preferences" ADD CONSTRAINT "reminder_preferences_credit_account_id_credit_accounts_id_fk" FOREIGN KEY ("credit_account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_name_created_idx" ON "analytics_events" USING btree ("event_name","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_user_created_idx" ON "analytics_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_accounts_user_status_idx" ON "credit_accounts" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_accounts_user_client_request_key" ON "credit_accounts" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "installments_account_due_idx" ON "installments" USING btree ("credit_account_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "installments_account_sequence_key" ON "installments" USING btree ("credit_account_id","sequence");--> statement-breakpoint
CREATE INDEX "otp_requests_phone_created_idx" ON "otp_requests" USING btree ("phone_number","created_at");--> statement-breakpoint
CREATE INDEX "otp_requests_ip_created_idx" ON "otp_requests" USING btree ("request_ip_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "providers_slug_key" ON "providers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_preferences_user_default_key" ON "reminder_preferences" USING btree ("user_id") WHERE "reminder_preferences"."credit_account_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_preferences_user_account_key" ON "reminder_preferences" USING btree ("user_id","credit_account_id") WHERE "reminder_preferences"."credit_account_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_number_key" ON "users" USING btree ("phone_number");