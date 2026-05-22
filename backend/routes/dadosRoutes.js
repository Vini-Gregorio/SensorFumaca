import express from 'express';
import * as alertaModel from '../model/alertaModel.js';

const router = express.Router();

// Recebe dados do ESP32 via POST
router.post('/', (req, res) => {
  // TOKEN DO ESP32
  const token = req.headers["x-api-key"];

  if (token !== process.env.ESP32_TOKEN) {
    console.log("❌ Token inválido:", token);
    return res.status(401).json({ erro: "Token inválido" });
  }
    
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
    console.error("Erro em /dados:", err);
    return res.status(500).json({ erro: "Erro interno" });
  }
});

export default router;
