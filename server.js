process.env['TNS_ADMIN'] = '/home/ubuntu/votoElectronicoADUFA/Wallet_votoElectronicoBD';
process.env['NODE_EXTRA_CA_CERTS'] = '/home/ubuntu/votoElectronicoADUFA/Wallet_votoElectronicoBD/ewallet.pem';

console.log('TNS_ADMIN:', process.env.TNS_ADMIN);
console.log('NODE_EXTRA_CA_CERTS:', process.env.NODE_EXTRA_CA_CERTS);

const express = require('express');
const bodyParser = require('body-parser');
const oracledb = require('oracledb');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 40000;

// Configuración de almacenamiento con multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'assets/img/fotosListas'); // Carpeta donde se guardarán las imágenes
  },
  filename: (req, file, cb) => {
    const fieldname = file.fieldname;
    const fieldMatch = fieldname.match(/(fotoPresidenteLista|fotoVicepresidenteLista)(\d+)/);
    
    if (fieldMatch) {
      const [ , type, index ] = fieldMatch;      
      const filename = `${fieldname}.png`;
      cb(null, filename);
    } else {
      cb(new Error('Nombre de campo no reconocido'), false);
    }
  }
});

const upload = multer({ storage });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configurar Express para servir archivos estáticos desde el directorio raíz
//app.use(express.static(path.join(__dirname, '/')));
app.use(express.static('.'));

// Configuración de la base de datos
const dbConfig = {
  user: 'ADMIN', // Usuario de la base de datos
  password: 'xXsCzXQj@S39', // Contraseña del usuario de la base de datos
  connectString: 'votoelectronicobd_high' // Usar el alias del tnsnames.ora
};

// Ruta para manejar la carga de archivos
app.post('/upload', upload.any(), (req, res) => {
  // console.log('req.body upload:', req.body);
  // console.log('req.files upload:', req.files);
  res.json({ message: 'Subida OK' });
});

// Ruta para el inicio de sesión
app.post('/login', async (req, res) => {
  const { username, password,periodo } = req.body;
  console.log(`Usuario: ${username}, Contraseña: ${password}, Periodo: ${periodo}`);
  if (!username || !password) {
    res.send('<script>alert("Usuario y contraseña son requeridos"); window.location.href="/";</script>');
    return;
  }

  try {
    const connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT ID_ROL FROM USUARIOS WHERE ID_US = :username AND CONTRASENA_US = :password`,
      [username, password]
    );

    if (result.rows.length > 0) {
      const role = result.rows[0][0];
      const usuario = username;
      console.log('Usuario autenticado:', { role });

      console.log(periodo);

      res.send(`
        <script>
          localStorage.setItem('rol', '${role}');
          localStorage.setItem('usuario', '${usuario}');
          if (${role} === 1) {
            window.location.href = '/html/configuracion.html';
          } else if (${role} === 2) {
            // Redirigir a votacionADUFA.html con el parámetro 'periodo'
            window.location.href = '/html/votacionADUFA.html?periodo=${periodo}';
          } else {
            alert("Rol desconocido");
            window.location.href = '/';
          }
        </script>
        `);
    } else {
      res.send('<script>alert("Credenciales incorrectas"); window.location.href="/";</script>');
    }

    await connection.close();
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});

app.post('/guardar-candidatos', async (req, res) => {
  const formData = req.body;

  try {
    const connection = await oracledb.getConnection(dbConfig);

    const insertListQuery = `INSERT INTO LISTAS (ID_LISTA, PERIODO_POSTULACION, ESTADO_LISTA, NOMBRE_LISTA) 
                             VALUES (:id_lista, :periodo_postulacion, :estado_lista, :nombre_lista)`;
    
    const insertCandidatoQuery = `INSERT INTO CANDIDATOS (ID_US, ID_LISTA, PERIODO_POSTULACION, DIGNIDAD_CAND, ESTADO_CAND) 
                                  VALUES (:id_us, :id_lista, :periodo_postulacion, :dignidad_cand, :estado_cand)`;
    
    const NuloQuery = `INSERT INTO LISTAS (ID_LISTA, PERIODO_POSTULACION, ESTADO_LISTA, NOMBRE_LISTA) 
                       VALUES ('nulo', :periodo_postulacion, 1, 'nulo')`;

    const period = formData.periodo;
    const estadoLista = 1; // Estado para listas, asumiendo que siempre es 1
    const estadoCandidato = 1; // Estado para candidatos, asumiendo que siempre es 1

    console.log("Voy a guardar Nulo");
    await connection.execute(NuloQuery, [period]);
    console.log("Guarde Nulo");

    for (const [index, lista] of formData.listas.entries()) {
      const id_lista = `LISTA${index + 1}`;
      const nombre_lista = lista.nombreLista;

      // Insertar en la tabla LISTAS
      await connection.execute(insertListQuery, {
        id_lista: id_lista,
        periodo_postulacion: period,
        estado_lista: estadoLista,
        nombre_lista: nombre_lista
      });

      const dignidades = ['presidente', 'vicepresidente', 'secretario', 'tesorero', 'sindico'];
      
      for (const dignidad of dignidades) {
        const candidato = lista[dignidad];
        
        if (candidato) {
          // Separar el nombre y apellido del candidato
          const [nombre, apellido] = candidato.split(', '); // Separar por coma

          // Limpiar espacios alrededor de los nombres
          const cleanNombre = nombre.trim();
          const cleanApellido = apellido.trim();

          // Consulta para obtener el ID_US del candidato
          const result = await connection.execute(
            `SELECT ID_US FROM USUARIOS WHERE NOMBRE_US = :nombre AND APELLIDO_US = :apellido`,
            [cleanNombre, cleanApellido]
          );

          if (result.rows.length > 0) {
            const id_us = result.rows[0][0];

            // Insertar en la tabla CANDIDATOS
            await connection.execute(insertCandidatoQuery, {
              id_us: id_us,
              id_lista: id_lista,
              periodo_postulacion: period,
              dignidad_cand: dignidad,
              estado_cand: estadoCandidato
            });
          } else {
            console.log(`No se encontró el usuario con nombre ${cleanNombre} y apellido ${cleanApellido}`);
            // Puedes manejar aquí lo que deseas hacer si no se encuentra el usuario
          }
        }
      }

      // Insertar vocales principales
      for (let i = 0; i < 3; i++) {
        const candidato = lista.vocalesPrincipales[i];
        
        if (candidato) {
          // Separar el nombre y apellido del candidato
          const [nombre, apellido] = candidato.split(', '); // Separar por coma

          // Limpiar espacios alrededor de los nombres
          const cleanNombre = nombre.trim();
          const cleanApellido = apellido.trim();

          // Consulta para obtener el ID_US del candidato
          const result = await connection.execute(
            `SELECT ID_US FROM USUARIOS WHERE NOMBRE_US = :nombre AND APELLIDO_US = :apellido`,
            [cleanNombre, cleanApellido]
          );

          if (result.rows.length > 0) {
            const id_us = result.rows[0][0];
            // Insertar en la tabla CANDIDATOS
            await connection.execute(insertCandidatoQuery, {
              id_us: id_us,
              id_lista: id_lista,
              periodo_postulacion: period,
              dignidad_cand: `vocalPrincipal${i + 1}`,
              estado_cand: estadoCandidato
            });
          } else {
            console.log(`No se encontró el usuario con nombre ${cleanNombre} y apellido ${cleanApellido}`);
            // Puedes manejar aquí lo que deseas hacer si no se encuentra el usuario
          }
        }
      }

      // Insertar vocales suplentes
      for (let i = 0; i < 3; i++) {
        const candidato = lista.vocalesSuplentes[i];
        
        if (candidato) {
          // Separar el nombre y apellido del candidato
          const [nombre, apellido] = candidato.split(', '); // Separar por coma

          // Limpiar espacios alrededor de los nombres
          const cleanNombre = nombre.trim();
          const cleanApellido = apellido.trim();

          // Consulta para obtener el ID_US del candidato
          const result = await connection.execute(
            `SELECT ID_US FROM USUARIOS WHERE NOMBRE_US = :nombre AND APELLIDO_US = :apellido`,
            [cleanNombre, cleanApellido]
          );

          if (result.rows.length > 0) {
            const id_us = result.rows[0][0];
            // Insertar en la tabla CANDIDATOS
            await connection.execute(insertCandidatoQuery, {
              id_us: id_us,
              id_lista: id_lista,
              periodo_postulacion: period,
              dignidad_cand: `vocalSuplente${i + 1}`,
              estado_cand: estadoCandidato
            });
          } else {
            console.log(`No se encontró el usuario con nombre ${cleanNombre} y apellido ${cleanApellido}`);
            // Puedes manejar aquí lo que deseas hacer si no se encuentra el usuario
          }
        }
      }
    }

    await connection.commit();
    await connection.close();

    res.status(200).send('Datos guardados correctamente');
    console.log("Candidatos guardados en la Base de Datos");
  } catch (err) {
    console.error('Error al guardar los datos en la base de datos:', err);
    res.status(500).send('Error en el servidor');
  }
});

app.post('/guardar-votos', async (req, res) => {
  try {
    const { usuario, formData } = req.body;
    // console.log('Usuario obtenido:', usuario);
    // console.log('Datos del formulario recibidos:', formData);

    const connection = await oracledb.getConnection(dbConfig);

    // Verificar si el votante ya existe en la tabla VOTANTES
    const checkVotanteQuery = `SELECT ID_US FROM VOTANTES WHERE ID_US = :usuario`;
    const result = await connection.execute(checkVotanteQuery, [usuario]);

    //console.log(result.rows.length);

    if (result.rows.length == 0) {
      // Si el votante no existe, insertar el votante en la tabla VOTANTES
      await connection.execute(
        `INSERT INTO VOTANTES (ID_US, ESTADO_VOT) VALUES (:usuario, 1)`,
        [usuario]
      );
      console.log('Se ha insertado el votante en la tabla VOTANTES.');
    } else {
      console.log('El votante ya existe en la tabla VOTANTES.');
    }

    const insertQuery = `INSERT INTO VOTOS (ID_LISTA, PERIODO_POSTULACION, ID_US, FECHA_VOTACION)
                         VALUES (:idLista, :periodoPostulacion, :usuario, CURRENT_TIMESTAMP)`;
    
    const insertNuloQuery = `INSERT INTO VOTOS (ID_LISTA, PERIODO_POSTULACION, ID_US, FECHA_VOTACION)
                         VALUES ('nulo', :periodo_postulacion, :usuario, CURRENT_TIMESTAMP)`;
    
    const vot_id_us = usuario; // Variable Usuario de local storage
    const period = formData.periodo;
    const id_lista = formData.idLista;

    if (id_lista.toLowerCase() === 'nulo') {
      console.log("Se insertara voto nulo");
      await connection.execute(insertNuloQuery, [period, vot_id_us]);
    } else {
      //console.log(`Votante: ${vot_id_us}, Candidato: ${id_us}, Período: ${period}`);
      await connection.execute(insertQuery, [id_lista, period, vot_id_us]);
    }

    // Confirmar la transacción
    await connection.commit();
    await connection.close();
    res.status(200).json({ message: 'Su voto fue guardado correctamente' });

  } catch (err) {
    console.error('Error al guardar los votos en la base de datos:', err);
    res.status(500).send('Error en el servidor');
  }
});



// Ruta para obtener candidatos por período
app.get('/obtener-candidatos', async (req, res) => {
  const periodo = req.query.periodo;
  //console.log(`Solicitud para obtener candidatos del período: ${periodo}`);

  try {
    // Establecer conexión a la base de datos
    //console.log('Estableciendo conexión a Oracle...');
    const connection = await oracledb.getConnection(dbConfig);
    console.log('Conexión establecida con éxito.');

    const result = await connection.execute(
      `SELECT 
         c.ID_US, 
         u.NOMBRE_US || ' ' || u.APELLIDO_US AS NOMBRE_COMPLETO,
         c.ID_LISTA, 
         c.PERIODO_POSTULACION, 
         c.DIGNIDAD_CAND, 
         c.ESTADO_CAND,
         l.NOMBRE_LISTA
       FROM CANDIDATOS c
       JOIN LISTAS l ON c.ID_LISTA = l.ID_LISTA AND c.PERIODO_POSTULACION = l.PERIODO_POSTULACION
       JOIN USUARIOS u ON c.ID_US = u.ID_US
       WHERE c.PERIODO_POSTULACION = :periodo`,
      [periodo]
    );
    // console.log('Consulta SQL ejecutada con éxito.');
    // console.log('Resultados de la consulta:', result);

    const candidatos = result.rows.map(row => ({
      idUs: row[0],
      nombreCompleto: row[1],
      idLista: row[2],
      periodoPostulacion: row[3],
      dignidadCand: row[4],
      estadoCand: row[5],
      nombreLista: row[6]
    }));

    // Cerrar la conexión después de obtener los resultados
    await connection.close();
    //console.log('Conexión cerrada.');

    // Enviar respuesta con los candidatos encontrados
    res.status(200).json(candidatos);
    // console.log('Respuesta enviada:', candidatos);
  } catch (error) {
    console.error('Error al obtener candidatos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para verificar si un usuario ha votado para un período específico
app.get('/verificar-voto', async (req, res) => {
  const { usuario, periodo } = req.query;

  try {
    const connection = await oracledb.getConnection(dbConfig);

    // Consulta para verificar si el usuario ya ha votado para el período especificado
    const query = `
      SELECT COUNT(*) AS VOTO_REALIZADO
      FROM VOTOS
      WHERE ID_US = :usuario
        AND PERIODO_POSTULACION = :periodo
    `;

    const result = await connection.execute(query, [usuario, periodo]);

    // Extraer el resultado de la consulta
    const votoRealizado = result.rows[0][0] > 0;

    await connection.close();

    // Enviar respuesta con el resultado
    res.status(200).json({ votoRealizado });

  } catch (error) {
    console.error('Error al verificar voto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// Ruta para obtener los usuarios
app.get('/api/usuarios', async (req, res) => {
  try {
    const connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT NOMBRE_US, APELLIDO_US FROM USUARIOS WHERE ID_US <> 'nulo'`
    );
    await connection.close();

    const usuarios = result.rows.map(row => ({
      nombres: row[0],
      apellidos: row[1]
    }));

    res.json(usuarios);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).send('Error al obtener los usuarios');
  }
});

// Ruta para obtener los periodos
app.get('/api/periodos', async (req, res) => {
  try {
    const connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(`SELECT DISTINCT PERIODO_POSTULACION FROM CANDIDATOS ORDER BY PERIODO_POSTULACION DESC`);
    await connection.close();

    const periodos = result.rows.map(row => row[0]);

    res.json(periodos);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).send('Error al obtener los periodos');
  }
});

// Ruta para obtener los resultados por período
app.get('/api/resultados', async (req, res) => {
  const periodo = req.query.periodo;

  try {
    const connection = await oracledb.getConnection(dbConfig);

    // Consulta para obtener el número de votantes únicos
    const queryNumVotantesUnicos = `
      SELECT COUNT(DISTINCT v.ID_US) AS NUMERO_VOTANTES_UNICOS
      FROM VOTOS v
      WHERE v.PERIODO_POSTULACION = :periodo
    `;

    const resultNumVotantesUnicos = await connection.execute(queryNumVotantesUnicos, [periodo]);
    const numeroVotantesUnicos = resultNumVotantesUnicos.rows[0][0]; // Número de votantes únicos
    console.log(`Número de votantes únicos para el período ${periodo}: ${numeroVotantesUnicos}`);

    const query = `
      SELECT l.NOMBRE_LISTA, COUNT(v.ID_US) AS VOTOS
      FROM VOTOS v
      JOIN LISTAS l ON v.ID_LISTA = l.ID_LISTA AND v.PERIODO_POSTULACION = l.PERIODO_POSTULACION
      WHERE v.PERIODO_POSTULACION = :periodo
      GROUP BY l.NOMBRE_LISTA
      ORDER BY VOTOS DESC
    `;

    const result = await connection.execute(query, [periodo]);
    await connection.close();

    const resultados = [];

    result.rows.forEach(row => {
      const [nombre, votos] = row;
      resultados.push({ nombre, votos });
    });

    res.json(resultados);
  } catch (err) {
    console.error('Error al obtener los resultados:', err);
    res.status(500).send('Error al obtener los resultados');
  }
});

// Ruta para obtener todos los usuarios activos
app.get('/api/usuarios-crud', async (req, res) => {
  try {
    const connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(`SELECT ID_US, ID_ROL, NOMBRE_US, APELLIDO_US, DEPARTAMENTO_US, CONTRASENA_US FROM USUARIOS WHERE ESTADO_US = 1`);
    await connection.close();
    res.json(result.rows.map(row => ({
      ID_US: row[0],
      ID_ROL: row[1],
      NOMBRE_US: row[2],
      APELLIDO_US: row[3],
      DEPARTAMENTO_US: row[4],
      CONTRASENA_US: row[5]
    })));
  } catch (err) {
    console.error('Error al obtener los usuarios:', err);
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
});

// Ruta para obtener un usuario por ID
app.get('/api/usuarios-crud/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(`SELECT ID_US, ID_ROL, NOMBRE_US, APELLIDO_US, DEPARTAMENTO_US, CONTRASENA_US FROM USUARIOS WHERE ID_US = :id AND ESTADO_US = 1`, [id]);
    await connection.close();
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const row = result.rows[0];
    res.json({
      ID_US: row[0],
      ID_ROL: row[1],
      NOMBRE_US: row[2],
      APELLIDO_US: row[3],
      DEPARTAMENTO_US: row[4],
      CONTRASENA_US: row[5]
    });
  } catch (err) {
    console.error('Error al obtener el usuario:', err);
    res.status(500).json({ error: 'Error al obtener el usuario' });
  }
});

// Ruta para crear un nuevo usuario
app.post('/api/usuarios-crud', async (req, res) => {
  const { idUs, idRol, nombreUs, apellidoUs, departamentoUs, contrasenaUs } = req.body;
  try {
    const connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `INSERT INTO USUARIOS (ID_US, ID_ROL, NOMBRE_US, APELLIDO_US, DEPARTAMENTO_US, CONTRASENA_US, ESTADO_US) VALUES (:idUs, :idRol, :nombreUs, :apellidoUs, :departamentoUs, :contrasenaUs, 1)`,
      [idUs, idRol, nombreUs, apellidoUs, departamentoUs, contrasenaUs]
    );
    await connection.commit();
    await connection.close();
    res.json({ message: 'Usuario creado exitosamente' });
  } catch (err) {
    console.error('Error al crear el usuario:', err);
    res.status(500).json({ error: 'Error al crear el usuario' });
  }
});

// Ruta para actualizar un usuario existente
app.put('/api/usuarios-crud/:id', async (req, res) => {
  const id = req.params.id;
  const { idRol, nombreUs, apellidoUs, departamentoUs, contrasenaUs } = req.body;
  try {
    const connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `UPDATE USUARIOS SET ID_ROL = :idRol, NOMBRE_US = :nombreUs, APELLIDO_US = :apellidoUs, DEPARTAMENTO_US = :departamentoUs, CONTRASENA_US = :contrasenaUs WHERE ID_US = :id AND ESTADO_US = 1`,
      [idRol, nombreUs, apellidoUs, departamentoUs, contrasenaUs, id]
    );
    await connection.commit();
    await connection.close();
    res.json({ message: 'Usuario actualizado exitosamente' });
  } catch (err) {
    console.error('Error al actualizar el usuario:', err);
    res.status(500).json({ error: 'Error al actualizar el usuario' });
  }
});

// Ruta para cambiar el estado de un usuario a 0 (eliminar)
app.delete('/api/usuarios-crud/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const connection = await oracledb.getConnection(dbConfig);
    await connection.execute(`UPDATE USUARIOS SET ESTADO_US = 0 WHERE ID_US = :id`, [id]);
    await connection.commit();
    await connection.close();
    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (err) {
    console.error('Error al eliminar el usuario:', err);
    res.status(500).json({ error: 'Error al eliminar el usuario' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Aplicación escuchando en http://0.0.0.0:${PORT}`);
});
