---
applyTo: "packages/core/src/db/**/*.ts"
---
# Drizzle ORM Patterns

- All tables live in `packages/core/src/db/schema.ts`. Add new tables there.
- Use `pgEnum` for enumerated columns; export the enum type alongside the table.
- Always declare `createdAt` with `defaultNow().notNull()`.
- Use `jsonb` (not `json`) for structured columns and type them with `$type<...>()`.
- Use `uuid().primaryKey().defaultRandom()` for new top-level entities.
- Add `index()` / `uniqueIndex()` for any column referenced in WHERE clauses.
- Export `InferSelect`/`InferInsert` types for every table.
- Never hand-write SQL — use Drizzle query builder. Use `drizzle-kit push` for schema sync.
