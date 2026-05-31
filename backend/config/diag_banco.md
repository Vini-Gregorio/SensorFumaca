erDiagram
    usuario ||--o{ sensores : "possui (1:N)"
    sensores ||--o{ alertas : "gera (1:N)"
    alertas ||--o{ telegram_failures : "registra falha (1:N)"

    usuario {
        int id PK
        varchar email UK "Único"
        varchar senha
        timestamp dataCadastro
        varchar telegram_chat_id
    }

    sensores {
        int id PK
        varchar identificador UK "Único"
        varchar nomeSala
        varchar tipo
        tinyint ativo
        timestamp criado_em
        int usuario_id FK "Refere a usuario.id"
    }

    alertas {
        int id PK
        int valor
        varchar nivel
        timestamp data_hora
        int sensor_id FK "Refere a sensores.id"
    }

    telegram_failures {
        int id PK
        varchar chat_id
        text payload
        text error_text
        timestamp created_at
        int alerta_id FK "Refere a alertas.id"
    }