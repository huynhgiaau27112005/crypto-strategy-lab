import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthTokens } from './dto/auth.dto';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { UserRepository } from './repositories/user.repository';

const REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly jwt: JwtService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<AuthTokens> {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email is already registered.');
    }
    const passwordHash = await this.hashPassword(password);
    const user = await this.users.create(
      email,
      passwordHash,
      displayName ?? null,
    );
    return this.issueTokens(user.id, user.email);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials.');
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials.');
    }
    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) throw new UnauthorizedException('Invalid credentials.');
    return this.issueTokens(user.id, user.email);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokens.findValidByHash(tokenHash);
    if (!stored) throw new UnauthorizedException('Invalid refresh token.');
    const user = await this.users.findById(stored.user_id);
    if (!user) throw new UnauthorizedException('Invalid refresh token.');
    await this.refreshTokens.revoke(tokenHash);
    return this.issueTokens(user.id, user.email);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.revoke(this.hashToken(refreshToken));
  }

  private async issueTokens(
    userId: string,
    email: string,
  ): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
        expiresIn: (process.env.JWT_ACCESS_TTL ??
          '15m') as JwtSignOptions['expiresIn'],
      },
    );
    const refreshToken = randomUUID() + randomUUID();
    const expiresAt = new Date(
      Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.refreshTokens.store(
      userId,
      this.hashToken(refreshToken),
      expiresAt,
    );
    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
