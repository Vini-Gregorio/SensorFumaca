import sensorModel from '../model/sensor.js';

class SensorController {
    async registerSensorApi(req, res) {
        try {
            const { chave_sensor, nome_local, idUsuario } = req.body;
            
             const finalSensorId = chave_sensor;
            const finalNomeSala = nome_local;

            // Verifica se a requisição veio do app (que envia 'Content-Type: application/json')
            const isApp = req.is('json');
            const finalUsuarioId = isApp ? idUsuario : req.session?.usuario?.id;

            
            if (!finalSensorId || !finalNomeSala || !finalUsuarioId) {
                  if (req.is('json')) {
                     return res.status(400).json({ 
                    error: 'Dados incompletos. É necessário ID do sensor, nome do local e ID do usuário.' 
                });
                }
                return res.redirect('/cadastrarSensores?erro=Preencha todos os campos');
            }
              const sensorExistente = await sensorModel.buscarPorIdentificador(finalSensorId);
            if (sensorExistente) {
                if (req.is('json')) {
                     return res.status(400).json({ 
                    error: 'Sensor com esse ID já cadastrado.' 
                });
                }
                return res.redirect('/cadastrarSensores?erro=Sensor com esse ID já cadastrado');
            }

            await sensorModel.criar(finalSensorId, finalNomeSala, finalUsuarioId);
            
            if (isApp) {
                // Para o Android, responda com JSON.
                const novoSensor = { 
                    chave_sensor: finalSensorId, 
                    nome_local: finalNomeSala, 
                    idUsuario: finalUsuarioId 
                };
                return res.status(201).json(novoSensor);
            } else {
                // Para o site, redirecione.
                return res.redirect('/sensores');
            }

        } catch (error) {
            if (req.is('json')) {
                     return res.status(400).json({ 
                    error: 'Erro ao cadastrar sensor.' 
                });
                }
                return res.redirect('/cadastrarSensores?err0r=Erro ao cadastrar sensor');
        }
      }
  async registerSensorWeb(req, res) {
    try {
      const { chave_sensor, nome_local } = req.body;
      if (!chave_sensor || !nome_local) {
        return res.status(400).json({ error: 'Preencha todos os campos' });
      }
      if (!req.session || !req.session.usuario?.id) {
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
          //Tirar posteriormente o query.idUsuario para jwt
            const idUsuario = req.query.idUsuario || req.session?.usuario?.id;

            if (!idUsuario) {
                return res.status(401).json({ error: 'Não autorizado / Usuário não identificado' });
            }

            const sensores = await sensorModel.listarPorUsuario(idUsuario);
            
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

        await sensorModel.atualizar(id, nome_local);

        res.json({ mensagem: "Sensor atualizado" });

    } catch (error) {
        res.status(500).json({ error: "Erro ao atualizar sensor" });
    }
}

    async deletar(req, res) {
    try {
        const { id } = req.params;

        await sensorModel.deletar(id);

        res.json({ mensagem: "Sensor deletado" });

    } catch (error) {
        res.status(500).json({ error: "Erro ao deletar sensor" });
    }
}


  /* ?Analisar GET /sensores/:identificador  -> buscar um sensor (handler express)
  async buscarPorIdentificador(req, res) {
    try {
      const identificador = req.params.identificador;
      if (!identificador) return res.status(400).json({ error: 'Identificador ausente' });
      const sensor = await sensorModel.buscarPorIdentificador(identificador);
      if (!sensor) return res.status(404).json({ error: 'Sensor não encontrado' });
      return res.json(sensor);
    } catch (err) {
      console.error('Erro ao buscar sensor:', err);
      return res.status(500).json({ error: 'Erro ao buscar sensor' });
    }
  }
*/
}
export default new SensorController();

