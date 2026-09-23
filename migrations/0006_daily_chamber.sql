ALTER TABLE `organizations` ADD `phone` varchar(64);--> statement-breakpoint
ALTER TABLE `organizations` ADD `email` varchar(254);--> statement-breakpoint
ALTER TABLE `organizations` ADD `website` varchar(2048);--> statement-breakpoint
ALTER TABLE `organizations` ADD `default_validity_days` int;--> statement-breakpoint
ALTER TABLE `organizations` ADD `offer_footer` text;