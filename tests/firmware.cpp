#include <cassert>
#include <cstring>
#include <iostream>
#include "alarm.h"
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
  std::cout<<"Firmware: histerese, confirmação, falha, configuração, debounce e rollover OK\n";
}
