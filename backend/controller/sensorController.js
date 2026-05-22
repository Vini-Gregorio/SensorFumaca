import sensorModel from '../model/sensor.js';

class SensorController {
    async registerSensorApi(req, res) {
        try {
            const { chave_sensor, nome_local } = req.body;
            const finalSensorId = chave_sensor;
            const finalNomeSala = nome_local;
            const usuarioId = req.session?.usuario?.id;

            if (!finalSensorId || !finalNomeSala || !usuarioId) {
                return res.status(400).json({
                    error: 'Dados incompletos. É necessário ID do sensor, nome do local e usuário autenticado.'
                });
            }

            const sensorExistente = await sensorModel.buscarPorIdentificador(finalSensorId);
            if (sensorExistente) {
                return res.status(409).json({
                    error: 'Sensor com esse ID já cadastrado.'
                });
            }

            await sensorModel.criar(finalSensorId, finalNomeSala, usuarioId);

            return res.status(201).json({
                chave_sensor: finalSensorId,
                nome_local: finalNomeSala,
                usuario_id: usuarioId
            });
        } catch (error) {
            console.error('Erro ao cadastrar sensor API:', error);
            return res.status(500).json({
                error: 'Erro ao cadastrar sensor.'
            });
        }
    }

    async registerSensorWeb(req, res) {
        try {
            const { chave_sensor, nome_local } = req.body;
            if (!chave_sensor || !nome_local) {
                return res.status(400).json({ error: 'Preencha todos os campos' });
            }
            if (!req.session?.usuario?.id) {
                return res.status(401).json({ error: 'Usuário não autenticado' });
            }
            const usuarioId = req.session.usuario.id;
            const existe = await sensorModel.buscarPorIdentificador(chave_sensor);
            if (existe) return res.status(409).json({ error: 'Sensor já cadastrado' });
            await sensorModel.criar(chave_sensor, nome_local, usuarioId);
            return res.redirect('/sensores');
        } catch (err) {
            console.error('Erro ao cadastrar sensor:', err);
            return res.status(500).json({ error: 'Erro ao cadastrar sensor' });
        }
    }

    async listar(req, res) {
        try {
            const usuarioId = req.session?.usuario?.id;

            if (!usuarioId) {
                return res.status(401).json({ error: 'Não autorizado / Usuário não identificado' });
            }

            const sensores = await sensorModel.listarPorUsuario(usuarioId);
            res.json(sensores);
        } catch (error) {
            console.error('Erro ao listar:', error);
            res.status(500).json({ error: 'Erro ao listar sensores' });
        }
    }

    async atualizar(req, res) {
        try {
            const { id } = req.params;
            const { nome_local } = req.body;

            if (!nome_local) {
                return res.status(400).json({ error: "Nome é obrigatório" });
            }

            const usuarioId = req.session?.usuario?.id;
            const sensor = await sensorModel.buscarPorId(id);
            if (!sensor || sensor.usuario_id !== usuarioId) {
                return res.status(403).json({ error: 'Acesso negado' });
            }

            await sensorModel.atualizar(id, nome_local);
            res.json({ mensagem: "Sensor atualizado" });
        } catch (error) {
            console.error('Erro ao atualizar sensor:', error);
            res.status(500).json({ error: "Erro ao atualizar sensor" });
        }
    }

    async deletar(req, res) {
        try {
            const { id } = req.params;
            const usuarioId = req.session?.usuario?.id;
            const sensor = await sensorModel.buscarPorId(id);

            if (!sensor || sensor.usuario_id !== usuarioId) {
                return res.status(403).json({ error: 'Acesso negado' });
            }

            await sensorModel.deletar(id);
            res.json({ mensagem: "Sensor deletado" });
        } catch (error) {
            console.error('Erro ao deletar sensor:', error);
            res.status(500).json({ error: "Erro ao deletar sensor" });
        }
    }
}

export default new SensorController();

