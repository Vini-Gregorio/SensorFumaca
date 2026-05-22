import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { autenticar } from '../auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Rota inicial
router.get('/', (req, res) => {
    res.redirect('/inicio');
});

// Páginas públicas
router.get('/inicio', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'views', 'inicio.html'));
});

router.get('/cadastro', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'views', 'cadastro.html'));
});

router.get('/entrar', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'views', 'entrar.html'));
});

// Páginas protegidas (requerem autenticação)
router.get('/sensores', autenticar, (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'views', 'sensores.html'));
});

router.get('/cadastrarSensores', autenticar, (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'views', 'cadastrarSensores.html'));
});

router.get('/dashboards', autenticar, (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'views', 'dashboards.html'));
});

export default router;
