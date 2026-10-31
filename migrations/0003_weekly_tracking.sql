ALTER TABLE `analyses` ADD `trigger` text DEFAULT 'USER' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `token` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `unsubscribed_at` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `last_notified_analysis_id` text;--> statement-breakpoint
-- Existing sign-ups get a token so they can confirm or unsubscribe like new ones.
UPDATE `subscriptions` SET `token` = lower(hex(randomblob(16))) WHERE `token` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_token_idx` ON `subscriptions` (`token`);