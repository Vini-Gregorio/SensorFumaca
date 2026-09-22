#include <cassert>
#include <cstring>
#include <iostream>
#include "alarm.h"
#include "delivery_queue.h"
int main(){
  Alarm a;
  assert(a.update(800,0,false)==AlarmState::Warmup);
  assert(a.update(700,0,true)==AlarmState::Pending);
  assert(a.update(700,4999,true)==AlarmState::Pending);
  assert(a.update(700,5000,true)==AlarmState::Alarm);
  assert(a.active);
  assert(a.update(600,5100,true)==AlarmState::Alarm);
  assert(a.update(580,5200,true)==AlarmState::Normal);
  a.update(701,6000,true);a.update(699,6100,true);
  assert(a.update(701,11000,true)==AlarmState::Pending);
  assert(a.update(701,16000,true)==AlarmState::Alarm);
  a.configure({900,400,1000});assert(a.active);assert(a.update(600,17000,true)==AlarmState::Alarm);
  assert(a.update(-1,18000,true)==AlarmState::Fault);assert(a.active);
  Alarm wrap;wrap.configure({700,580,1000});wrap.update(800,UINT32_MAX-499,true);
  assert(wrap.update(800,500,true)==AlarmState::Alarm);
  assert(!validConfig({500,500,1000}));assert(!validConfig({4096,0,1000}));
  DebouncedButton b;assert(!b.update(true,0));assert(!b.update(false,10));assert(!b.update(true,20));assert(b.update(true,70));assert(!b.update(true,100));
  assert(std::strcmp(stateName(AlarmState::Pending),"PENDING")==0);
  DeliveryQueue<int,2> queue;
  queue.enqueue(10,false);queue.enqueue(11,false);
  assert(queue.coalesced()==1);
  queue.enqueue(20,true);queue.enqueue(21,true);
  assert(queue.coalesced()==2);assert(!queue.enqueue(22,true));assert(queue.dropped()==1);
  queue.enqueue(30,false);assert(queue.depth()==3);
  int out=0;assert(queue.popCritical(out)&&out==20);assert(queue.popCritical(out)&&out==21);
  assert(!queue.popCritical(out));assert(queue.popLatest(out)&&out==30);
  assert(!queue.popLatest(out));queue.discard();assert(queue.dropped()==2);
  Alarm second;assert(!second.active);assert(a.active); // canais não compartilham estado
  std::cout<<"Firmware: histerese, confirmação, falha, configuração, debounce e rollover OK\n";
  std::cout<<"Fila: prioridade, FIFO, coalescência, saturação e perdas OK\n";
}
