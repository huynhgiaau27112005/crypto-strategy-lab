import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { Pool, QueryResultRow, PoolClient } from 'pg';

@Injectable()
export class DatabaseService
    implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DatabaseService.name);
    private readonly pool: Pool;

    constructor() {
        this.pool = new Pool({
            host: process.env.DATABASE_HOST,
            port: Number(process.env.DATABASE_PORT),
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME || 'crypto_strategy_lab',
        });
    }

    async onModuleInit() {
        try {
            await this.pool.query('SELECT 1');
            this.logger.log('Database connection established.');
        } catch (error: any) {
            this.logger.warn(
                `Initial database connection check failed (${error?.message || error}). Application will attempt reconnection on requests.`,
            );
        }
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

    async withTransaction<T>(
        callback: (client: PoolClient) => Promise<T>,
    ): Promise<T> {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async isHealthy(): Promise<boolean> {
        try {
            await this.pool.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }

    async onModuleDestroy() {
        await this.pool.end();
    }
}