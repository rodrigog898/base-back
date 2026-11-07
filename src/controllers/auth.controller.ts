import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { UnauthorizedError } from '../utils/errors';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../utils/cookies';
import { requestMeta } from '../utils/network';
import { setContextUser } from '../context/requestContext';
import { AuthResult } from '../types';

/** Express 5 propaga automáticamente los errores de handlers async al error handler. */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private respond(res: Response, status: number, result: AuthResult): void {
    setContextUser(result.user.id);
    setRefreshCookie(res, result.refreshToken);
    res.status(status).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.accessTokenExpiresIn,
      },
    });
  }

  register = async (req: Request, res: Response): Promise<void> => {
    this.respond(res, 201, await this.authService.register(req.body, requestMeta(req)));
  };

  login = async (req: Request, res: Response): Promise<void> => {
    this.respond(res, 200, await this.authService.login(req.body, requestMeta(req)));
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      this.respond(res, 200, await this.authService.refresh(readRefreshCookie(req), requestMeta(req)));
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.authService.logout(readRefreshCookie(req), requestMeta(req));
    clearRefreshCookie(res);
    res.status(204).end();
  };

  logoutAll = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError('Autenticación requerida');
    await this.authService.logoutAll(req.user.sub, requestMeta(req));
    clearRefreshCookie(res);
    res.status(204).end();
  };

  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError('Autenticación requerida');
    const user = await this.authService.getCurrentUser(req.user.sub);
    res.status(200).json({
      success: true,
      data: { id: user.id, email: user.email, role: user.role, lastConnectionAt: user.lastConnectionAt },
    });
  };
}
