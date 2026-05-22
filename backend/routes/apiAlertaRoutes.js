import express from 'express';
import { autenticar } from '../auth.js';
import * as alertaModel from '../model/alertaModel.js';

const router = express.Router();

// Lista alertas do usuário ou de um sensor específico
router.get('/', autenticar, async (req, res) => {
  const usuarioId = req.session.userId || (req.session.usuario && req.session.usuario.id);
  const { sensorId } = req.query;

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

export default router;
