CREATE TABLE `catalog_import_batches` (
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
	CONSTRAINT `catalog_import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commercial_variants` (
	`id` varchar(128) NOT NULL,
	`product_id` varchar(128) NOT NULL,
	`sku` varchar(160),
	`name` varchar(240) NOT NULL,
	`color` varchar(160),
	`finish` varchar(160),
	`metadata` json,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `commercial_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manufacturers` (
	`id` varchar(128) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`name` varchar(240) NOT NULL,
	`country_code` char(2),
	`website_url` varchar(2048),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `manufacturers_id` PRIMARY KEY(`id`),
	CONSTRAINT `manufacturers_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `technical_product_families` (
	`id` varchar(128) NOT NULL,
	`manufacturer_id` varchar(128) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`name` varchar(240) NOT NULL,
	`covering_kind` varchar(32) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `technical_product_families_id` PRIMARY KEY(`id`),
	CONSTRAINT `technical_product_families_manufacturer_slug_uq` UNIQUE(`manufacturer_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `technical_product_revisions` (
	`id` varchar(128) NOT NULL,
	`product_id` varchar(128) NOT NULL,
	`revision_code` varchar(128) NOT NULL,
	`technical_spec` json NOT NULL,
	`valid_from` date,
	`source_url` varchar(2048),
	`source_label` varchar(240),
	`source_revision` varchar(160),
	`source_hash` varchar(256),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `technical_product_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `technical_product_revisions_product_code_uq` UNIQUE(`product_id`,`revision_code`)
);
--> statement-breakpoint
ALTER TABLE `commercial_variants` ADD CONSTRAINT `commercial_variant_family_fk` FOREIGN KEY (`product_id`) REFERENCES `technical_product_families`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `technical_product_families` ADD CONSTRAINT `product_family_manufacturer_fk` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `technical_product_revisions` ADD CONSTRAINT `product_revision_family_fk` FOREIGN KEY (`product_id`) REFERENCES `technical_product_families`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `catalog_import_batches_source_idx` ON `catalog_import_batches` (`source_id`);--> statement-breakpoint
CREATE INDEX `catalog_import_batches_checksum_idx` ON `catalog_import_batches` (`checksum`);--> statement-breakpoint
CREATE INDEX `catalog_import_batches_status_started_idx` ON `catalog_import_batches` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `commercial_variants_product_active_idx` ON `commercial_variants` (`product_id`,`active`);--> statement-breakpoint
CREATE INDEX `commercial_variants_sku_idx` ON `commercial_variants` (`sku`);--> statement-breakpoint
CREATE INDEX `manufacturers_active_name_idx` ON `manufacturers` (`active`,`name`);--> statement-breakpoint
CREATE INDEX `technical_product_families_kind_active_idx` ON `technical_product_families` (`covering_kind`,`active`);--> statement-breakpoint
CREATE INDEX `technical_product_families_manufacturer_idx` ON `technical_product_families` (`manufacturer_id`);--> statement-breakpoint
CREATE INDEX `technical_product_families_name_idx` ON `technical_product_families` (`name`);--> statement-breakpoint
CREATE INDEX `technical_product_revisions_product_valid_idx` ON `technical_product_revisions` (`product_id`,`valid_from`);