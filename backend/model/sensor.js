import pool from '../config/db.js';

class SensorModel {
    // Inserir novo sensor
    async criar(identificador, nomeSala, usuarioId) {
        const query = "INSERT INTO sensores (identificador, nomeSala, usuario_id, criado_em) VALUES (?, ?, ?,NOW())";
        const [result] = await pool.execute(query, [identificador, nomeSala, usuarioId]);
        return result.insertId;
    }

    // Buscar sensor por identificador
    async buscarPorIdentificador(identificador) {
        const query = "SELECT * FROM sensores WHERE identificador = ?";
        const [rows] = await pool.execute(query, [identificador]);
        return rows.length > 0 ? rows[0] : null;
    }

    async buscarPorId(id) {
        const query = "SELECT * FROM sensores WHERE id = ?";
        const [rows] = await pool.execute(query, [id]);
        return rows.length > 0 ? rows[0] : null;
    }

    async buscarPorIdentificadorOuId(value) {
        const id = Number(value);
        if (!Number.isNaN(id)) {
            const sensorById = await this.buscarPorId(id);
            if (sensorById) return sensorById;
        }
        return this.buscarPorIdentificador(value);
    }

    async listarPorUsuario(usuarioId) {
        const query = "SELECT * FROM sensores WHERE usuario_id = ?";
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

    // Deletar sensor
    async deletar(id) {
        const query = `
            DELETE FROM sensores 
            WHERE id = ?
        `;
        const [result] = await pool.execute(query, [id]);
        return result.affectedRows > 0;
    }

   // async InativarSensor(sensorId)(
     //   const query = "UPDATE sensores SET ativo = 0 WHERE id = ?";
       // const [result] = await pool.execute(query, [sensorId]);
       // return result.affectedRows > 0; 
  //  )
}
export default new SensorModel();
