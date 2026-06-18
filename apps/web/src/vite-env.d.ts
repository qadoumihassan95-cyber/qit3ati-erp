/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// xlsx (SheetJS) ships its own .d.ts file in newer releases but the way Vite
// resolves it under tsc can miss it. Declare ambient module so tsc accepts
// `import * as XLSX from 'xlsx'` without needing @types/xlsx (which doesn't exist).
declare module 'xlsx' {
  // We only use a handful of APIs — list them explicitly so TS gives us
  // *some* type checking instead of full `any`.
  export interface WorkBook {
    SheetNames: string[];
    Sheets:     { [sheet: string]: WorkSheet };
    Workbook?:  any;
  }
  export interface WorkSheet {
    [cell: string]: any;
    '!cols'?:       any[];
    '!merges'?:     any[];
    '!sheetViews'?: any[];
    '!ref'?:        string;
  }
  export interface ParsingOptions {
    type?: 'array' | 'binary' | 'string' | 'buffer' | 'file' | 'base64';
    raw?:  boolean;
  }
  export const utils: {
    sheet_to_json<T = any>(ws: WorkSheet, opts?: { defval?: any; raw?: boolean }): T[];
    aoa_to_sheet(aoa: any[][]): WorkSheet;
    json_to_sheet(rows: any[]): WorkSheet;
    book_new(): WorkBook;
    book_append_sheet(wb: WorkBook, ws: WorkSheet, name?: string): void;
  };
  export function read(data: any, opts?: ParsingOptions): WorkBook;
  export function writeFile(wb: WorkBook, filename: string, opts?: any): void;
}
