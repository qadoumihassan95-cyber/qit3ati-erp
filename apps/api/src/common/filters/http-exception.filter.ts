import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Global exception filter — translates every error into a clean JSON response.
 * NEVER leaks raw Prisma or stack traces to the client (defense in depth).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'حدث خطأ داخلي — يرجى المحاولة لاحقاً';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      message = typeof r === 'string' ? r : (r as any).message ?? r;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      code = exception.code;
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'القيمة موجودة مسبقاً';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'العنصر غير موجود';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'مرجع غير صالح — تأكد من الفرع/الصنف/الزبون';
          break;
        case 'P2000':
          status = HttpStatus.BAD_REQUEST;
          message = 'قيمة طويلة جداً للحقل';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          // log full error for ops; show generic message to user
          this.logger.warn(`Prisma ${exception.code}: ${exception.message}`);
          message = 'خطأ في البيانات — يرجى مراجعة المدخلات';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'P-VAL';
      this.logger.warn(`PrismaValidation: ${exception.message?.substring(0, 300)}`);
      message = 'بيانات غير صالحة — يرجى مراجعة المدخلات';
    } else if (exception instanceof Prisma.PrismaClientUnknownRequestError ||
               exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'P-INIT';
      this.logger.error(`PrismaInit: ${(exception as Error).message}`);
      message = 'تعذّر الوصول لقاعدة البيانات — يرجى المحاولة لاحقاً';
    } else if (exception instanceof Error) {
      // unknown JS error — keep message generic, log full
      this.logger.error(`Unhandled: ${exception.message}`, exception.stack);
      message = 'حدث خطأ — يرجى المحاولة لاحقاً';
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${status}`, (exception as Error)?.stack?.substring(0, 1000));
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
