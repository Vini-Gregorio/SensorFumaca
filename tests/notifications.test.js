import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverOne } from '../backend/notifications.js';
test('Telegram desligado não faz chamadas externas',async()=>{
  assert.equal(await deliverOne({claimNotification:()=>{throw new Error('não deve chamar');}},{telegramEnabled:false}),false);
});
test('Telegram registra sucesso, erro transitório e permanente sem propagar token',async()=>{
  for(const status of [200,403,429,500]){
    let result;
    const repo={claimNotification:async()=>({id:1,attempts:1,telegram_chat_id:'123',message:'Ensaio'}),finishNotification:async(...args)=>{result=args;}};
    await deliverOne(repo,{telegramEnabled:true,telegramToken:'test-only'},async()=>({ok:status===200,status,json:async()=>({ok:status===200})}));
    assert.deepEqual(result,[1,1,status===200,status===403]);
  }
});
test('sem destinatário, falha explícita e sem requisição',async()=>{
  let result;await deliverOne({claimNotification:async()=>({id:1,attempts:1}),finishNotification:async(...args)=>{result=args;}},{telegramEnabled:true},()=>{throw new Error('não deve chamar');});
  assert.deepEqual(result,[1,1,false,true]);
});
