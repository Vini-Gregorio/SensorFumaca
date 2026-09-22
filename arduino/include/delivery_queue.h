#pragma once
#include <stddef.h>
#include <stdint.h>

// Sem alocação dinâmica. O chamador protege acesso concorrente com um mutex.
// Mudanças de estado têm FIFO própria; periódicas mantêm apenas a mais recente.
template <typename T,size_t Capacity> class DeliveryQueue {
 public:
  static_assert(Capacity>0 && Capacity<=64,"Capacidade inválida");
  bool enqueue(const T& sample,bool critical) {
    if(!critical) {
      if(hasLatest)supersede();
      latest=sample;hasLatest=true;return true;
    }
    if(count==Capacity){discard();return false;}
    if(hasLatest){hasLatest=false;supersede();}
    events[(head+count)%Capacity]=sample;count++;return true;
  }
  bool popCritical(T& output) {
    if(count==0)return false;
    output=events[head];head=(head+1)%Capacity;count--;return true;
  }
  bool popLatest(T& output) {
    if(!hasLatest)return false;
    output=latest;hasLatest=false;return true;
  }
  size_t depth() const {return count+(hasLatest?1:0);}
  uint32_t dropped() const {return droppedCount;}
  uint32_t coalesced() const {return coalescedCount;}
  void discard(){if(droppedCount<UINT32_MAX)droppedCount++;}
  void supersede(){if(coalescedCount<UINT32_MAX)coalescedCount++;}
 private:
  T events[Capacity]{};
  T latest{};
  size_t head=0,count=0;
  bool hasLatest=false;
  uint32_t droppedCount=0,coalescedCount=0;
};
