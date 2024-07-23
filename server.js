process.env['TNS_ADMIN'] = '/home/ubuntu/votoElectronicoADUFA/Wallet_votoElectronicoBD';
process.env['NODE_EXTRA_CA_CERTS'] = '/home/ubuntu/votoElectronicoADUFA/Wallet_votoElectronicoBD/ewallet.pem';

const express = require('express');
const path = require('path');
const oracledb = require('oracledb');

const app = express();
const port = 40000;

// Configuración de la base de datos
const dbConfig = {
  user: 'ADMIN', // Usuario de la base de datos
  password: 'xXsCzXQj@S39', // Contraseña del usuario de la base de datos
  connectString: 'votoelectronicobd_high' // Usar el alias del tnsnames.ora
};

// Configurar la carpeta public para archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para obtener los usuarios
app.get('/api/usuarios', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT NOMBRE_US, APELLIDO_US, DEPARTAMENTO_US FROM USUARIOS`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener los usuarios');
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Aplicación escuchando en http://0.0.0.0:${port}`);
});
