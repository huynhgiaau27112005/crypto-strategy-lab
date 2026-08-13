import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: 'crypto_strategy_lab',
});

try {
    await client.connect();

    const tables = await client.query(`
        SELECT
            schemaname,
            tablename
        FROM pg_tables
        WHERE schemaname = 'market'
        ORDER BY tablename;
    `);

    const hypertables = await client.query(`
        SELECT
            hypertable_schema,
            hypertable_name
        FROM timescaledb_information.hypertables
        ORDER BY hypertable_name;
    `);

    const candleCount = await client.query(`
        SELECT COUNT(*) AS count
        FROM market.candles;
    `);

    console.log('\n=== MARKET TABLES ===');

    for (const row of tables.rows) {
        console.log(
            `${row.schemaname}.${row.tablename}`
        );
    }

    console.log('\n=== HYPERTABLES ===');

    for (const row of hypertables.rows) {
        console.log(
            `${row.hypertable_schema}.${row.hypertable_name}`
        );
    }

    console.log('\n=== CANDLES ===');

    console.log(
        `Rows: ${candleCount.rows[0].count}`
    );
} catch (error) {
    console.error(error);

    process.exitCode = 1;
} finally {
    await client.end();
}