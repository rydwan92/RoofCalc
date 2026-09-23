ALTER TABLE `organization_assortment_items` ADD `vat_rate_bps` int;--> statement-breakpoint
ALTER TABLE `organization_memberships` ADD `active` boolean DEFAULT true NOT NULL;