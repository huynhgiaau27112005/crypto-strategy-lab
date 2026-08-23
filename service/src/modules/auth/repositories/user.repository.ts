import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { UserEntity } from '../../../database/types';

@Injectable()
export class UserRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    const result = await this.database.query<UserEntity>(
      `SELECT * FROM users WHERE email = $1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const result = await this.database.query<UserEntity>(
      `SELECT * FROM users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async create(
    email: string,
    passwordHash: string,
    displayName: string | null,
  ): Promise<UserEntity> {
    const result = await this.database.query<UserEntity>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3) RETURNING *`,
      [email, passwordHash, displayName],
    );
    return result.rows[0];
  }
}
