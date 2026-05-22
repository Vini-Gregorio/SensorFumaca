import express from 'express';
import { autenticar } from '../../auth.js';
import * as alertaModel from '../../model/alertaModel.js';
import sensorModel from '../../model/sensor.js';

const router = express.Router();

/**
 * API WEB - Endpoints para o Frontend Web
 * Retorna JSON com respostas formatadas
 * Autenticação: session
 */

// GET /api/web/sensores - Lista sensores com última leitura
router.get('/sensores', autenticar, async (req, res) => {
  const usuarioId = req.session.usuario.id;

  try {
    const sensores = await alertaModel.listarComUltimaLeitura(usuarioId);
    res.json({
      sucesso: true,
      dados: sensores
    });
  } catch (err) {
    console.error("ERRO ao buscar sensores (web):", err);
    res.status(500).json({ 
      sucesso: false,
      erro: 'Erro ao buscar sensores' 
    });
  }
});

// GET /api/web/sensores/:id - Detalhe sensor com histórico
router.get('/sensores/:id', autenticar, async (req, res) => {
  const sensorId = req.params.id;
  const usuarioId = req.session.usuario.id;

  try {
    const sensor = await sensorModel.buscarPorIdentificador(sensorId);

    if (!sensor || sensor.usuario_id !== usuarioId) {
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
      dados: sensor,
      historico: alertas
    });

  } catch (err) {
    console.error("ERRO ao buscar sensor (web):", err);
    res.status(500).json({ 
      sucesso: false,
      erro: 'Erro ao buscar detalhes do sensor' 
    });
  }
});

// GET /api/web/alertas - Lista alertas
router.get('/alertas', autenticar, async (req, res) => {
  const usuarioId = req.session.usuario.id;
  const { sensorId } = req.query;

  try {
    if (sensorId) {
      const sensor = await sensorModel.buscarPorIdentificador(sensorId);
      if (!sensor || sensor.usuario_id !== usuarioId) {
        return res.status(403).json({ sucesso: false, erro: 'Acesso negado' });
      }
    }

    const alertas = sensorId
      ? await alertaModel.listarPorSensor(sensorId)
      : await alertaModel.listarPorUsuario(usuarioId);
    
    res.json({
      sucesso: true,
      dados: alertas
    });
  } catch (err) {
    console.error("ERRO ao buscar alertas (web):", err);
    res.status(500).json({ 
      sucesso: false,
      erro: 'Erro ao buscar alertas' 
    });
  }
});

export default router;
