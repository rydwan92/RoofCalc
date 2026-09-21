DROP INDEX `organization_assortment_items_ean_idx` ON `organization_assortment_items`;--> statement-breakpoint
ALTER TABLE `price_lists` ADD CONSTRAINT `price_list_organization_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `organization_assortment_items_picker_idx` ON `organization_assortment_items` (`organization_id`,`active`,`preferred`,`source_name`);--> statement-breakpoint
CREATE INDEX `organization_assortment_items_display_name_idx` ON `organization_assortment_items` (`organization_id`,`display_name_override`);--> statement-breakpoint
CREATE INDEX `organization_assortment_items_ean_idx` ON `organization_assortment_items` (`organization_id`,`ean`);