import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UserRepository } from './repositories/user.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';

describe('AuthService', () => {
  const users = {
    findByEmail: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<UserRepository>;
  const refreshTokens = {
    store: jest.fn(),
    findValidByHash: jest.fn(),
    revoke: jest.fn(),
  } as unknown as jest.Mocked<RefreshTokenRepository>;
  const jwt = new JwtService({ secret: 'test-secret' });
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(users, refreshTokens, jwt);
  });

  it('rejects registering an email that already exists', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue({ id: 'u1' });
    await expect(
      service.register('taken@example.com', 'password123'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('registers a new user with a bcrypt-hashed password', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue(null);
    (users.create as jest.Mock).mockImplementation(
      async (email: string, passwordHash: string) => ({
        id: 'u1',
        email,
        password_hash: passwordHash,
        display_name: null,
      }),
    );
    const result = await service.register('new@example.com', 'password123');
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    const [, passwordHash] = (users.create as jest.Mock).mock.calls[0];
    expect(passwordHash).not.toEqual('password123');
  });

  it('rejects login with a wrong password', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      password_hash: await service.hashPassword('correct-password'),
    });
    await expect(
      service.login('a@example.com', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects refresh with an unknown token', async () => {
    (refreshTokens.findValidByHash as jest.Mock).mockResolvedValue(null);
    await expect(service.refresh('bogus-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
