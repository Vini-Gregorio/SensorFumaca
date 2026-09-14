import express from "express";
import { autenticar } from "../auth.js";
import sensorController from "../controller/sensorController.js";

const router = express.Router();

function autenticarWeb(req, res, next) {
    if (req.session && req.session.usuario && req.session.usuario.id) {
        return next(); // Continua para a controller
    }
    // Se não tiver sessão, redireciona para a tela de login
    return res.redirect('/entrar?erro=Faça login para acessar esta página');
}

router.post("/register", autenticar, sensorController.registerSensorWeb);
router.post("/api/register", autenticar, sensorController.registerSensorApi);
// lista todos (GET /sensores)
router.get("/", autenticar, sensorController.listar);
router.put("/:id", autenticar, sensorController.atualizar);
router.delete("/:id", autenticar, sensorController.deletar);

// buscar por identificador (GET /sensores/:identificador)
/*?Analisar. usar bind garante que o `this` do controller esteja correto, embora aqui não usemos `this`.
router.get("/:identificador", sensorController.buscarPorIdentificador.bind(sensorController));
*/
export default router;
