CREATE TABLE `login_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`ip_hash` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_tokens_email_idx` ON `login_tokens` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_tokens_ip_idx` ON `login_tokens` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_websites` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`website_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_websites_project_website_idx` ON `project_websites` (`project_id`,`website_id`);--> statement-breakpoint
CREATE INDEX `project_websites_website_idx` ON `project_websites` (`website_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `analyses` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `analyses_user_idx` ON `analyses` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `stripe_customer_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `stripe_subscription_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `subscription_status` text;--> statement-breakpoint
ALTER TABLE `users` ADD `current_period_end` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `agency_name` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_stripe_customer_id_unique` ON `users` (`stripe_customer_id`);