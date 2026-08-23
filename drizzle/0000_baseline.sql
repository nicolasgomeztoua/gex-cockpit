-- Baseline. `IF NOT EXISTS` is deliberate: databases created by the pre-Drizzle
-- app already have these exact tables but no Drizzle migration bookkeeping.
-- Applying this migration to one of those databases must preserve every row.
CREATE TABLE IF NOT EXISTS `app_settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `snapshots` (
	`feed` text NOT NULL,
	`provider_ts` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	`spot` real NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`feed`, `provider_ts`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `spot_ticks` (
	`ticker` text NOT NULL,
	`ts` integer NOT NULL,
	`spot` real NOT NULL,
	PRIMARY KEY(`ticker`, `ts`)
);
