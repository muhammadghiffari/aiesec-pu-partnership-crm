-- Run in pgAdmin Query Tool with the aiesec CRM database selected.
-- This counts physical tables/columns, foreign keys, and lists exact deployed table columns.
SELECT 'all_public_tables' AS metric, count(*)::text AS value
FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'
UNION ALL
SELECT 'application_tables_excluding_schema_migrations', count(*)::text
FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'schema_migrations'
UNION ALL
SELECT 'public_columns', count(*)::text
FROM information_schema.columns WHERE table_schema='public'
UNION ALL
SELECT 'foreign_keys', count(*)::text
FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace;

SELECT table_name, ordinal_position, column_name, data_type, is_nullable,
       character_maximum_length, numeric_precision, numeric_scale, column_default
FROM information_schema.columns
WHERE table_schema='public'
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass::text AS child_table, conname AS constraint_name,
       confrelid::regclass::text AS parent_table, pg_get_constraintdef(oid) AS definition,
       CASE confdeltype WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL' WHEN 'a' THEN 'NO ACTION' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
FROM pg_constraint
WHERE contype='f' AND connamespace='public'::regnamespace
ORDER BY child_table, constraint_name;
