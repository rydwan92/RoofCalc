CREATE TABLE `auth_accounts` (
	`id` varchar(128) NOT NULL,
	`user_id` varchar(128) NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(64) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` timestamp(3),
	`refresh_token_expires_at` timestamp(3),
	`scope` text,
	`password` text,
	`created_at` timestamp(3) NOT NULL,
	`updated_at` timestamp(3) NOT NULL,
	CONSTRAINT `auth_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_provider_account_uq` UNIQUE(`provider_id`,`account_id`)
);
--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`id` varchar(128) NOT NULL,
	`rate_key` varchar(255) NOT NULL,
	`count` int NOT NULL,
	`last_request` bigint NOT NULL,
	CONSTRAINT `auth_rate_limits_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_rate_limits_rate_key_unique` UNIQUE(`rate_key`)
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` varchar(128) NOT NULL,
	`user_id` varchar(128) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`created_at` timestamp(3) NOT NULL,
	`updated_at` timestamp(3) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` varchar(128) NOT NULL,
	`name` text NOT NULL,
	`email` varchar(254) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`created_at` timestamp(3) NOT NULL,
	`updated_at` timestamp(3) NOT NULL,
	CONSTRAINT `auth_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` varchar(128) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`created_at` timestamp(3) NOT NULL,
	`updated_at` timestamp(3) NOT NULL,
	CONSTRAINT `auth_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_customers` (
	`id` varchar(128) NOT NULL,
	`organization_id` varchar(128) NOT NULL,
	`type` varchar(16) NOT NULL,
	`name` varchar(240) NOT NULL,
	`company_name` varchar(240),
	`tax_id` varchar(64),
	`email` varchar(254),
	`phone` varchar(64),
	`address` varchar(400),
	`postal_code` varchar(32),
	`city` varchar(240),
	`notes` text,
	`created_at` timestamp(3) NOT NULL,
	`updated_at` timestamp(3) NOT NULL,
	`archived_at` timestamp(3),
	CONSTRAINT `business_customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_org_id_uq` UNIQUE(`organization_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `commercial_estimations` (
	`id` varchar(128) NOT NULL,
	`organization_id` varchar(128) NOT NULL,
	`customer_id` varchar(128) NOT NULL,
	`roof_project_id` varchar(128) NOT NULL,
	`name` varchar(240) NOT NULL,
	`location` varchar(400),
	`status` varchar(16) NOT NULL DEFAULT 'draft',
	`version` int NOT NULL DEFAULT 1,
	`project_snapshot` json NOT NULL,
	`created_at` timestamp(3) NOT NULL,
	`updated_at` timestamp(3) NOT NULL,
	`created_by` varchar(128),
	CONSTRAINT `commercial_estimations_id` PRIMARY KEY(`id`),
	CONSTRAINT `estimation_org_id_uq` UNIQUE(`organization_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `organization_memberships` (
	`organization_id` varchar(128) NOT NULL,
	`user_id` varchar(128) NOT NULL,
	`role` varchar(16) NOT NULL,
	CONSTRAINT `organization_memberships_organization_id_user_id_pk` PRIMARY KEY(`organization_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `quote_counters` (
	`organization_id` varchar(128) NOT NULL,
	`year` int NOT NULL,
	`value` int NOT NULL,
	CONSTRAINT `quote_counters_organization_id_year_pk` PRIMARY KEY(`organization_id`,`year`)
);
--> statement-breakpoint
CREATE TABLE `quote_drafts` (
	`id` varchar(128) NOT NULL,
	`organization_id` varchar(128) NOT NULL,
	`commercial_estimation_id` varchar(128) NOT NULL,
	`number` varchar(64) NOT NULL,
	`schema_version` int NOT NULL DEFAULT 1,
	`status` varchar(16) NOT NULL DEFAULT 'draft',
	`currency_code` varchar(3) NOT NULL,
	`snapshot_json` json NOT NULL,
	`source_fingerprint` varchar(128) NOT NULL,
	`created_at` timestamp(3) NOT NULL,
	`updated_at` timestamp(3) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	CONSTRAINT `quote_drafts_id` PRIMARY KEY(`id`),
	CONSTRAINT `quote_org_number_uq` UNIQUE(`organization_id`,`number`),
	CONSTRAINT `quote_estimation_uq` UNIQUE(`organization_id`,`commercial_estimation_id`)
);
--> statement-breakpoint
ALTER TABLE `auth_accounts` ADD CONSTRAINT `auth_accounts_user_id_auth_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_auth_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_customers` ADD CONSTRAINT `business_customers_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commercial_estimations` ADD CONSTRAINT `commercial_estimations_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commercial_estimations` ADD CONSTRAINT `commercial_estimations_created_by_auth_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `auth_users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commercial_estimations` ADD CONSTRAINT `estimation_customer_scope_fk` FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `business_customers`(`organization_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_user_id_auth_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_counters` ADD CONSTRAINT `quote_counters_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_drafts` ADD CONSTRAINT `quote_estimation_scope_fk` FOREIGN KEY (`organization_id`,`commercial_estimation_id`) REFERENCES `commercial_estimations`(`organization_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_account_user_idx` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_session_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_verification_identifier_idx` ON `auth_verifications` (`identifier`);--> statement-breakpoint
CREATE INDEX `customer_org_name_idx` ON `business_customers` (`organization_id`,`name`);--> statement-breakpoint
CREATE INDEX `estimation_org_updated_idx` ON `commercial_estimations` (`organization_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `membership_user_idx` ON `organization_memberships` (`user_id`);