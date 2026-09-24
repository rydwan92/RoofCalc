CREATE TABLE `platform_admins` (
	`user_id` varchar(128) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL,
	CONSTRAINT `platform_admins_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `platform_admins` ADD CONSTRAINT `platform_admins_user_id_auth_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE no action ON UPDATE no action;