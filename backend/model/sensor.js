import pool from '../config/db.js';

class SensorModel {

    // Inserir novo sensor
    async criar(identificador, nomeSala, usuarioId) {
        const query = `
            INSERT INTO sensores (identificador, nomeSala, usuario_id, criado_em, ativo) 
            VALUES (?, ?, ?, NOW(), 1)
        `;
        const [result] = await pool.execute(query, [identificador, nomeSala, usuarioId]);
        return result.insertId;
    }

    // Buscar sensor por identificador
    async buscarPorIdentificador(identificador) {
        const query = `
            SELECT * FROM sensores 
            WHERE identificador = ? AND ativo = 1
        `;
        const [rows] = await pool.execute(query, [identificador]);
        return rows.length > 0 ? rows[0] : null;
    }

    // Listar sensores do usuário
    async listarPorUsuario(usuarioId) {
        const query = `
            SELECT * FROM sensores 
            WHERE usuario_id = ? AND ativo = 1
        `;
        const [rows] = await pool.execute(query, [usuarioId]);
        return rows;
    }

    // Atualizar sensor
    async atualizar(id, nomeSala) {
        const query = `
            UPDATE sensores 
            SET nomeSala = ? 
            WHERE id = ?
        `;
        const [result] = await pool.execute(query, [nomeSala, id]);
        return result.affectedRows > 0;
    }

    // 🔥 INATIVAR SENSOR (melhor que deletar)
    async inativar(id) {
        const query = `
            UPDATE sensores 
            SET ativo = 0 
            WHERE id = ?
        `;
        const [result] = await pool.execute(query, [id]);
        return result.affectedRows > 0;
    }

}

export default new SensorModel();
