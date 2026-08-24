import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController validation', () => {
  const auth = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  } as unknown as jest.Mocked<AuthService>;
  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(auth);
  });

  it('rejects register with a missing password', () => {
    expect(() =>
      controller.register({ email: 'a@example.com' }),
    ).toThrow(BadRequestException);
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('rejects register with a too-short password', () => {
    expect(() =>
      controller.register({ email: 'a@example.com', password: 'short' }),
    ).toThrow(BadRequestException);
  });

  it('rejects register with an empty password', () => {
    expect(() =>
      controller.register({ email: 'a@example.com', password: '' }),
    ).toThrow(BadRequestException);
  });

  it('rejects register with a malformed email', () => {
    expect(() =>
      controller.register({ email: 'not-an-email', password: 'password123' }),
    ).toThrow(BadRequestException);
  });

  it('accepts a well-formed register body', () => {
    (auth.register as jest.Mock).mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'b',
    });
    expect(() =>
      controller.register({
        email: 'a@example.com',
        password: 'password123',
      }),
    ).not.toThrow();
    expect(auth.register).toHaveBeenCalledWith(
      'a@example.com',
      'password123',
      undefined,
    );
  });

  it('rejects refresh with a missing refreshToken', () => {
    expect(() => controller.refresh({})).toThrow(BadRequestException);
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('rejects logout with a missing refreshToken', async () => {
    await expect(controller.logout({})).rejects.toThrow(BadRequestException);
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('rejects login with a missing password', () => {
    expect(() => controller.login({ email: 'a@example.com' })).toThrow(
      BadRequestException,
    );
  });
});
