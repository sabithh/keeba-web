export {};

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      user?: {
        id: number;
      };
    }
  }
}
