#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_task_wdt.h>

// =======================
// CONFIGURAÇÕES
// =======================
const char* ssid = "wifi";
const char* password = "senha";

const char* apiUrl = "mqfire.onrender.com:3001/api/esp32";
const char* apiKey = "MQFIRE_2026_SENSOR_X9";

// =======================
// PINOS
// =======================
#define MQ2_PIN 34
#define RELE_PIN 21
#define LED_STATUS 4
#define BOTAO_PIN 23

// =======================
// PARÂMETROS E DELTAS
// =======================
const int LIMIAR_LIGA = 700;
const int LIMIAR_DESLIGA = 580;
const int DELTA_MUDANCA = 100; // Diferença mínima para registrar/enviar nova leitura

const unsigned long TEMPO_CONFIRMACAO = 5000;
const unsigned long COOLDOWN = 3000;
const unsigned long DEBOUNCE = 250;
const unsigned long INTERVALO_RECONEXAO_WIFI = 10000; // 10 segundos

// =======================
// VARIÁVEIS DE CONTROLE
// =======================
const char* sensor = "MQ2";
unsigned long inicioAcimaLimiar = 0;
unsigned long ultimoAlerta = 0;
unsigned long ultimoClique = 0;
unsigned long ultimaTentativaWifi = 0;

int ultimaLeituraRegistrada = -1; // Inicia em -1 para forçar a primeira leitura

bool estadoAlerta = false;
bool sireneManual = false;
bool ultimoEstadoBotao = HIGH;

// =======================
// PROTÓTIPOS
// =======================
void verificarBotao();
void dispararAlerta(int valor);
void enviarLeitura(int valor, String nivel);
void gerenciarWiFi(unsigned long agora);

// =======================
// SETUP
// =======================
void setup() {
  Serial.begin(115200);

  pinMode(RELE_PIN, OUTPUT);
  pinMode(LED_STATUS, OUTPUT);
  pinMode(BOTAO_PIN, INPUT_PULLUP);

  digitalWrite(RELE_PIN, LOW);
  digitalWrite(LED_STATUS, HIGH);

  // Inicia conexão WiFi em background (sem travar)
  WiFi.begin(ssid, password);
  Serial.println("Iniciando sistema... Tentando conectar ao WiFi.");

  esp_task_wdt_init(10, true);
  esp_task_wdt_add(NULL);
}

// =======================
// LOOP
// =======================
void loop() {
  esp_task_wdt_reset();
  unsigned long agora = millis();

  // 1. Manter funções vitais rodando sem atrasos
  verificarBotao();
  gerenciarWiFi(agora);

  int leitura = analogRead(MQ2_PIN);
  String nivel = (leitura > LIMIAR_LIGA) ? "vermelho" : "verde";

  // 2. Lógica de Mudança Brusca (Delta)
  // Calcula o valor absoluto da diferença entre a leitura atual e a última registrada
  if (abs(leitura - ultimaLeituraRegistrada) >= DELTA_MUDANCA || ultimaLeituraRegistrada == -1) {
    Serial.print("Log [MUDANÇA BRUSCA] MQ2: ");
    Serial.println(leitura);

    enviarLeitura(leitura, nivel); // A função já verifica se há WiFi antes de enviar
    ultimaLeituraRegistrada = leitura;
  } else {
    // Para evitar poluir o log, não imprime nada se a leitura não mudou significativamente
    Serial.print("Log [SEM MUDANÇA] MQ2: ");

     Serial.println(leitura);
     delay(200);
  }

  // 3. Histerese + Confirmação (Funciona 100% offline)
  if (!estadoAlerta) {
    if (leitura > LIMIAR_LIGA) {
      if (inicioAcimaLimiar == 0) {
        inicioAcimaLimiar = agora; // Inicia o timer
        Serial.println("Log: Gás detectado. Iniciando timer de confirmação...");
      } else if (agora - inicioAcimaLimiar >= TEMPO_CONFIRMACAO) {
        estadoAlerta = true;
        Serial.println("Log: ALERTA CONFIRMADO! Sirene ativada.");
        
        if (agora - ultimoAlerta >= COOLDOWN) {
          dispararAlerta(leitura);
          ultimoAlerta = agora;
        }
      }
    } else {
      // Se abaixou antes de confirmar, reseta o timer
      if (inicioAcimaLimiar != 0) {
         Serial.println("Log: Gás dissipou antes do alerta. Timer resetado.");
         inicioAcimaLimiar = 0;
      }
    }
  }

  // Se já está em alerta, aguarda cair abaixo do limiar para desligar
  if (estadoAlerta && leitura < LIMIAR_DESLIGA) {
    estadoAlerta = false;
    inicioAcimaLimiar = 0;
    Serial.println("Log: Nível seguro restaurado. Sirene desativada.");
  }

  // 4. Acionamento Físico (Relé/Sirene)
  if (estadoAlerta || sireneManual) {
    digitalWrite(RELE_PIN, HIGH);
  } else {
    digitalWrite(RELE_PIN, LOW);
  }

  digitalWrite(LED_STATUS, HIGH);

  
  
  // O delay(500) foi removido. O loop agora roda o mais rápido possível.
  delay(200); // Apenas para evitar saturar o log, pode ser ajustado ou removido conforme necessário.
}

// =======================
// BOTÃO
// =======================
void verificarBotao() {
  bool estadoBotao = digitalRead(BOTAO_PIN);

  if (estadoBotao == LOW && ultimoEstadoBotao == HIGH) {
    if (millis() - ultimoClique > DEBOUNCE) {
      sireneManual = !sireneManual;
      Serial.print("Log: Sirene manual: ");
      Serial.println(sireneManual ? "ON" : "OFF");
      ultimoClique = millis();
    }
  }
  ultimoEstadoBotao = estadoBotao;
}

// =======================
// GERENCIADOR DE WIFI
// =======================
void gerenciarWiFi(unsigned long agora) {
  if (WiFi.status() != WL_CONNECTED) {
    // Tenta reconectar a cada 10 segundos, sem parar o programa (Offline mode)
    if (agora - ultimaTentativaWifi >= INTERVALO_RECONEXAO_WIFI) {
      Serial.println("Log: Sistema offline. Tentando reconectar ao WiFi...");
      WiFi.disconnect();
      WiFi.begin(ssid, password);
      ultimaTentativaWifi = agora;
    }
  }
}

// =======================
// ALERTA API
// =======================
void dispararAlerta(int valor) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Aviso: Alerta disparado fisicamente, mas sem internet para enviar à API.");
    return;
  }

  HTTPClient http;
  http.begin(apiUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", apiKey);

  String payload = "{\"device_id\":\"esp32_lab01\",\"sensor\":\"" + String(sensor) + "\",\"valor\":" + String(valor) + ",\"status\":\"ALERTA\"}";
  int responseCode = http.POST(payload);

  Serial.print("API reposta alerta: ");
  Serial.println(responseCode);
  http.end();
}

// =======================
// LEITURA NORMAL
// =======================
void enviarLeitura(int valor, String nivel) {
  if (WiFi.status() != WL_CONNECTED) {
    // Não avisa no log toda hora para não poluir, apenas retorna silenciosamente.
    return; 
  }

  HTTPClient http;
  http.begin(apiUrl);
  http.addHeader("Content-Type", "application/json");
  //http.addHeader("x-api-key", apiKey);

  String json = "{\"sensor\":\"" + String(sensor) + "\",\"valor\":" + String(valor) + ",\"nivel\":\"" + nivel + "\"}";
  int responseCode = http.POST(json);

  Serial.print("API resposta leitura: ");
  Serial.println(responseCode);
  http.end();
}