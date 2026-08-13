import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDirectory = path.join(
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

try {
    await client.connect();

    console.log('Connected to crypto_strategy_lab.');

    const files = await fs.readdir(migrationsDirectory);

    const migrations = files
        .filter(file => file.endsWith('.sql'))
        .sort();

    for (const migration of migrations) {
        console.log(`Running migration: ${migration}`);

        const filePath = path.join(
            migrationsDirectory,
            migration
        );

        const sql = await fs.readFile(
            filePath,
            'utf8'
        );

        await client.query(sql);

        console.log(`Completed: ${migration}`);
    }

    console.log('All migrations completed.');
} catch (error) {
    console.error('Migration failed.');
    console.error(error);

    process.exitCode = 1;
} finally {
    await client.end();
}