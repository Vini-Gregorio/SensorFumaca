import express from "express";
import { autenticar } from "../auth.js";
import userController from "../controller/usuarioController.js";

const router = express.Router();

// Endpoints da API
router.post("/register", userController.register);
router.post("/login", userController.login);
router.get("/me", autenticar, (req, res) => {
  res.json(req.session.usuario);
});

// Aliases para compatibilidade com frontend (rotas legadas)
router.post("/cadastro", userController.register);  // /usuarios/cadastro
router.post("/entrar", userController.login);       // /usuarios/entrar

export default router;
