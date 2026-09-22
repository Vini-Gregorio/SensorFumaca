-- Registro experimental separado dos estados declarados pelo firmware.
CREATE TABLE experiments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  objective VARCHAR(2000) NOT NULL,
  protocol VARCHAR(2000) NOT NULL,
  acceptance_criteria VARCHAR(2000) NOT NULL,
  environment VARCHAR(1000) NOT NULL,
  hardware VARCHAR(1000) NOT NULL,
  software_ref VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('planned','running','completed') NOT NULL DEFAULT 'planned',
  outcome ENUM('met','not_met','inconclusive') NULL,
  conclusion VARCHAR(2000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at DATETIME(3) NULL,
  ended_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX owner_experiments (user_id,id)
) ENGINE=InnoDB;
CREATE TABLE experiment_devices (
  experiment_id BIGINT UNSIGNED NOT NULL,
  device_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  configuration_at_start JSON NULL,
  PRIMARY KEY (experiment_id,device_id),
  FOREIGN KEY (experiment_id) REFERENCES experiments(id),
  FOREIGN KEY (device_id) REFERENCES devices(id)
) ENGINE=InnoDB;
CREATE TABLE experiment_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  experiment_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('observation','reference','network','hardware') NOT NULL,
  note VARCHAR(1000) NOT NULL,
  observed_at DATETIME(3) NOT NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (experiment_id) REFERENCES experiments(id),
  INDEX experiment_timeline (experiment_id,observed_at,id)
) ENGINE=InnoDB;
