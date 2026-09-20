CREATE TABLE `organization_assortment_items` (
	`id` varchar(128) NOT NULL,
	`organization_id` varchar(128) NOT NULL,
	`commercial_variant_id` varchar(128),
	`external_key` varchar(160) NOT NULL,
	`ean` varchar(32),
	`source_name` varchar(240) NOT NULL,
	`display_name_override` varchar(240),
	`active` boolean NOT NULL DEFAULT true,
	`preferred` boolean NOT NULL DEFAULT false,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organization_assortment_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_assortment_items_external_key_uq` UNIQUE(`organization_id`,`external_key`)
);
--> statement-breakpoint
CREATE TABLE `organization_import_batches` (
	`id` varchar(128) NOT NULL,
	`organization_id` varchar(128) NOT NULL,
	`source_label` varchar(240) NOT NULL,
	`checksum` char(64) NOT NULL,
	`status` varchar(32) NOT NULL,
	`counts` json NOT NULL,
	`error_summary` text,
	`started_at` datetime NOT NULL,
	`completed_at` datetime,
	`schema_version` int NOT NULL DEFAULT 1,
	CONSTRAINT `organization_import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` varchar(128) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`name` varchar(240) NOT NULL,
	`currency_code` char(3) NOT NULL,
	`tax_id` varchar(64),
	`address` varchar(400),
	`logo_url` varchar(2048),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `price_lists` ADD `organization_id` varchar(128);--> statement-breakpoint
ALTER TABLE `organization_assortment_items` ADD CONSTRAINT `organization_assortment_item_organization_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_assortment_items` ADD CONSTRAINT `organization_assortment_item_variant_fk` FOREIGN KEY (`commercial_variant_id`) REFERENCES `commercial_variants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_import_batches` ADD CONSTRAINT `organization_import_batch_organization_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `organization_assortment_items_variant_idx` ON `organization_assortment_items` (`organization_id`,`commercial_variant_id`);--> statement-breakpoint
CREATE INDEX `organization_assortment_items_active_idx` ON `organization_assortment_items` (`organization_id`,`active`);--> statement-breakpoint
CREATE INDEX `organization_assortment_items_ean_idx` ON `organization_assortment_items` (`ean`);--> statement-breakpoint
CREATE INDEX `organization_import_batches_organization_idx` ON `organization_import_batches` (`organization_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `organization_import_batches_checksum_idx` ON `organization_import_batches` (`checksum`);--> statement-breakpoint
CREATE INDEX `organizations_active_name_idx` ON `organizations` (`active`,`name`);--> statement-breakpoint
CREATE INDEX `price_lists_organization_idx` ON `price_lists` (`organization_id`,`valid_from`);