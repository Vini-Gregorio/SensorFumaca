import express from 'express';
import { autenticar } from '../auth.js';
import * as alertaModel from '../model/alertaModel.js';
import sensorModel from '../model/sensor.js';

const router = express.Router();

// Lista alertas do usuário ou de um sensor específico
router.get('/', autenticar, async (req, res) => {
  const usuarioId = req.session?.usuario?.id;
  const { sensorId } = req.query;

  if (!usuarioId) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  try {
    let sensor = null;
    if (sensorId) {
      sensor = await sensorModel.buscarPorIdentificadorOuId(sensorId);
      if (!sensor || sensor.usuario_id !== usuarioId) {
        return res.status(403).json({ erro: 'Acesso negado' });
      }
    }

    const alertas = sensorId && sensor
      ? await alertaModel.listarPorSensor(sensor.id)
      : await alertaModel.listarPorUsuario(usuarioId);
    res.json(alertas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar alertas' });
  }
});

export default router;
