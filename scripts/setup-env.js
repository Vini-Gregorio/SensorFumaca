import { readFileSync,writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const example=readFileSync(new URL('../.env.example',import.meta.url),'utf8');
const env=example.replace(/^DB_PASSWORD=$/m,`DB_PASSWORD=${randomBytes(32).toString('hex')}`).replace(/^DB_ROOT_PASSWORD=$/m,`DB_ROOT_PASSWORD=${randomBytes(32).toString('hex')}`);
try {writeFileSync(new URL('../.env',import.meta.url),env,{flag:'wx',mode:0o600});console.log('.env local criado com senhas aleatórias. Não publique este arquivo.');}
catch(error){if(error.code==='EEXIST'){console.error('.env já existe; nada foi sobrescrito.');process.exitCode=1;}else throw error;}
