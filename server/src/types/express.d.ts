import 'express';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      username: string;
      name: string;
      role: string;
      scope: string;
      email: string;
      mustChangePassword: boolean;
    }

    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

export {};
