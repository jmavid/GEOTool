CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`analysis_id` text,
	`website_id` text NOT NULL,
	`marketing_consent` integer DEFAULT false NOT NULL,
	`ip_hash` text,
	`report_sent_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_email_analysis_idx` ON `leads` (`email`,`analysis_id`);--> statement-breakpoint
CREATE INDEX `leads_analysis_idx` ON `leads` (`analysis_id`);--> statement-breakpoint
CREATE INDEX `leads_ip_idx` ON `leads` (`ip_hash`);