import express from 'express';
import * as alertaModel from '../../model/alertaModel.js';

const router = express.Router();

/**
 * API ESP32 - Endpoint para receber dados do dispositivo IoT
 * Autenticação: Token via header x-api-key
 * Método: POST (recebe dados de sensores)
 */

router.post('/', (req, res) => {
  const token = req.headers["x-api-key"];

  // Validação de token
  if (token !== process.env.ESP32_TOKEN) {
    console.log("❌ [ESP32] Token inválido:", token);
    return res.status(401).json({ 
      sucesso: false,
      erro: "Token inválido" 
    });
  }
    
  console.log('✅ [ESP32] Dados recebidos em', new Date().toISOString());
  console.log('Headers:', req.headers);
  console.log('Body presente?', req.body && Object.keys(req.body).length > 0);

  try {
    const { sensor, valor, nivel } = req.body;
    console.log("📡 [ESP32] Sensor:", sensor, "Valor:", valor, "Nível:", nivel);
    
    // Ignora leituras normais (valor < 50)
    if (Number(valor) < 50) {
      console.log("✔ [ESP32] Leitura normal, nenhum alerta gerado");
      return res.status(200).json({
        sucesso: true,
        mensagem: "Leitura normal, nenhum alerta"
      });
    }

    // Processa alerta em background (não bloqueia resposta)
    (async () => {
      try {
        await alertaModel.addAlerta(sensor, valor, nivel);
        console.log("✅ [ESP32] Alerta salvo com sucesso");
      } catch (err) {
        console.error("❌ [ESP32] Erro ao salvar alerta:", err);
      }
    })();

    // Resposta imediata
    return res.status(200).json({ 
      sucesso: true,
      mensagem: "Dados recebidos e processando" 
    });

  } catch (err) {
    console.error("❌ [ESP32] Erro ao processar requisição:", err);
    return res.status(500).json({ 
      sucesso: false,
      erro: "Erro interno do servidor" 
    });
  }
});

export default router;
