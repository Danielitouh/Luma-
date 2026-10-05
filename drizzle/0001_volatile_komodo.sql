CREATE TABLE `ai_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'puter' NOT NULL,
	`encrypted_key` text,
	`last_four` text,
	`model` text DEFAULT '' NOT NULL,
	`models` text DEFAULT '[]' NOT NULL,
	`request_token` text,
	`request_until` integer DEFAULT 0 NOT NULL
);
