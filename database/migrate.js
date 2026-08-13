import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(
    __dirname,
    'migrations'
);

const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: 'crypto_strategy_lab',
});

async function getMigrationFiles() {
    const files = await fs.readdir(MIGRATIONS_DIR);

    return files
        .filter(file => file.endsWith('.sql'))
        .sort();
}

async function main() {
    await client.connect();

    console.log(
        'Connected to crypto_strategy_lab.'
    );

    /*
     * Migration tracking table must exist
     * before we can check which migrations
     * have already been executed.
     */
    await client.query(`
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
            id BIGSERIAL PRIMARY KEY,
            migration VARCHAR(255) NOT NULL UNIQUE,
            executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    const migrations = await getMigrationFiles();

    for (const migration of migrations) {
        const result = await client.query(
            `
            SELECT 1
            FROM public.schema_migrations
            WHERE migration = $1
            `,
            [migration]
        );

        if (result.rowCount > 0) {
            console.log(
                `Skipping ${migration} - already applied.`
            );

            continue;
        }

        console.log(
            `Running migration: ${migration}`
        );

        const filePath = path.join(
            MIGRATIONS_DIR,
            migration
        );

        const sql = await fs.readFile(
            filePath,
            'utf8'
        );

        await client.query('BEGIN');

        try {
            await client.query(sql);

            await client.query(
                `
                INSERT INTO public.schema_migrations (
                    migration
                )
                VALUES ($1)
                `,
                [migration]
            );

            await client.query('COMMIT');

            console.log(
                `Completed: ${migration}\n`
            );
        } catch (error) {
            await client.query('ROLLBACK');

            throw error;
        }
    }

    console.log('Migration completed successfully.');
}

try {
    await main();
} catch (error) {
    console.error('Migration failed.');
    console.error(error);

    process.exitCode = 1;
} finally {
    await client.end();
}