CREATE TABLE IF NOT EXISTS `chat_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`active_thread_id` text NOT NULL,
	`open_tab_ids_json` text NOT NULL,
	`tab_strip_persisted` integer,
	`working_directory` text DEFAULT '' NOT NULL,
	`active_workspace_id` text DEFAULT '' NOT NULL,
	`workspaces_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`updated_at` integer NOT NULL,
	`title_generated` integer DEFAULT 0 NOT NULL,
	`title_manual` integer DEFAULT 0 NOT NULL,
	`message_count` integer,
	`sort_index` integer DEFAULT 0 NOT NULL,
	`workspace_id` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_thread_messages` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`messages_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_thread_messages_backup` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`messages_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
