ALTER TABLE `login_tokens` ADD `purpose` text DEFAULT 'login' NOT NULL;--> statement-breakpoint
ALTER TABLE `login_tokens` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;--> statement-breakpoint
-- Accounts so far were all created by clicking an emailed link, so their address is already proven.
UPDATE `users` SET `email_verified_at` = `created_at` WHERE `email_verified_at` IS NULL;
