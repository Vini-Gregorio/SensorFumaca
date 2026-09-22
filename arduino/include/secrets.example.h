#pragma once
// Copie como secrets.h (ignorado pelo Git). Nunca publique o arquivo preenchido.
static constexpr char WIFI_SSID[] = "CONFIGURE_LOCALMENTE";
static constexpr char WIFI_PASSWORD[] = "CONFIGURE_LOCALMENTE";
static constexpr char API_BASE_URL[] = "https://seu-dominio.example";
static constexpr char DEVICE_ID[] = "esp32-lab01";
static constexpr char DEVICE_API_KEY[] = "CONFIGURE_LOCALMENTE";
// Cole a CA raiz PEM apropriada ao certificado do servidor, não o certificado efêmero.
static constexpr char TLS_ROOT_CA[] = "";
// Somente laboratório isolado: URL http://IP-DO-PC:3001 + true. HTTPS nunca usa setInsecure.
static constexpr bool ALLOW_INSECURE_LAB_HTTP = false;
