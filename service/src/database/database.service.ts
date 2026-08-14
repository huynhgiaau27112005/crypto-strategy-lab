import {
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';

import { Pool, QueryResultRow, PoolClient } from 'pg';

@Injectable()
export class DatabaseService
    implements OnModuleInit, OnModuleDestroy {
    private readonly pool: Pool;

    constructor() {
        this.pool = new Pool({
            host: process.env.DATABASE_HOST,
            port: Number(process.env.DATABASE_PORT),
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME,
        });
    }

    async onModuleInit() {
        await this.pool.query('SELECT 1');

        console.log(
            'Database connection established.',
        );
    }

    async query<T extends QueryResultRow = any>(
        text: string,
        values?: unknown[],
    ) {
        return this.pool.query<T>(text, values);
    }

    async getClient(): Promise<PoolClient> {
        return this.pool.connect();
    }

    async onModuleDestroy() {
        await this.pool.end();
    }
}