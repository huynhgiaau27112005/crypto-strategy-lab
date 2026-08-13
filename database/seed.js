import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEEDS_DIR = path.join(
    __dirname,
    'seeds'
);

const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: 'crypto_strategy_lab',
});

async function main() {
    await client.connect();

    console.log(
        'Connected to crypto_strategy_lab.'
    );

    const files = await fs.readdir(SEEDS_DIR);

    const seeds = files
        .filter(file => file.endsWith('.sql'))
        .sort();

    for (const seed of seeds) {
        console.log(`Running seed: ${seed}`);

        const filePath = path.join(
            SEEDS_DIR,
            seed
        );

        const sql = await fs.readFile(
            filePath,
            'utf8'
        );

        await client.query(sql);

        console.log(
            `Completed: ${seed}`
        );
    }

    console.log('Seed completed successfully.');
}

try {
    await main();
} catch (error) {
    console.error('Seed failed.');
    console.error(error);

    process.exitCode = 1;
} finally {
    await client.end();
}