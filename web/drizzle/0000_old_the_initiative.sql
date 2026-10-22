CREATE TABLE `receipts` (
	`op_id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`accepted` integer NOT NULL,
	`rev` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`rev` integer DEFAULT 1 NOT NULL,
	`last_op` text NOT NULL,
	`updated_at` integer NOT NULL
);
