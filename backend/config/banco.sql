-- 1. Criação da tabela USUARIO (mantida praticamente igual)
CREATE TABLE usuario (
  id int(20) unsigned NOT NULL AUTO_INCREMENT,
  email varchar(150) NOT NULL,
  senha varchar(255) NOT NULL,
  dataCadastro timestamp NOT NULL DEFAULT current_timestamp(),
  telegram_chat_id varchar(255) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY email_unico (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. Criação da tabela SENSORES (agora com Foreign Key para usuário)
CREATE TABLE sensores (
  id int(20) unsigned NOT NULL AUTO_INCREMENT,
  identificador varchar(100) NOT NULL,
  nomeSala varchar(255) DEFAULT NULL,
  tipo varchar(50) DEFAULT NULL,
  usuario_id int(20) unsigned DEFAULT NULL,
  ativo tinyint(1) DEFAULT 1,
  criado_em timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  UNIQUE KEY identificador_unico (identificador),
  CONSTRAINT fk_sensores_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. Criação da tabela ALERTAS (Otimizada: referenciando o ID do sensor em vez de string)
CREATE TABLE alertas (
  id int(20) unsigned NOT NULL AUTO_INCREMENT, -- Alterado para int para lidar com alto volume de IoT
  sensor_id int(20) unsigned NOT NULL,         -- Substitui o varchar(40)
  valor int(11) NOT NULL,
  nivel varchar(25) DEFAULT NULL,
  data_hora timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT fk_alertas_sensor FOREIGN KEY (sensor_id) REFERENCES sensores (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. Criação da tabela TELEGRAM_FAILURES (Chat ID padronizado e Foreign Key adicionada)
CREATE TABLE telegram_failures (
  id int(20) unsigned NOT NULL AUTO_INCREMENT,
  alerta_id int(20) unsigned DEFAULT NULL,
  chat_id varchar(255) DEFAULT NULL,              -- Padronizado com usuario.telegram_chat_id
  payload text DEFAULT NULL,
  error_text text DEFAULT NULL,
  created_at timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT fk_telegram_alerta FOREIGN KEY (alerta_id) REFERENCES alertas (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;