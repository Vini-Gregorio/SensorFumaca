import express from "express";
import { autenticar } from "../auth.js";
import sensorController from "../controller/sensorController.js";

const router = express.Router();

router.post("/register", sensorController.registerSensor);
router.get("/", sensorController.listar);
router.put("/:id", autenticar, sensorController.atualizar);
router.delete("/:id", autenticar, sensorController.deletar);

export default router;
