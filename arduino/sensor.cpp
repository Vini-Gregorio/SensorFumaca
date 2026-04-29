#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "SEU_WIFI";
const char* password = "SENHA_WIFI";

const char* serverUrl = "http://SEU_IP:3001/dados";
const char* apiKey = "MQFIRE_2026_SENSOR_X9";

const int sensorPin = 34; // GPIO analógico do ESP32
const int ledVerde = 7;
const int ledVermelho = 8;

const int limiteFumaca = 300;

void setup() {
  pinMode(ledVerde, OUTPUT);
  pinMode(ledVermelho, OUTPUT);

  Serial.begin(115200);

  WiFi.begin(ssid, password);

  Serial.print("Conectando WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi conectado!");
}

void loop() {

  int valorSensor = analogRead(sensorPin);

  String nivel = "verde";

  if (valorSensor > limiteFumaca) {
    digitalWrite(ledVermelho, HIGH);
    digitalWrite(ledVerde, LOW);

    nivel = "vermelho";

  } else {
    digitalWrite(ledVermelho, LOW);
    digitalWrite(ledVerde, HIGH);
  }

  Serial.println(valorSensor);

  if (WiFi.status() == WL_CONNECTED) {

    HTTPClient http;

    http.begin(serverUrl);

    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", apiKey);

    String json = "{";
    json += "\"sensor\":\"MQ01\",";
    json += "\"valor\":" + String(valorSensor) + ",";
    json += "\"nivel\":\"" + nivel + "\"";
    json += "}";

    int responseCode = http.POST(json);

    Serial.print("Resposta servidor: ");
    Serial.println(responseCode);

    http.end();
  }

  delay(5000);
}
