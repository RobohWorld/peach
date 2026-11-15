import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = { id: string; role: 'VIEWER' | 'CREATOR' | 'ADMIN' };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
