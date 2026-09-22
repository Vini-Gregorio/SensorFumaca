-- Evolução aditiva: preservar dados V2 já existentes. Aplicar com API parada.
CREATE TABLE config_revisions (
  device_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version INT NOT NULL,
  snapshot JSON NOT NULL,
  reason VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (device_id, version),
  FOREIGN KEY (device_id) REFERENCES devices(id)
) ENGINE=InnoDB;
INSERT INTO config_revisions (device_id,version,snapshot,reason)
SELECT d.id,d.config_version,
  JSON_OBJECT('version',d.config_version,'sensors',
    (SELECT JSON_ARRAYAGG(JSON_OBJECT('channel',s.channel,'kind',s.kind,'unit',s.unit,
      'high',s.high_threshold,'low',s.low_threshold,'confirmMs',s.confirm_ms))
     FROM sensors s WHERE s.device_id=d.id)),
  'baseline_migration'
FROM devices d;
CREATE TABLE audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  device_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
  action VARCHAR(50) NOT NULL,
  details JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (device_id) REFERENCES devices(id),
  INDEX owner_history (user_id,id)
) ENGINE=InnoDB;
ALTER TABLE events ADD COLUMN diagnostics JSON NULL;
ALTER TABLE devices ADD COLUMN last_contact_at DATETIME(3) NULL;
ALTER TABLE notification_outbox
  ADD COLUMN lease_token CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN error_code VARCHAR(40) NULL,
  ADD COLUMN retry_count INT NOT NULL DEFAULT 0;
CREATE INDEX evidence_window ON events (device_id,observed_at,id);
