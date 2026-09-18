import express from "express";
import pool from "../config/db.js"; // 👈 Faltava esta importação
import { autenticar } from "../auth.js";
import sensorController from "../controller/sensorController.js";

const router = express.Router();

function autenticarWeb(req, res, next) {
    if (req.session && req.session.usuario && req.session.usuario.id) {
        return next();
    }
    return res.redirect('/entrar?erro=Faça login para acessar esta página');
}

router.post("/register", autenticar, sensorController.registerSensorWeb);
router.post("/api/register", autenticar, sensorController.registerSensorApi);

// Lista todos (GET /sensores)
router.get("/", autenticar, sensorController.listar);
router.put("/:id", autenticar, sensorController.atualizar);
router.delete("/:id", autenticar, sensorController.deletar);

// Atualizar limite em PPM
router.put("/:id/limite", autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    const { limitePpm } = req.body;
    
    await pool.execute(
      "UPDATE sensores SET limite_ppm = ? WHERE (id = ? OR identificador = ?) AND usuario_id = ?",
      [limitePpm, id, id, req.session.usuario.id]
    );

    res.json({ mensagem: "Limite atualizado com sucesso" });
  } catch (err) {
    console.error("Erro ao atualizar limite:", err);
    res.status(500).json({ erro: "Erro ao atualizar limite" });
  }
});

export default router;