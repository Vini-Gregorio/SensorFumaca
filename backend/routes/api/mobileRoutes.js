import express from 'express';
import { autenticar } from '../../auth.js';
import * as alertaModel from '../../model/alertaModel.js';
import sensorModel from '../../model/sensor.js';

const router = express.Router();

/**
 * API MÓVEL - Endpoints para o App Android/iOS
 * Retorna apenas JSON (sem HTML)
 * Autenticação: bearer token ou session
 */

// GET /api/mobile/sensores - Lista sensores do usuário autenticado
router.get('/sensores', autenticar, async (req, res) => {
  const usuarioId = req.session.usuario.id;

  try {
    const sensores = await alertaModel.listarComUltimaLeitura(usuarioId);
    res.json({
      sucesso: true,
      dados: sensores,
      total: sensores.length
    });
  } catch (err) {
    console.error("ERRO ao buscar sensores (mobile):", err);
    res.status(500).json({ 
      sucesso: false,
      erro: 'Erro ao buscar sensores' 
    });
  }
});

// GET /api/mobile/sensores/:id - Detalhe de um sensor
router.get('/sensores/:id', autenticar, async (req, res) => {
  const sensorId = req.params.id;
  const usuarioId = req.session.usuario.id;

  try {
    const sensor = await sensorModel.buscarPorIdentificador(sensorId);

    if (!sensor) {
      return res.status(404).json({ 
        sucesso: false,
        erro: 'Sensor não encontrado' 
      });
    }

    const alertas = await alertaModel.listarPorSensor(sensor.identificador); 
    
    if (alertas && alertas.length > 0) {
        const ultimo = alertas[0];
        sensor.valor = ultimo.valor;
        sensor.nivel = ultimo.nivel;
        sensor.data_hora = ultimo.data_hora;
    } else {
        sensor.valor = 0;
        sensor.nivel = "Sem dados";
        sensor.data_hora = null;
    }

    res.json({
      sucesso: true,
      dados: sensor
    });

  } catch (err) {
    console.error("ERRO ao buscar sensor (mobile):", err);
    res.status(500).json({ 
      sucesso: false,
      erro: 'Erro ao buscar detalhes do sensor' 
    });
  }
});

// GET /api/mobile/alertas - Lista alertas do usuário
router.get('/alertas', autenticar, async (req, res) => {
  const usuarioId = req.session.usuario.id;
  const { sensorId } = req.query;

  try {
    const alertas = sensorId
      ? await alertaModel.listarPorSensor(sensorId)
      : await alertaModel.listarPorUsuario(usuarioId);
    
    res.json({
      sucesso: true,
      dados: alertas,
      total: alertas.length
    });
  } catch (err) {
    console.error("ERRO ao buscar alertas (mobile):", err);
    res.status(500).json({ 
      sucesso: false,
      erro: 'Erro ao buscar alertas' 
    });
  }
});

export default router;
