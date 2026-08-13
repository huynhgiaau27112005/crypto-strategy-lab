import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const databaseName = 'crypto_strategy_lab';

const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
});

try {
    await client.connect();

    console.log('Connected to PostgreSQL.');

    const result = await client.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [databaseName]
    );

    if (result.rowCount > 0) {
        console.log(`Database "${databaseName}" already exists.`);
    } else {
        await client.query(`CREATE DATABASE "${databaseName}"`);

        console.log(`Database "${databaseName}" created.`);
    }
} catch (error) {
    console.error('Failed to create database.');
    console.error(error.message);

    process.exitCode = 1;
} finally {
    await client.end();
}