import path from 'path';
import 'dotenv/config'; 

import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import axios from 'axios';

import usuarioRouter from './routes/usuarioRoutes.js';
import sensorRouter from './routes/sensorRoutes.js';
import alertaRouter from './routes/alertaRoutes.js';

import userController from './controller/usuarioController.js';
import sensorModel from './model/sensor.js';
import * as alertaModel from './model/alertaModel.js';

import { autenticar } from './auth.js';
import { fileURLToPath } from 'url';
import sensor from './model/sensor.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
console.log("TELEGRAM_BOT_TOKEN:", !!process.env.TELEGRAM_BOT_TOKEN);
console.log("TELEGRAM_CHAT_ID:", process.env.TELEGRAM_CHAT_ID);


const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());  

app.use(express.static(path.join(__dirname, '..', 'views')));

app.use(session({
    secret: 'chavemuitoSecreta', 
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,           
        maxAge: 1000 * 60 * 60 * 24 //24 horas
    }
}));
//teste 
app.get("/debug", (req, res) => {
    res.json(req.session);
});


//teste 
app.get("/debug", (req, res) => {
    res.json(req.session);
});

app.get('/', (req, res) => {
    res.redirect('/inicio');
});

app.get('/cadastro', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'cadastro.html'));
});

app.get('/entrar', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'entrar.html'));
});

app.get('/sensores', autenticar, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'sensores.html'));
});

// Lista alertas do usuário ou de um sensor específico
app.get('/api/sensores', autenticar, async (req, res) => {
  const usuarioId = req.session.usuario.id;

  try {
    const sensores = await alertaModel.listarComUltimaLeitura(usuarioId);
    res.json(sensores);
  } catch (err) {
    console.error("ERRO EM /api/sensores:", err);
    res.status(500).json({ erro: 'Erro ao buscar sensores' });
  }
});


app.get('/cadastrarSensores', autenticar, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'cadastrarSensores.html'));
});

app.get('/dashboards', autenticar, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'dashboards.html'));
});

app.get('/inicio', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'inicio.html'));
});

app.post('/entrar', userController.login);
app.use('/usuarios', usuarioRouter);
app.use('/sensores', sensorRouter);

app.get('/api/sensores', async (req, res) => {
  const usuarioId = req.query.idUsuario || req.session?.usuario?.id;

   if (!usuarioId) {
      return res.status(401).json({ erro: 'Usuário não identificado' });
  }

  try {
    const sensores = await alertaModel.listarComUltimaLeitura(usuarioId);
    res.json(sensores);
  } catch (err) {
    console.error("ERRO EM /api/sensores:", err);
    res.status(500).json({ erro: 'Erro ao buscar sensores' });
  }
});

// --- ROTA PARA BUSCAR UM ÚNICO SENSOR (COM ÚLTIMA LEITURA) ---
app.get('/api/sensores/:id', async (req, res) => {
  const sensorId = req.params.id;

  try {
    // 1. Busca os dados básicos do sensor
    const sensor = await sensorModel.buscarPorIdentificador(sensorId);

    if (!sensor) {
      return res.status(404).json({ erro: 'Sensor não encontrado' });
    }

    // 2. VAI BUSCAR OS ALERTAS/LEITURAS DESSE SENSOR
    // Usa a função que você já importou: alertaModel
    // Supondo que sensor.identificador seja a chave que liga com a tabela de alertas
    const alertas = await alertaModel.listarPorSensor(sensor.identificador); 
    
    // 3. Se tiver alertas, pega o mais recente e adiciona ao objeto sensor
    if (alertas && alertas.length > 0) {
        const ultimo = alertas[0]; // Assume que a lista vem ordenada por data DESC (do mais novo pro mais antigo)
        
        // Adiciona os campos que o Android espera (conforme configuramos no Sensor.kt)
        sensor.valor = ultimo.valor;         // Android lê como 'leitura_atual'
        sensor.nivel = ultimo.nivel;         // Android lê como 'status'
        sensor.data_hora = ultimo.data_hora; // Android lê como 'data_hora'
    } else {
        // Se não tiver leitura, define valores padrão
        sensor.valor = 0;
        sensor.nivel = "Sem dados";
        sensor.data_hora = null;
    }

    // 4. Agora sim, envia o sensor COMPLETO com a leitura
    res.json(sensor);

  } catch (err) {
    console.error("ERRO EM /api/sensores/:id", err);
    res.status(500).json({ erro: 'Erro ao buscar detalhes do sensor' });
  }
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao fazer logout' });
        }
        res.redirect('/entrar');
    });
});
app.post('/cadastro', userController.register);

// Lista alertas do usuário ou de um sensor específico
app.get('/api/alertas', autenticar, async (req, res) => {
  const usuarioId = req.session.userId || (req.session.usuario && req.session.usuario.id);  const { sensorId } = req.query;
  try {
    const alertas = sensorId
      ? await alertaModel.listarPorSensor(sensorId)
      : await alertaModel.listarPorUsuario(usuarioId);
    res.json(alertas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar alertas' });
  }
});

app.use("/alertas", alertaRouter);

// Recebe dados do ESP32 via POST

app.post("/dados", (req, res) => {

  // TOKEN DO ESP32
  const token = req.headers["x-api-key"];

  if (token !== process.env.ESP32_TOKEN) {
    console.log("❌ Token inválido:", token);
    return res.status(401).json({ erro: "Token inválido" });
  }
    
  // 🔥 logs
  console.log('>>>> /dados RECEBIDO - start', new Date().toISOString());
  console.log('Headers:', req.headers);
  console.log('Body present? ', req.body && Object.keys(req.body).length > 0);

  try {
    const { sensor, valor, nivel } = req.body;
    console.log("📡 Dados recebidos:", sensor, valor, nivel);
    if (Number(valor) < 50) {
      console.log("Leitura normal, alerta não salvo.");
      return res.status(200).json({
        mensagem: "Leitura normal"
      });
    }

    // Processamento em background (não trava o ESP/Postman)
    (async () => {
      try {
        await alertaModel.addAlerta(sensor, valor, nivel);
        console.log("addAlerta finalizado em background");
      } catch (err) {
        console.error("Erro no addAlerta (background):", err);
      }
    })();

    // Resposta imediata
    return res.status(200).json({ mensagem: "Recebido" });

  } catch (err) {
    console.error("Erro inicial no /dados:", err);
    return res.status(500).json({ erro: "Erro interno" });
  }
});


const PORT = process.env.PORT || 3001;

// Só sobe o servidor na porta se NÃO estiver rodando testes
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
}

// Exporta o app para o Supertest conseguir usá-lo
export default app;