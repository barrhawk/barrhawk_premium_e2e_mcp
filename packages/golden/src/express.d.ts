// Type declaration for express
declare module 'express' {
  interface Request {
    query: Record<string, string | undefined>;
    params: Record<string, string>;
    body: unknown;
  }

  interface Response {
    send(body: string): Response;
    json(body: unknown): Response;
    status(code: number): Response;
  }

  type RequestHandler = (req: Request, res: Response) => void | Promise<void>;

  interface Express {
    get(path: string, handler: RequestHandler): void;
    post(path: string, handler: RequestHandler): void;
    use(middleware: unknown): void;
    listen(port: number, callback?: () => void): void;
  }

  interface ExpressStatic {
    (): Express;
    json(): unknown;
    urlencoded(options: { extended: boolean }): unknown;
  }

  const express: ExpressStatic;
  export = express;
}
