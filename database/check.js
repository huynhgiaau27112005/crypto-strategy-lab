import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME || 'crypto_strategy_lab',
});

try {
    await client.connect();

    const tables = await client.query(`
        SELECT
            schemaname,
            tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
            'sessions',
            'candles',
            'strategies',
            'experiments',
            'experiment_strategies',
            'trades',
            'evaluations',
            'leaderboards',
            'leaderboard_entries'
          )
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
        FROM candles;
    `);

    const searchColumns = await client.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'experiments' AND column_name IN (
              'search_algorithm', 'search_config', 'random_seed',
              'stop_reason', 'error_message'
            ))
            OR (table_name = 'strategies' AND column_name = 'configuration_hash')
          )
        ORDER BY table_name, column_name;
    `);

    const expectedSearchColumns = 6;
    if (searchColumns.rowCount !== expectedSearchColumns) {
        throw new Error(
            `Domain-guided search schema is incomplete: expected ${expectedSearchColumns} columns, found ${searchColumns.rowCount}.`
        );
    }

    console.log('\n=== APPLICATION TABLES ===');

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

    console.log('\n=== DOMAIN-GUIDED SEARCH COLUMNS ===');

    for (const row of searchColumns.rows) {
        console.log(
            `${row.table_name}.${row.column_name}`
        );
    }
} catch (error) {
    console.error(error);

    process.exitCode = 1;
} finally {
    await client.end();
}
