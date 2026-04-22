import express from "express";
import { autenticar } from "../auth.js";
import userController from "../controller/usuarioController.js";

const router = express.Router();

router.post("/register", userController.register);
router.post("/login", userController.login);
router.get("/me", autenticar, (req, res) => {
  res.json(req.session.usuario);
});

export default router;
