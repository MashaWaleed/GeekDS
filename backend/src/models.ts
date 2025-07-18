import { Pool } from 'pg';

export interface Device {
  id: number;
  name: string;
  ip: string;
  status: string;
  last_ping: Date;
}

export interface MediaFile {
  id: number;
  filename: string;
  duration: number;
  type: string;
  upload_date: Date;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
}); 