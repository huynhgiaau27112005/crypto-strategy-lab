import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { RefreshTokenEntity } from '../../../database/types';

@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly database: DatabaseService) {}

  async store(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<RefreshTokenEntity> {
    const result = await this.database.query<RefreshTokenEntity>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, tokenHash, expiresAt],
    );
    return result.rows[0];
  }

  async findValidByHash(tokenHash: string): Promise<RefreshTokenEntity | null> {
    const result = await this.database.query<RefreshTokenEntity>(
      `SELECT * FROM refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.database.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
      [tokenHash],
    );
  }
}
