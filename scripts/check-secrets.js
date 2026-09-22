import { execFileSync } from 'node:child_process';
import { readFileSync,existsSync } from 'node:fs';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const rules=[[/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/,'token Telegram'],[/\bAKIA[A-Z0-9]{16}\b/,'chave AWS'],[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,'chave privada'],[/(?:password|senha|apiKey|api_key|ESP32_TOKEN)\s*[:=]\s*['"][^'"\n]{8,}['"]/i,'segredo literal (revisar)']];
let failures=0;
for(const file of [...new Set(files)]){
  if(!existsSync(file))continue;
  if(/(?:^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.example') || /(?:^|\/)secrets\.h$/.test(file)){console.error(`${file}: arquivo sensível rastreado`);failures++;continue;}
  if(!/\.(js|cpp|h|json|ya?ml|md|ini|sql)$/.test(file)||file==='scripts/check-secrets.js'||file==='package-lock.json')continue;
  const content=readFileSync(file,'utf8');
  content.split('\n').forEach((line,index)=>{
    for(const [pattern,label] of rules)if(pattern.test(line) && !line.includes('CONFIGURE_LOCALMENTE')){console.error(`${file}:${index+1}: ${label}`);failures++;}
  });
}
if(failures)process.exitCode=1;else console.log('Verificação básica da árvore atual: OK. Não audita histórico nem garante ausência de segredos.');
