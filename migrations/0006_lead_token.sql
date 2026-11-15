ALTER TABLE `leads` ADD `token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `leads_token_idx` ON `leads` (`token`);
--> statement-breakpoint
UPDATE `leads` SET `token` = lower(hex(randomblob(16))) WHERE `token` IS NULL;