// userController.js
import usuarioModel from '../model/usuario.js';

class UserController {

    async register(req, res) {
        try {
            const { email, senha, pass, telegram_chat_id } = req.body;
            const password = senha || pass;

            if (!email || !password) {
                if (req.is('json')) {
                return res.status(400).json({ error: 'Preencha todos os campos' });
                }

                return res.redirect('/cadastro?erro=Preencha todos os campos');
            }

            const usuarioExistente = await usuarioModel.buscarPorEmail(email);

            if (usuarioExistente) {
                if (req.is('json')) {
                return res.status(409).json({ error: 'Email já cadastrado' });
                }
                return res.redirect('/cadastro?erro=Email já cadastrado');
            }

            const usuario = await usuarioModel.criar(email, password, telegram_chat_id);

           if (req.is('json')) {
            // Se o Content-Type é JSON, então é o App Android.
            return res.status(200).json({
                id: usuario.id,
                email: usuario.email
            });
            } else {
                // Senão, é um formulário do site.
                req.session.usuario = {
                    id: usuario.id,
                    email: usuario.email
                };
                return res.redirect('/sensores');
            }

        } catch (error) {
            if (req.is('json')) {
                return res.status(500).json({ error: 'Erro ao cadastrar usuário' });
            }
                return res.redirect('/cadastro?erro=Erro interno ao fazer o cadastro!');
        }
    }

    async login(req, res) {
        try {
            const { email, senha, pass } = req.body;
            const password = senha || pass;

            if (!email || !password) {
                if (req.is('json')) {
                return res.status(400).json({ error: 'Email e senha são obrigatórios' });
                }

                return res.redirect('/entrar?erro=Email e senha são obrigatórios!');

            }

            const usuario = await usuarioModel.verificarCredenciais(email, password);
             if (!usuario) {

                if (req.is('json')) {
                    return res.status(401).json({ error: 'Email ou senha inválidos' });
                }

                return res.redirect('/entrar?erro=Email ou senha inválidos!');

            }

            if (req.is('json')) {
            // Se o Content-Type é JSON, então é o App Android.
            return res.status(200).json({
                id: usuario.id,
                email: usuario.email
            });
            } else {
                // Senão, é um formulário do site.
                req.session.usuario = {
                    id: usuario.id,
                    email: usuario.email
                };
                return res.redirect('/sensores');
            }


        } catch (error) {
            console.error('Erro ao fazer login:', error);

            if (req.is('json')) {
                return res.status(500).json({ error: 'Erro ao fazer login' });
            }

            return res.redirect('/entrar?erro=Erro interno ao fazer o cadastro!');

        }
    }

    logout(req, res) {
        req.session.destroy(err => {
            if (err) return res.status(500).json({ error: 'Erro ao fazer logout' });
            res.redirect('/entrar');
        });
    }

    async atualizarTelegramChatId(req, res) {
        try {
            const usuarioId = req.session.usuario?.id;
            if (!usuarioId) {
                return res.status(401).json({ error: 'Usuário não autenticado' });
            }

            const { telegram_chat_id } = req.body;
            if (!telegram_chat_id) {
                return res.status(400).json({ error: 'telegram_chat_id é obrigatório' });
            }

            const atualizado = await usuarioModel.atualizarTelegramChatId(usuarioId, telegram_chat_id);
            if (!atualizado) {
                return res.status(500).json({ error: 'Não foi possível atualizar o telegram_chat_id' });
            }

            return res.status(200).json({ sucesso: true, mensagem: 'Telegram Chat ID atualizado com sucesso' });
        } catch (error) {
            console.error('Erro ao atualizar telegram_chat_id:', error);
            return res.status(500).json({ error: 'Erro ao atualizar telegram_chat_id' });
        }
    }
}


export default new UserController();
