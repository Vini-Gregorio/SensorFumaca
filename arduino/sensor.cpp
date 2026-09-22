#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <esp_task_wdt.h>
#include <esp_system.h>
#include <esp_timer.h>
#include <time.h>
#include "alarm.h"
#include "delivery_queue.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
// Permite compilar CI sem credenciais. Não conecta sem configuração local.
#include "secrets.example.h"
#endif

// MQ-2: use ADC1 (Wi-Fi conflita com ADC2 no ESP32 clássico).
// Ao adicionar canais no painel, replique seus IDs e pinos aqui. Nunca conecte 5 V ao ADC.
struct Channel {const char* id; uint8_t pin;};
static constexpr Channel CHANNELS[]={{"mq2",34}};
static constexpr size_t COUNT=sizeof(CHANNELS)/sizeof(CHANNELS[0]);
static_assert(COUNT<=8,"Máximo de oito canais");
static constexpr uint8_t RELAY_PIN=21,LED_PIN=4,BUTTON_PIN=23;
static constexpr bool RELAY_ACTIVE_HIGH=true; // conferir polaridade com carga de baixa tensão
static constexpr uint32_t SAMPLE_MS=100,REPORT_MS=5000;
static constexpr char FIRMWARE_VERSION[]="2.1.0-tg";
// Espera inicial de demonstração: NÃO substitui condicionamento/calibração do fabricante.
static constexpr uint32_t WARMUP_MS=60000;
struct Sample {
  uint64_t capturedMs; // idade sem rollover após ~49 dias de uptime
  uint32_t sequence,uptime,version,dropped;
  bool manual;
  int values[COUNT];
  AlarmState states[COUNT];
  int rssi;
  uint32_t freeHeap,queueDepth,coalesced,resetReason;
};
Alarm alarms[COUNT];
AlarmConfig sharedConfig[COUNT];
uint32_t sharedVersion=1;
portMUX_TYPE configMux=portMUX_INITIALIZER_UNLOCKED;
DeliveryQueue<Sample,32> delivery;
portMUX_TYPE queueMux=portMUX_INITIALIZER_UNLOCKED;
Preferences preferences;
char bootId[17];
bool manualAlarm=false;
uint32_t sequence=0,appliedVersion=1;
DebouncedButton button;

bool applyConfig(const String& json,bool persist) {
  StaticJsonDocument<4096> doc;
  if(deserializeJson(doc,json))return false;
  if(!doc["version"].is<uint32_t>())return false;
  const uint32_t version=doc["version"];
  JsonArray sensors=doc["sensors"].as<JsonArray>();
  if(version<1 || version>2147483647UL || sensors.size()!=COUNT)return false;
  AlarmConfig next[COUNT];
  for(size_t i=0;i<COUNT;i++) {
    bool found=false;
    for(JsonObject s:sensors) {
      if(strcmp(s["channel"] | "",CHANNELS[i].id)!=0)continue;
      if(found || strcmp(s["unit"] | "","adc_raw")!=0 || strcmp(s["kind"] | "","MQ2")!=0)return false;
      if(!s["high"].is<int>() || !s["low"].is<int>() || !s["confirmMs"].is<uint32_t>())return false;
      next[i]={s["high"].as<int>(),s["low"].as<int>(),s["confirmMs"].as<uint32_t>()};
      if(!validConfig(next[i]))return false;
      found=true;
    }
    if(!found)return false;
  }
  portENTER_CRITICAL(&configMux);
  const uint32_t current=sharedVersion;
  portEXIT_CRITICAL(&configMux);
  if(version<current)return false;
  // Só grava quando o conteúdo mudar, reduzindo desgaste da flash.
  if(persist && preferences.getString("config","")!=json && preferences.putString("config",json)==0)return false;
  portENTER_CRITICAL(&configMux);
  for(size_t i=0;i<COUNT;i++)sharedConfig[i]=next[i];
  sharedVersion=version;
  portEXIT_CRITICAL(&configMux);
  return true;
}

int request(const char* path,const String* payload,String& response) {
  const String base=API_BASE_URL;
  WiFiClient plain;
  WiFiClientSecure secure;
  HTTPClient http;
  if(base.startsWith("https://")) {
    if(strlen(TLS_ROOT_CA)==0 || time(nullptr)<1704067200)return -1;
    secure.setCACert(TLS_ROOT_CA);
    if(!http.begin(secure,base+path))return -1;
  } else if(ALLOW_INSECURE_LAB_HTTP && base.startsWith("http://")) {
    if(!http.begin(plain,base+path))return -1;
  } else return -1;
  http.setConnectTimeout(5000);http.setTimeout(5000);http.setReuse(false);
  http.addHeader("Content-Type","application/json");
  http.addHeader("x-device-id",DEVICE_ID);http.addHeader("x-api-key",DEVICE_API_KEY);
  const int code=payload?http.POST(*payload):http.GET();
  // Servidor de confiança, mas limitar respostas antes de parsear.
  if(code>0 && http.getSize()>=0 && http.getSize()<=4096)response=http.getString();
  http.end();return code;
}

// Rede em outra tarefa/core: HTTP, DNS e Telegram nunca bloqueiam leitura/relé.
void networkTask(void*) {
  WiFi.mode(WIFI_STA);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
  configTime(0,0,"pool.ntp.org","time.google.com");
  uint32_t reconnect=0,lastConfig=0;
  bool pending=false,pendingCritical=false;Sample sample{};
  for(;;) {
    const uint32_t now=millis();
    if(WiFi.status()!=WL_CONNECTED) {
      if(uint32_t(now-reconnect)>=10000){WiFi.reconnect();reconnect=now;}
      vTaskDelay(pdMS_TO_TICKS(250));continue;
    }
    if(lastConfig==0 || uint32_t(now-lastConfig)>=30000) {
      String response;
      if(request("/api/v1/device/config",nullptr,response)==200 && response.length()) {
        if(!applyConfig(response,true))Serial.println("Config recusada: confira canais/pinos/limites.");
      }
      lastConfig=now;
    }
    bool selected=false;
    portENTER_CRITICAL(&queueMux);
    if(!pending || !pendingCritical) {
      Sample next{};
      if(delivery.popCritical(next)) {
        if(pending)delivery.supersede();
        sample=next;pending=true;pendingCritical=true;selected=true;
      }
    }
    if(!pending && delivery.popLatest(sample)){pending=true;pendingCritical=false;selected=true;}
    if(selected){
      sample.queueDepth=delivery.depth()+1;
      sample.dropped=delivery.dropped();sample.coalesced=delivery.coalesced();
    }
    portEXIT_CRITICAL(&queueMux);
    if(!pending){vTaskDelay(pdMS_TO_TICKS(100));continue;}
    // Diagnóstico fica congelado no primeiro envio: retries não alteram o hash do evento.
    if(selected){sample.rssi=WiFi.RSSI();sample.freeHeap=ESP.getFreeHeap();sample.resetReason=esp_reset_reason();}
    const uint64_t age64=static_cast<uint64_t>(esp_timer_get_time()/1000)-sample.capturedMs;
    if(age64>86400000ULL){
      portENTER_CRITICAL(&queueMux);delivery.discard();portEXIT_CRITICAL(&queueMux);
      pending=false;Serial.println("Amostra expirada (>24 h), descartada.");continue;
    }
    const uint32_t age=static_cast<uint32_t>(age64);
    StaticJsonDocument<4096> doc;
    doc["deviceId"]=DEVICE_ID;doc["bootId"]=bootId;doc["sequence"]=sample.sequence;
    doc["uptimeMs"]=sample.uptime;doc["ageMs"]=age;doc["configVersion"]=sample.version;
    doc["droppedSamples"]=sample.dropped;doc["manualAlarm"]=sample.manual;
    JsonObject diagnostics=doc.createNestedObject("diagnostics");
    diagnostics["firmware"]=FIRMWARE_VERSION;diagnostics["rssi"]=sample.rssi;
    diagnostics["freeHeap"]=sample.freeHeap;diagnostics["queueDepth"]=sample.queueDepth;
    diagnostics["coalescedSamples"]=sample.coalesced;diagnostics["resetReason"]=sample.resetReason;
    JsonArray readings=doc.createNestedArray("readings");
    for(size_t i=0;i<COUNT;i++){JsonObject r=readings.createNestedObject();r["channel"]=CHANNELS[i].id;r["value"]=sample.values[i];r["state"]=stateName(sample.states[i]);}
    String payload,response;serializeJson(doc,payload);
    const int code=request("/api/v1/telemetry",&payload,response);
    if(code==200 || code==201) {
      StaticJsonDocument<256> ack;
      if(!deserializeJson(ack,response) && ack["eventId"].is<uint64_t>() && ack["duplicate"].is<bool>())pending=false;
    } else if(code==400 || code==409 || code==422) {
      portENTER_CRITICAL(&queueMux);delivery.discard();portEXIT_CRITICAL(&queueMux);
      pending=false;Serial.printf("Amostra recusada: HTTP %d. Confira contrato/config.\n",code);
    }
    // 401/403/429/5xx: manter amostra, sem imprimir chave, URL ou corpo.
    vTaskDelay(pdMS_TO_TICKS(pending?5000:50));
  }
}

void setup() {
  Serial.begin(115200);
  digitalWrite(RELAY_PIN,RELAY_ACTIVE_HIGH?LOW:HIGH);pinMode(RELAY_PIN,OUTPUT);
  pinMode(LED_PIN,OUTPUT);pinMode(BUTTON_PIN,INPUT_PULLUP);
  analogReadResolution(12);
  for(const auto& c:CHANNELS){pinMode(c.pin,INPUT);analogSetPinAttenuation(c.pin,ADC_11db);}
  snprintf(bootId,sizeof(bootId),"%08lx%08lx",static_cast<unsigned long>(esp_random()),static_cast<unsigned long>(esp_random()));
  preferences.begin("mqfire",false);applyConfig(preferences.getString("config",""),false);
  portENTER_CRITICAL(&configMux);
  for(size_t i=0;i<COUNT;i++){alarms[i].configure(sharedConfig[i]);}
  appliedVersion=sharedVersion;
  portEXIT_CRITICAL(&configMux);
  esp_task_wdt_init(10,true);esp_task_wdt_add(nullptr);
  if(xTaskCreatePinnedToCore(networkTask,"mqfire-net",12288,nullptr,1,nullptr,0)!=pdPASS)Serial.println("Rede indisponível: alarme local permanece ativo.");
}

void loop() {
  esp_task_wdt_reset();
  const uint32_t now=millis();
  if(button.update(digitalRead(BUTTON_PIN)==LOW,now))manualAlarm=!manualAlarm;
  static uint32_t lastSample=0,lastReport=0;
  static bool previousManual=false,warmed=false;
  // Latch: após rollover de millis() não voltar ao aquecimento inicial.
  if(now>=WARMUP_MS)warmed=true;
  if(uint32_t(now-lastSample)<SAMPLE_MS){delay(1);return;}lastSample=now;
  AlarmConfig next[COUNT];uint32_t version;
  portENTER_CRITICAL(&configMux);
  version=sharedVersion;for(size_t i=0;i<COUNT;i++)next[i]=sharedConfig[i];
  portEXIT_CRITICAL(&configMux);
  if(version!=appliedVersion){for(size_t i=0;i<COUNT;i++)alarms[i].configure(next[i]);appliedVersion=version;}
  Sample sample{};sample.capturedMs=static_cast<uint64_t>(esp_timer_get_time()/1000);sample.uptime=now;sample.version=appliedVersion;sample.manual=manualAlarm;
  bool output=manualAlarm,changed=manualAlarm!=previousManual;previousManual=manualAlarm;
  for(size_t i=0;i<COUNT;i++) {
    const AlarmState before=alarms[i].state;
    sample.values[i]=analogRead(CHANNELS[i].pin);
    sample.states[i]=alarms[i].update(sample.values[i],now,warmed);
    changed=changed || before!=sample.states[i];output=output || alarms[i].active;
  }
  // Atualizar saída ANTES de qualquer tentativa de enfileirar telemetria.
  digitalWrite(RELAY_PIN,(output==RELAY_ACTIVE_HIGH)?HIGH:LOW);
  digitalWrite(LED_PIN,output?HIGH:LOW);
  if(changed || uint32_t(now-lastReport)>=REPORT_MS) {
    sample.sequence=sequence++;lastReport=now;
    portENTER_CRITICAL(&queueMux);
    delivery.enqueue(sample,changed);
    portEXIT_CRITICAL(&queueMux);
  }
  delay(1);
}
