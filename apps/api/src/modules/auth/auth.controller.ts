import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsString() tenantSlug?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, dto.tenantSlug);
  }

  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user.sub);
  }
}
