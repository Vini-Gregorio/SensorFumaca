import test from 'node:test';
import assert from 'node:assert/strict';
import { telemetry,sensorConfig,dashboardStatus,credentials,hash,equalHash,token } from '../backend/domain.js';
import { loadConfig } from '../backend/config.js';
const packet=()=>({deviceId:'lab',bootId:'0123456789abcdef',sequence:0,uptimeMs:10,ageMs:0,configVersion:1,droppedSamples:0,manualAlarm:false,readings:[{channel:'mq2',value:700,state:'PENDING'}]});
test('contrato canônico, sem idade nem campos extras no hash de idempotência',()=>{
  const p=packet();assert.deepEqual(telemetry({...p,extra:'ignored',ageMs:10}),telemetry(p));
});
test('rejeita tipos, NaN, ADC fora da faixa, canal duplicado e unidade disfarçada',()=>{
  for(const value of [-1,4096,'700',NaN,null])assert.throws(()=>telemetry({...packet(),readings:[{channel:'mq2',value,state:'ALARM'}]}));
  assert.throws(()=>telemetry({...packet(),manualAlarm:'false'}));
  assert.throws(()=>telemetry({...packet(),readings:[...packet().readings,...packet().readings]}));
  assert.throws(()=>telemetry({...packet(),readings:[{channel:'mq2',value:700,state:'vermelho'}]}));
  assert.throws(()=>telemetry({...packet(),ageMs:-1}));
  assert.throws(()=>telemetry({...packet(),bootId:'x'}));
});
test('limites: histerese obrigatória e confirmação limitada',()=>{
  assert.deepEqual(sensorConfig({high:700,low:580,confirmMs:5000}),{high:700,low:580,confirmMs:5000});
  for(const c of [{high:700,low:700,confirmMs:5000},{high:4096,low:1,confirmMs:100},{high:700,low:0,confirmMs:0}])assert.throws(()=>sensorConfig(c));
});
test('dashboard não transforma offline, falta de dados ou config pendente em normal',()=>{
  const now=Date.now(),row={observed_at:new Date(now),state:'NORMAL',config_version:1,desired_version:1};
  assert.equal(dashboardStatus(row,now),'NORMAL');assert.equal(dashboardStatus({},now),'SEM_DADOS');
  assert.equal(dashboardStatus(row,now+90001),'OFFLINE');assert.equal(dashboardStatus({...row,desired_version:2},now),'CONFIG_PENDENTE');
  assert.equal(dashboardStatus({...row,manual_alarm:1,desired_version:2},now),'ALARME');
  assert.equal(dashboardStatus({...row,state:'WARMUP'},now),'AQUECENDO');
});
test('credenciais têm limite em bytes e chaves aleatórias são comparadas por hash',()=>{
  assert.throws(()=>credentials({email:'x@y.z',password:'short'}));
  assert.throws(()=>credentials({email:'x@y.z',password:'á'.repeat(40)}));
  const a=token(),b=token();assert.notEqual(a,b);assert(equalHash(hash(a),hash(a)));assert(!equalHash(hash(a),hash(b)));assert(!equalHash(undefined,undefined));
});
test('config falha fechada sem DB e HTTPS em produção',()=>{
  assert.throws(()=>loadConfig({}));
  const env={DB_NAME:'mqfire',DB_USER:'mqfire',DB_PASSWORD:token()};
  assert.throws(()=>loadConfig({...env,NODE_ENV:'production',APP_ORIGIN:'http://localhost:3001'}));
  assert.equal(loadConfig({...env,NODE_ENV:'production',APP_ORIGIN:'https://mqfire.example'}).allowRegistration,false);
});
