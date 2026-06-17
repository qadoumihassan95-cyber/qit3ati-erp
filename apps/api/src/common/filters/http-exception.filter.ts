import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      message = typeof r === 'string' ? r : (r as any).message ?? r;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      code = exception.code;
      switch (exception.code) {
        case 'P2002': status = HttpStatus.CONFLICT; message = 'القيمة موجودة مسبقاً'; break;
        case 'P2025': status = HttpStatus.NOT_FOUND; message = 'العنصر غير موجود'; break;
        default:      status = HttpStatus.BAD_REQUEST; message = exception.message; break;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url}`, (exception as Error)?.stack);
    }

    res.status(status).json({
      ok: false,
      status,
      code,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
