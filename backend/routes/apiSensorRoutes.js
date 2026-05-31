import express from 'express';
import { autenticar } from '../auth.js';
import * as alertaModel from '../model/alertaModel.js';
import sensorModel from '../model/sensor.js';

const router = express.Router();

// Lista sensores com última leitura
router.get('/', autenticar, async (req, res) => {
  const usuarioId = req.session.usuario.id;

  try {
    const sensores = await alertaModel.listarComUltimaLeitura(usuarioId);
    res.json(sensores);
  } catch (err) {
    console.error("ERRO ao buscar sensores:", err);
    res.status(500).json({ erro: 'Erro ao buscar sensores' });
  }
});

// Buscar sensor específico com última leitura
router.get('/:id', async (req, res) => {
  const sensorId = req.params.id;

  try {
    const sensor = await sensorModel.buscarPorIdentificadorOuId(sensorId);

    if (!sensor) {
      return res.status(404).json({ erro: 'Sensor não encontrado' });
    }

    const alertas = await alertaModel.listarPorSensor(sensor.id);
    
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

    res.json(sensor);

  } catch (err) {
    console.error("ERRO ao buscar sensor:", err);
    res.status(500).json({ erro: 'Erro ao buscar detalhes do sensor' });
  }
});

export default router;
