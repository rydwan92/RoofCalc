CREATE TABLE `price_list_entries` (
	`id` varchar(128) NOT NULL,
	`price_list_id` varchar(128) NOT NULL,
	`commercial_variant_id` varchar(128) NOT NULL,
	`sale_unit` varchar(16) NOT NULL,
	`net_amount_minor` int NOT NULL,
	`valid_from` date NOT NULL,
	`valid_to` date,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_list_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_lists` (
	`id` varchar(128) NOT NULL,
	`owner_label` varchar(240) NOT NULL,
	`currency_code` varchar(3) NOT NULL,
	`region_code` varchar(16),
	`tax_context` varchar(160),
	`valid_from` date NOT NULL,
	`valid_to` date,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pricing_import_batches` (
	`id` varchar(128) NOT NULL,
	`source_id` varchar(128) NOT NULL,
	`source_label` varchar(240) NOT NULL,
	`checksum` char(64) NOT NULL,
	`status` varchar(32) NOT NULL,
	`counts` json NOT NULL,
	`error_summary` text,
	`started_at` datetime NOT NULL,
	`completed_at` datetime,
	`schema_version` int NOT NULL DEFAULT 1,
	CONSTRAINT `pricing_import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `price_list_entries` ADD CONSTRAINT `price_list_entry_list_fk` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_list_entries` ADD CONSTRAINT `price_list_entry_variant_fk` FOREIGN KEY (`commercial_variant_id`) REFERENCES `commercial_variants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `price_list_entries_variant_valid_idx` ON `price_list_entries` (`commercial_variant_id`,`valid_from`);--> statement-breakpoint
CREATE INDEX `price_list_entries_price_list_idx` ON `price_list_entries` (`price_list_id`);--> statement-breakpoint
CREATE INDEX `price_lists_currency_idx` ON `price_lists` (`currency_code`);--> statement-breakpoint
CREATE INDEX `price_lists_valid_idx` ON `price_lists` (`valid_from`,`valid_to`);--> statement-breakpoint
CREATE INDEX `pricing_import_batches_source_idx` ON `pricing_import_batches` (`source_id`);--> statement-breakpoint
CREATE INDEX `pricing_import_batches_checksum_idx` ON `pricing_import_batches` (`checksum`);