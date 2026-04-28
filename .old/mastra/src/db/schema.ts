import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  synopsis: text('synopsis'),
  genre: text('genre'),
  status: text('status').notNull().default('drafting'),
  archived: integer('archived').notNull().default(0),
  worldInitStatus: text('world_init_status').notNull().default('idle'),
  worldInitError: text('world_init_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').default(''),
  order: integer('order').notNull().default(0),
  status: text('status').notNull().default('draft'),
  wordCount: integer('word_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Chapter = typeof chapters.$inferSelect;
export type NewChapter = typeof chapters.$inferInsert;

// ---------------------------------------------------------------------------
// agents — global agent definitions (presets + user-created)
// ---------------------------------------------------------------------------
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull().default(''),
  model: text('model').notNull().default(''),
  provider: text('provider').notNull().default(''),
  isPreset: integer('is_preset').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

// ---------------------------------------------------------------------------
// settings — global key-value config store (LLM keys, preferences, etc.)
// ---------------------------------------------------------------------------
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at').notNull(),
});

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

// ---------------------------------------------------------------------------
// providers — LLM service provider configurations
// ---------------------------------------------------------------------------
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default('custom'), // 'openai' | 'anthropic' | 'ollama' | 'custom'
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key'),
  models: text('models').notNull().default('[]'),
  isPreset: integer('is_preset').notNull().default(0),
  enabled: integer('enabled').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

// ---------------------------------------------------------------------------
// world_setting_types — per-project setting category definitions
// Includes built-in preset types (is_preset=1) and user-created custom types.
// ---------------------------------------------------------------------------
export const worldSettingTypes = sqliteTable('world_setting_types', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),          // e.g. "地理环境", "魔法体系"
  icon: text('icon').notNull().default('📖'),  // emoji or icon key
  description: text('description'),      // brief description of this category
  isPreset: integer('is_preset').notNull().default(0),  // 1 = built-in default
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type WorldSettingType = typeof worldSettingTypes.$inferSelect;
export type NewWorldSettingType = typeof worldSettingTypes.$inferInsert;

// ---------------------------------------------------------------------------
// world_settings — individual world-building entries
// Each entry belongs to a project and a type, with structured content stored
// as JSON in the `content` field for flexible AI consumption.
// ---------------------------------------------------------------------------
export const worldSettings = sqliteTable('world_settings', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  typeId: text('type_id')
    .notNull()
    .references(() => worldSettingTypes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),        // entry name / heading
  summary: text('summary'),             // one-line summary for quick AI context
  content: text('content').notNull().default(''), // full detail (markdown)
  tags: text('tags').notNull().default('[]'),     // JSON string array for filtering
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type WorldSetting = typeof worldSettings.$inferSelect;
export type NewWorldSetting = typeof worldSettings.$inferInsert;

// ---------------------------------------------------------------------------
// outlines — story outline nodes (volumes + chapter nodes), independent from
// actual chapter content. Supports 2-level hierarchy: volume → chapter node.
// ---------------------------------------------------------------------------
export const outlines = sqliteTable('outlines', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),           // null = volume (卷), non-null = chapter node under a volume
  title: text('title').notNull(),
  description: text('description'),      // synopsis / outline content for this node
  type: text('type').notNull().default('chapter'),  // 'volume' | 'chapter'
  order: integer('order').notNull().default(0),
  status: text('status').notNull().default('draft'),  // 'draft' | 'done'
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Outline = typeof outlines.$inferSelect;
export type NewOutline = typeof outlines.$inferInsert;
