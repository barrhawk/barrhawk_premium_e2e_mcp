// Type declaration for optional better-sqlite3 dependency
declare module 'better-sqlite3' {
  interface Database {
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }

  interface Statement {
    run(...params: any[]): RunResult;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  function Database(filename: string, options?: any): Database;
  export = Database;
}
