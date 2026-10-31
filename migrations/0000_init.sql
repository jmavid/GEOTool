CREATE TABLE `ai_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`response` text NOT NULL,
	`brand_mentioned` integer NOT NULL,
	`recommended` integer NOT NULL,
	`position` integer,
	`competitors_mentioned` text NOT NULL,
	`citations` text NOT NULL,
	`brand_cited` integer DEFAULT false NOT NULL,
	`sentiment` text,
	`context` text,
	`cached` integer DEFAULT false NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_responses_analysis_idx` ON `ai_responses` (`analysis_id`);--> statement-breakpoint
CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`stage` text DEFAULT 'Queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`error` text,
	`plan` text DEFAULT 'FREE' NOT NULL,
	`ip_hash` text,
	`profile` text,
	`site_facts` text,
	`geo_score` integer,
	`score_breakdown` text,
	`provider_scores` text,
	`insights` text,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`cost_breakdown` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analyses_website_idx` ON `analyses` (`website_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `analyses_ip_idx` ON `analyses` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`is_target` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	`mentions` integer DEFAULT 0 NOT NULL,
	`share_of_voice` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competitors_analysis_idx` ON `competitors` (`analysis_id`);--> statement-breakpoint
CREATE TABLE `llm_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`category` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prompts_analysis_idx` ON `prompts` (`analysis_id`);--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`order` integer NOT NULL,
	`priority` text NOT NULL,
	`title` text NOT NULL,
	`problem` text NOT NULL,
	`evidence` text NOT NULL,
	`action` text NOT NULL,
	`impact` text NOT NULL,
	`difficulty` text NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recommendations_analysis_idx` ON `recommendations` (`analysis_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`plan` text DEFAULT 'FREE' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `websites` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `websites_url_unique` ON `websites` (`url`);--> statement-breakpoint
CREATE INDEX `websites_domain_idx` ON `websites` (`domain`);