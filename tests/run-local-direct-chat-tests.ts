import { spawnSync } from 'node:child_process';
import path from 'node:path';

const supabaseCli=path.resolve('node_modules','supabase','dist','supabase.js');
const status=spawnSync(process.execPath,[supabaseCli,'status','-o','env'],{encoding:'utf8',env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'1'}});
if(status.status!==0){process.stderr.write('Local Supabase is unavailable.\n');process.exit(status.status??1);}
const values=new Map<string,string>();
for(const line of status.stdout.split(/\r?\n/)){const match=line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);if(match)values.set(match[1],match[2].replace(/"$/,''));}
const apiUrl=values.get('API_URL'), publishableKey=values.get('PUBLISHABLE_KEY')||values.get('ANON_KEY'), secretKey=values.get('SECRET_KEY')||values.get('SERVICE_ROLE_KEY');
if(!apiUrl||!publishableKey||!secretKey||!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(apiUrl)){process.stderr.write('Safe local test configuration unavailable.\n');process.exit(1);}
const result=spawnSync(process.execPath,[path.resolve('node_modules','tsx','dist','cli.mjs'),'--test',path.resolve('tests','integration','direct-chat-concurrency.test.ts')],{
  stdio:'inherit',env:{...process.env,TEST_SUPABASE_URL:apiUrl,TEST_SUPABASE_PUBLISHABLE_KEY:publishableKey,TEST_SUPABASE_SECRET_KEY:secretKey},
});
process.exit(result.status??1);
