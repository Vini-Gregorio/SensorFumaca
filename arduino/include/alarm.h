#pragma once
#include <stdint.h>

// Núcleo sem Arduino: testável em computador. A nuvem nunca decide a saída física.
enum class AlarmState { Warmup, Normal, Pending, Alarm, Fault };
struct AlarmConfig {
  int high; int low; uint32_t confirmMs;
  // Construtor explícito para o padrão C++11 do Arduino ESP32 2.x.
  constexpr AlarmConfig(int highValue=700,int lowValue=580,uint32_t duration=5000)
    : high(highValue),low(lowValue),confirmMs(duration) {}
};
inline bool validConfig(const AlarmConfig& c) {
  return c.low>=0 && c.low<c.high && c.high<=4095 && c.confirmMs>=100 && c.confirmMs<=60000;
}
inline const char* stateName(AlarmState s) {
  switch(s) { case AlarmState::Warmup:return "WARMUP"; case AlarmState::Normal:return "NORMAL";
    case AlarmState::Pending:return "PENDING"; case AlarmState::Alarm:return "ALARM"; default:return "FAULT"; }
}
class Alarm {
 public:
  AlarmState state=AlarmState::Warmup;
  bool active=false;
  AlarmConfig config;
  void configure(const AlarmConfig& c) {
    if(validConfig(c)) { config=c; confirming=false; } // não silencia alarme já ativo
  }
  AlarmState update(int value,uint32_t now,bool warmed) {
    if(value<0 || value>4095) { state=AlarmState::Fault; confirming=false; return state; }
    if(!warmed && !active) {state=AlarmState::Warmup;confirming=false;return state;}
    if(active) {
      if(value<=config.low){active=false;confirming=false;state=AlarmState::Normal;}
      else state=AlarmState::Alarm;
      return state;
    }
    if(value>=config.high) {
      if(!confirming){confirming=true;since=now;}
      if(uint32_t(now-since)>=config.confirmMs){active=true;state=AlarmState::Alarm;}
      else state=AlarmState::Pending;
    } else {confirming=false;state=AlarmState::Normal;}
    return state;
  }
 private:
  bool confirming=false;
  uint32_t since=0;
};
class DebouncedButton {
 public:
  bool update(bool pressed,uint32_t now) {
    if(pressed!=raw){raw=pressed;changed=now;}
    if(raw!=stable && uint32_t(now-changed)>=50){stable=raw;return stable;}
    return false;
  }
 private:
  bool raw=false,stable=false;
  uint32_t changed=0;
};
