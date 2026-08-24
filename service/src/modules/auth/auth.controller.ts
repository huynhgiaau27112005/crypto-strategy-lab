import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { z, ZodError, ZodType } from 'zod';
import { AuthService } from './auth.service';
import {
  LoginDto,
  loginSchema,
  RefreshDto,
  refreshSchema,
  RegisterDto,
  registerSchema,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() body: unknown) {
    const dto = this.parse(registerSchema, body);
    return this.auth.register(dto.email, dto.password, dto.displayName);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: unknown) {
    const dto = this.parse(loginSchema, body);
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: unknown) {
    const dto = this.parse(refreshSchema, body);
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown) {
    const dto = this.parse(refreshSchema, body);
    await this.auth.logout(dto.refreshToken);
  }

  private parse<T extends ZodType>(schema: T, body: unknown): z.infer<T> {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(this.formatZodError(result.error));
    }
    return result.data;
  }

  private formatZodError(error: ZodError): string {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`)
      .join('; ');
  }
}

export type { LoginDto, RefreshDto, RegisterDto };
