-- Esquema V2: use banco NOVO. Não modifica tabelas legadas.
CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  telegram_chat_id VARCHAR(32) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (expires_at)
) ENGINE=InnoDB;
CREATE TABLE devices (
  id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config_version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE sensors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  channel VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(80) NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'MQ2',
  unit VARCHAR(20) NOT NULL DEFAULT 'adc_raw',
  high_threshold INT NOT NULL DEFAULT 700,
  low_threshold INT NOT NULL DEFAULT 580,
  confirm_ms INT NOT NULL DEFAULT 5000,
  UNIQUE (device_id, channel),
  FOREIGN KEY (device_id) REFERENCES devices(id),
  CHECK (low_threshold >= 0 AND low_threshold < high_threshold AND high_threshold <= 4095),
  CHECK (confirm_ms BETWEEN 100 AND 60000)
) ENGINE=InnoDB;
CREATE TABLE events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  boot_id CHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sequence BIGINT UNSIGNED NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  config_version INT NOT NULL,
  uptime_ms BIGINT UNSIGNED NOT NULL,
  dropped_samples BIGINT UNSIGNED NOT NULL,
  manual_alarm BOOLEAN NOT NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  observed_at DATETIME(3) NOT NULL,
  UNIQUE (device_id, boot_id, sequence),
  FOREIGN KEY (device_id) REFERENCES devices(id)
) ENGINE=InnoDB;
CREATE TABLE readings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  sensor_id BIGINT UNSIGNED NOT NULL,
  value INT NOT NULL,
  state ENUM('NORMAL','PENDING','ALARM','WARMUP','FAULT') NOT NULL,
  observed_at DATETIME(3) NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (sensor_id) REFERENCES sensors(id),
  INDEX latest_reading (sensor_id, observed_at, id),
  CHECK (value BETWEEN 0 AND 4095)
) ENGINE=InnoDB;
CREATE TABLE notification_outbox (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  message VARCHAR(1000) NOT NULL,
  status ENUM('pending','sending','sent','failed','disabled') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  lease_until DATETIME(3) NULL,
  sent_at DATETIME(3) NULL,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX pending_delivery (status, available_at)
) ENGINE=InnoDB;
