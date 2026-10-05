import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', { userId: text('user_id').primaryKey(), data: text('data').notNull(), revision: integer('revision').notNull().default(0) });
export const aiConnections = sqliteTable('ai_connections', {
  userId: text('user_id').primaryKey(),
  provider: text('provider').notNull().default('puter'),
  encryptedKey: text('encrypted_key'),
  lastFour: text('last_four'),
  model: text('model').notNull().default(''),
  models: text('models').notNull().default('[]'),
  requestToken: text('request_token'),
  requestUntil: integer('request_until').notNull().default(0),
});
