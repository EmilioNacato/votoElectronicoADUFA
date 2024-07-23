process.env['TNS_ADMIN'] = '/home/ubuntu/Wallet_votoElectronicoBD';
process.env['NODE_EXTRA_CA_CERTS'] = '/home/ubuntu/Wallet_votoElectronicoBD/ca.pem';
const express = require('express');
const path = require('path');
const oracledb = require('oracledb');
const fs = require('fs');

const app = express();
const port = 40000;

// Ruta al directorio que contiene los archivos de wallet descargados
const WALLET_DIR = path.join(__dirname, 'Wallet_votoElectronicoBD');

// Configuración de la base de datos
const connectionOptions = {
  user: 'ADMIN',
  password: 'xXsCzXQjS39',
  connectString: '(description=(retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.us-ashburn-1.oraclecloud.com))(connect_data=(service_name=gcc1a01813aadef_votoelectronicobd_high.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))',
  walletLocation: WALLET_DIR,
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
