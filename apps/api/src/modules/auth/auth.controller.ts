import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

class LoginDto {
  @IsEmail() @MaxLength(150) email!: string;
  @IsString() @MinLength(6) @MaxLength(128) password!: string;
  @IsOptional() @IsString() @MaxLength(80) tenantSlug?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Strict rate-limited login: 5 attempts per minute per IP.
   * Prevents brute-force credential stuffing.
   */
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, dto.tenantSlug);
  }

  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user.sub);
  }
}
