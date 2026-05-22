import path from 'path';
import 'dotenv/config'; 

import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';

// Rotas - Páginas e Autenticação
import pageRoutes from './routes/pageRoutes.js';
import usuarioRouter from './routes/usuarioRoutes.js';

// Rotas - CRUD (Admin/Backend)
import sensorRouter from './routes/sensorRoutes.js';
import alertaRouter from './routes/alertaRoutes.js';

// Rotas - API por Cliente
import mobileRoutes from './routes/api/mobileRoutes.js';
import webRoutes from './routes/api/webRoutes.js';
import esp32Routes from './routes/api/esp32Routes.js';

// Middleware de autenticação
import { autenticar } from './auth.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
console.log("TELEGRAM_BOT_TOKEN:", !!process.env.TELEGRAM_BOT_TOKEN);
console.log("TELEGRAM_CHAT_ID:", process.env.TELEGRAM_CHAT_ID);


const app = express();

// ============= MIDDLEWARES =============
app.use(express.urlencoded({ extended: true }));
app.use(express.json());  

app.use(express.static(path.join(__dirname, '..', 'views')));

app.set('trust proxy', 1);

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
    next();
});

app.use(session({
    secret: process.env.SESSION_SECRET || 'chavemuitoSecreta',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 // 24 horas
    }
}));

if (process.env.NODE_ENV === 'development') {
    app.get("/debug", (req, res) => {
        res.json(req.session);
    });
}

// ============= ROTAS =============

// 1. Rotas de páginas (renderização HTML - Web)
app.use('/', pageRoutes);

// 2. Rotas de Autenticação
app.use('/usuarios', usuarioRouter);

// 3. Rotas CRUD (administração de dados)
app.use('/sensores', sensorRouter);
app.use('/alertas', alertaRouter);

// 4. API POR CLIENTE
// ┌─ API MOBILE (App Android/iOS)
app.use('/api/mobile', mobileRoutes);

// ┌─ API WEB (Frontend Web)
app.use('/api/web', webRoutes);

// ┌─ API ESP32 (Dispositivo IoT - Token autenticado)
app.use('/api/esp32', esp32Routes);

// Logout
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao fazer logout' });
        }
        res.redirect('/entrar');
    });
});


const PORT = process.env.PORT || 3001;

// Só sobe o servidor na porta se NÃO estiver rodando testes
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor rodando na porta ${PORT}!!`);
    });
}

// Exporta o app para o Supertest conseguir usá-lo
export default app;