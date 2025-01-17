process.env['TNS_ADMIN'] = '/home/ubuntu/votoElectronicoADUFA/Wallet_votoElectronicoBD';
process.env['NODE_EXTRA_CA_CERTS'] = '/home/ubuntu/votoElectronicoADUFA/Wallet_votoElectronicoBD/ewallet.pem';

console.log('TNS_ADMIN:', process.env.TNS_ADMIN);
console.log('NODE_EXTRA_CA_CERTS:', process.env.NODE_EXTRA_CA_CERTS);

const express = require('express');
const bodyParser = require('body-parser');
const oracledb = require('oracledb');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const yaml = require('js-yaml');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = 40000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

app.post('/uploadProvisionales', upload.any(), (req, res) => {
  console.log('Archivos recibidos:', req.files);

  if (!req.files || req.files.length === 0) {
      console.error('No se subieron archivos');
      return res.status(400).json({ success: false, message: 'No se subieron archivos' });
  }

  // Si todo está bien, envía una respuesta de éxito
  res.status(200).json({ success: true, message: 'Archivos subidos y guardados correctamente.' });
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configurar Express para servir archivos estáticos desde el directorio raíz
//app.use(express.static(path.join(__dirname, '/')));
app.use(express.static('.'));


// Configuración del transportador de nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
      user: 'emilionacato75@gmail.com',
      pass: 'hjqkxseleqyrrdaj'
  }
});



// Configuración de la base de datos
// const dbConfig = {
//   user: 'C##emilioadmin',
//   password: 'xXsCzXQjS39',
//   connectString: 'localhost/XE'
// };

// Configuración de la base de datos
const dbConfig = {
  user: 'ADMIN', // Usuario de la base de datos
  password: 'xXsCzXQj@S39', // Contraseña del usuario de la base de datos
  connectString: 'votoelectronico_high' // Usar el alias del tnsnames.ora
};

// Función para enviar correos con un retardo de 10 segundos
function enviarCorreoConRetardo(transporter, mailOptions, delay) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          reject(error);
        } else {
          resolve(info);
        }
      });
    }, delay);
  });
}

// Función para enviar correos en lotes
async function enviarCorreosEnLotes(usuarios, link) {
  const batchSize = 10;
  let delay = 0;

  for (let i = 0; i < usuarios.length; i += batchSize) {
    const batch = usuarios.slice(i, i + batchSize);

    let promises = batch.map((usuario, index) => {
      const userId = usuario[0];
      const email = usuario[1];

      // Generar contraseña aleatoria
      const contrasenaAleatoria = crypto.randomBytes(4).toString('hex'); // 8 caracteres

      // Actualizar la contraseña en la base de datos
      const updatePassword = async () => {
        const connection = await oracledb.getConnection(dbConfig);
        await connection.execute(
          `UPDATE USUARIOS SET CONTRASENA_US = :password WHERE ID_US = :userId`,
          [contrasenaAleatoria, userId]
        );
        await connection.commit();
        await connection.close();
      };

      // Configurar las opciones del correo
      const mailOptions = {
        from: 'emilionacato75@gmail.com',
        to: email,
        subject: 'Credenciales de Votación',
        text: `Hola, su ID de usuario es: ${userId}\nSu contraseña es: ${contrasenaAleatoria}\nY el enlace de votación es: ${link}`
      };

      // Enviar correo con un retardo de 10 segundos entre cada envío
      const enviarCorreo = enviarCorreoConRetardo(transporter, mailOptions, index * 10000);

      // Ejecutar la actualización de la contraseña y el envío del correo en paralelo
      return updatePassword().then(() => enviarCorreo);
    });

    await Promise.all(promises);

    // Esperar 2 minutos antes de enviar el siguiente lote de correos
    if (i + batchSize < usuarios.length) {
      await new Promise(resolve => setTimeout(resolve, 120000)); // 120000 ms = 2 minutos
    }
  }
}

// Función para manejar la solicitud de envío de credenciales
app.post('/enviar-credenciales', async (req, res) => {
  const { link } = req.body;

  try {
    const connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT ID_US, EMAIL_US FROM USUARIOS WHERE ID_ROL = 2 AND ESTADO_US = 1`
    );

    const usuarios = result.rows;

    await enviarCorreosEnLotes(usuarios, link);

    res.json({ success: true });
  } catch (error) {
    console.error('Error al enviar correos:', error);
    res.json({ success: false, message: 'Error al enviar correos' });
  }
});


// // Ruta para guardar configuración
// app.post('/guardar-configuracion', async (req, res) => {
//   const { periodo, numListas, fechaPublicacion } = req.body;
//   global.fechaPublicacion = fechaPublicacion;  // Asegúrate de usar el valor enviado
//   console.log('Fecha de publicación guardada:', global.fechaPublicacion);
//   res.json({ success: true });
// });

// app.get('/verificar-hora', (req, res) => {
//   const ahora = new Date();
//   res.send(`Hora actual del servidor: ${ahora}`);
// });

// app.get('/test-verificacion', verificarFechaYHora, (req, res) => {
//   res.send('Middleware de verificación de hora funcionando.');
// });

// async function verificarFechaYHora(req, res, next) {
//   const userId = req.body.username || req.query.username;
//   console.log('ID del usuario:', userId);

//   if (!userId) {
//     return res.status(400).send('ID de usuario no proporcionado.');
//   }

//   try {
//     const connection = await oracledb.getConnection(dbConfig);
//     console.log('Conexión a la base de datos establecida.');

//     const result = await connection.execute(
//       `SELECT ID_ROL FROM USUARIOS WHERE ID_US = :userId`,
//       [userId]
//     );

//     console.log('Resultado de la consulta:', result.rows);

//     if (result.rows.length > 0) {
//       const role = result.rows[0][0];
//       console.log('Rol del usuario:', role);

//       if (role !== 2) {
//         console.log('Rol no es 2, permitiendo acceso sin verificar hora.');
//         return next(); // Si no es rol 2, continuar sin aplicar la verificación de hora
//       }

//       console.log('Verificando hora para rol 2...');
//       const ahora = new Date();
//       const hora = ahora.getHours();
//       console.log('Hora actual:', hora);

//       // Verificar que la hora esté entre 7 am y 5 pm
//       if (hora < 13 || hora >= 17) {
//         console.log('Hora fuera del rango permitido.');
//         return res.status(403).send('Fuera del horario permitido para votar.');
//       }

//       console.log('Hora dentro del rango permitido.');
//       next(); // Permitir acceso si todo está bien
//     } else {
//       console.log('Usuario no encontrado.');
//       return res.status(403).send('Usuario no encontrado.');
//     }

//     await connection.close();
//   } catch (err) {
//     console.error('Error al verificar el rol:', err);
//     res.status(500).send('Error en el servidor');
//   }
// }


// // Aplicar el middleware a la ruta de votación
// app.get('/votacionADUFA', verificarFechaYHora, (req, res) => {
//   res.sendFile(path.join(__dirname, 'html', 'votacionADUFA.html'));
// });


// // Ruta para la página de configuración
// app.get('/configuracion', (req, res) => {
//   res.sendFile(path.join(__dirname, 'html', 'configuracion.html'));
// });

// Ruta para manejar la carga de archivosssss
app.post('/upload', upload.any(), (req, res) => {
  // console.log('req.body upload:', req.body);
  // console.log('req.files upload:', req.files);
  res.json({ message: 'Subida OK' });
});

// Ruta para el inicio de sesión
app.post('/login', async (req, res) => {
  const { username, password, periodo } = req.body;
  console.log(`Usuario: ${username}, Contraseña: ${password}, Periodo: ${periodo}`);

  if (!username || !password) {
    res.send('<script>alert("Usuario y contraseña son requeridos"); window.location.href="/";</script>');
    return;
  }

  try {
    const connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT ID_ROL, ESTADO_US FROM USUARIOS WHERE ID_US = :username AND CONTRASENA_US = :password`,
      [username, password]
    );

    if (result.rows.length > 0) {
      const [role, estado] = result.rows[0];

      if (estado === 0) {
        res.send('<script>alert("Su cuenta está inactiva. No tiene permiso para acceder."); window.location.href="/";</script>');
        await connection.close();
        return;
      }

      const usuario = username;
      console.log('Usuario autenticado:', { role });

      res.send(`
        <script>
          localStorage.setItem('rol', '${role}');
          localStorage.setItem('usuario', '${usuario}');

          if (${role} === 1) {
            window.location.href = '/html/configuracion.html';
          } else if (${role} === 2) {
            const storedPeriodo = localStorage.getItem('periodo');

            // Verificar si el nuevo periodo es diferente del almacenado
            if (storedPeriodo !== '${periodo}' && '${periodo}'.trim() !== '') {
              localStorage.setItem('periodo', '${periodo}');
            }

            const finalPeriodo = localStorage.getItem('periodo');
            if (!finalPeriodo || finalPeriodo.trim() === '') {
              alert("El periodo no se encuentra. Por favor, vuelva a intentarlo.");
              window.location.href = '/';
            } else {
              // Redirigir a votacionADUFA.html con el parámetro 'periodo' restaurado
              window.location.href = '/html/votacionADUFA.html?periodo=' + finalPeriodo;
            }
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
          const nombreApellido = candidato.split(', ');

          if (nombreApellido.length === 2) {  // Asegurarse de que haya un nombre y un apellido
            const cleanNombre = nombreApellido[0].trim();
            const cleanApellido = nombreApellido[1].trim();

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
            }
          } else {
            console.log(`El formato del candidato ${candidato} es incorrecto. Debe ser 'Nombre, Apellido'.`);
          }
        }
      }

      // Insertar vocales principales
      for (let i = 0; i < 3; i++) {
        const candidato = lista.vocalesPrincipales[i];

        if (candidato) {
          const nombreApellido = candidato.split(', ');

          if (nombreApellido.length === 2) {  // Asegurarse de que haya un nombre y un apellido
            const cleanNombre = nombreApellido[0].trim();
            const cleanApellido = nombreApellido[1].trim();

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
            }
          } else {
            console.log(`El formato del candidato ${candidato} es incorrecto. Debe ser 'Nombre, Apellido'.`);
          }
        }
      }

      // Insertar vocales suplentes
      for (let i = 0; i < 3; i++) {
        const candidato = lista.vocalesSuplentes[i];

        if (candidato) {
          const nombreApellido = candidato.split(', ');

          if (nombreApellido.length === 2) {  // Asegurarse de que haya un nombre y un apellido
            const cleanNombre = nombreApellido[0].trim();
            const cleanApellido = nombreApellido[1].trim();

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
            }
          } else {
            console.log(`El formato del candidato ${candidato} es incorrecto. Debe ser 'Nombre, Apellido'.`);
          }
        }
      }
    }

    await connection.commit();
    await connection.close();

    res.status(200).send('Datos guardados correctamente');
    console.log("Candidatos guardados en la base de datos");
  } catch (err) {
    console.error('Error al guardar los datos en la base de datos:', err);
    res.status(500).send('Error en el servidor');
  }
});


// console.log('Datos del formulario recibidos:', formData);


app.post('/guardar-votos', async (req, res) => {
  let connection;
  try {
    const { usuario, formData } = req.body;
    const period = formData.periodo;
    const id_lista = formData.idLista;
    const aceptaAuditoria = formData.aceptaAuditoria ? 1 : 0;

    // Construir el idVoto en el formato requerido
    const idVoto = `${id_lista}_${period}_${usuario}`;

    connection = await oracledb.getConnection(dbConfig);

    // Verificar si el votante ya existe en la tabla VOTANTES para el periodo actual
    const checkVotanteQuery = `SELECT ID_US FROM VOTANTES WHERE ID_US = :usuario AND PERIODO = :periodo`;
    const result = await connection.execute(checkVotanteQuery, [usuario, period]);

    if (result.rows.length === 0) {
      await connection.execute(
        `INSERT INTO VOTANTES (ID_US, ESTADO_VOT, PERIODO) VALUES (:usuario, 1, :periodo)`,
        [usuario, period]
      );
      console.log('Se ha insertado el votante en la tabla VOTANTES.');
    } else {
      console.log('El votante ya existe en la tabla VOTANTES para este periodo.');
    }

    // Inserción del voto en la tabla VOTOS
    const insertQuery = `INSERT INTO VOTOS (ID_LISTA, PERIODO_POSTULACION, ID_US, FECHA_VOTACION, ACEPTA_AUDITORIA)
                         VALUES (:idLista, :periodoPostulacion, :usuario, CURRENT_TIMESTAMP, :aceptaAuditoria)`;

    const insertNuloQuery = `INSERT INTO VOTOS (ID_LISTA, PERIODO_POSTULACION, ID_US, FECHA_VOTACION, ACEPTA_AUDITORIA)
                             VALUES ('nulo', :periodoPostulacion, :usuario, CURRENT_TIMESTAMP, :aceptaAuditoria)`;

    // Llamada a la Blockchain platform de OCI
    const credentials = Buffer.from('sebastianmogrovejo7@gmail.com:Emilio.*142002').toString('base64');
    const blockchainResponse = await axios.post('https://votoblockchain-4-bmogrovejog-iad.blockchain.ocp.oraclecloud.com:7443/restproxy/api/v2/channels/default/transactions', {
      chaincode: "data_synchronization_votos_v8",
      args: [
        "createVotosListas",
        JSON.stringify({
          idVoto: idVoto,
          idLista: id_lista,
          periodoPostulacion: period,
          idUs: usuario,
          fechaVotacion: new Date().toISOString(),
          aceptaAuditoria: aceptaAuditoria
        })
      ],
      timeout: 18000,
      sync: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}` // Autenticación por credenciales
      }
    });

    console.log('Blockchain response:', blockchainResponse.data);

    if (id_lista.toLowerCase() === 'nulo') {
      console.log("Se insertará voto nulo");
      await connection.execute(insertNuloQuery, [period, usuario, aceptaAuditoria]);
    } else {
      await connection.execute(insertQuery, [id_lista, period, usuario, aceptaAuditoria]);
    }

    await connection.commit();

    // Enviar correo de confirmación solo si el voto fue guardado correctamente
    const emailQuery = `SELECT EMAIL_US FROM USUARIOS WHERE ID_US = :usuario`;
    const emailResult = await connection.execute(emailQuery, [usuario]);
    const emailUsuario = emailResult.rows[0][0];

    const mailOptions = {
      from: 'emilionacato75@gmail.com',
      to: emailUsuario,
      subject: 'Confirmación de Voto Registrado',
      text: `Estimado(a) usuario,

  Le confirmamos que su voto ha sido registrado exitosamente en el período electoral "${period}".

  Gracias por participar en este proceso de elecciones.

  Saludos cordiales,

  Asociación de Docentes de las Fuerzas Armadas "ADUFA"`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error al enviar el correo de confirmación:', error);
      } else {
        console.log('Correo de confirmación enviado:', info.response);
      }
    });

    res.status(200).json({ message: 'Su voto fue guardado correctamente y se ha enviado un correo de confirmación.' });

  } catch (err) {
    console.error('Error al guardar los votos en la base de datos:', err);
    if (!res.headersSent) {
      res.status(500).send('Error en el servidor');
    }
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error al cerrar la conexión:', err);
      }
    }
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


// Ruta para obtener usuarios con id_rol = 2 y estado_us = 1
app.get('/api/usuarios', async (req, res) => {
  try {
    const connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT ID_US, NOMBRE_US, APELLIDO_US FROM USUARIOS WHERE ID_ROL = 2 AND ESTADO_US = 1`
    );

    const usuarios = result.rows.map(row => ({
      id: row[0],
      nombres: row[1],
      apellidos: row[2]
    }));

    res.json(usuarios);
    await connection.close();
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).send('Error al obtener usuarios');
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

app.get('/api/resultados/departamento', async (req, res) => {
  const periodo = req.query.periodo;

  try {
    const connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT U.DEPARTAMENTO_US AS nombre, COUNT(V.ID_US) AS votos
       FROM VOTOS V
       JOIN USUARIOS U ON V.ID_US = U.ID_US
       WHERE V.PERIODO_POSTULACION = :periodo
       GROUP BY U.DEPARTAMENTO_US`,
      [periodo]
    );

    const data = result.rows.map(row => ({
      nombre: row[0],
      votos: row[1]
    }));

    res.json(data);
    await connection.close();
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});

app.get('/api/auditoria', async (req, res) => {
  const { periodo } = req.query;

  if (!periodo) {
    return res.status(400).json({ message: 'Periodo es requerido' });
  }

  try {
    const connection = await oracledb.getConnection(dbConfig);

    // Consulta para obtener el total de votantes con id_rol = 2 y estado_us = 1
    const totalVotantesResult = await connection.execute(
      `SELECT COUNT(*) AS totalVotantes
       FROM USUARIOS
       WHERE ID_ROL = '2' AND ESTADO_US = '1'`
    );
    const totalVotantes = totalVotantesResult.rows[0][0];

    // Consulta para obtener el número de votantes que han votado en el periodo seleccionado (sin importar si aceptaron auditoría)
    const votantesQueHanVotadoResult = await connection.execute(
      `SELECT COUNT(DISTINCT v.ID_US) AS votantesQueHanVotado
       FROM VOTOS v
       JOIN USUARIOS u ON v.ID_US = u.ID_US
       WHERE v.PERIODO_POSTULACION = :periodo
       AND u.ID_ROL = '2'
       AND u.ESTADO_US = '1'`,
      [periodo]
    );
    const votantesQueHanVotado = votantesQueHanVotadoResult.rows[0][0];

    // Consulta para obtener los detalles de los votantes para la auditoría
    const usuariosAuditadosResult = await connection.execute(
      `SELECT u.ID_US AS id, u.NOMBRE_US AS nombre, u.APELLIDO_US AS apellido, u.DEPARTAMENTO_US AS departamento,
              CASE
                WHEN v.ID_US IS NOT NULL AND v.ACEPTA_AUDITORIA = 1 THEN 'SI'
                ELSE 'NO'
              END AS haVotado
       FROM USUARIOS u
       LEFT JOIN VOTOS v ON u.ID_US = v.ID_US
       AND v.PERIODO_POSTULACION = :periodo
       WHERE u.ID_ROL = '2'
       AND u.ESTADO_US = '1'
       AND (v.ACEPTA_AUDITORIA = 1 OR v.ID_US IS NULL)`, // Solo mostrar si aceptaron la auditoría o si aún no han votado
      [periodo]
    );

    const usuariosAuditados = usuariosAuditadosResult.rows.map(row => ({
      id: row[0],
      nombre: row[1],
      apellido: row[2],
      departamento: row[3],
      haVotado: row[4] === 'SI',
    }));

    // Enviar la respuesta al frontend
    res.json({
      totalVotantes,
      votantesQueHanVotado,
      usuariosAuditados,
    });

    await connection.close();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

// Agregar nueva ruta para obtener resultados desde blockchain
app.get('/api/resultados/blockchain', async (req, res) => {
  const periodo = req.query.periodo;
  const filterType = req.query.filterType || 'lista';
  console.log(`Consultando votos por ${filterType} para periodo: ${periodo}`);

  try {
    const credentials = Buffer.from('sebastianmogrovejo7@gmail.com:Emilio.*142002').toString('base64');
    const blockchainResponse = await axios.post('https://votoblockchain-4-bmogrovejog-iad.blockchain.ocp.oraclecloud.com:7443/restproxy/api/v2/channels/default/transactions', {
      chaincode: "data_synchronization_votos_v8",
      args: [
        "getVotesByRange",
        "",
        "z"
      ],
      timeout: 18000,
      sync: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`
      }
    });

    if (blockchainResponse.data.returnCode !== 'Success') {
      throw new Error(blockchainResponse.data.error || 'Error al obtener datos de blockchain');
    }

    const votosBlockchain = blockchainResponse.data.result.payload;
    const votosPeriodo = votosBlockchain.filter(voto => voto.periodoPostulacion === periodo);
    
    let resultados;
    
    if (filterType === 'lista') {
      // Agrupar votos por lista
      resultados = votosPeriodo.reduce((acc, voto) => {
        const idLista = voto.idLista;
        acc[idLista] = (acc[idLista] || 0) + 1;
        return acc;
      }, {});

      // Convertir a formato esperado por el frontend
      const resultadosFormateados = Object.entries(resultados).map(([idLista, votos]) => ({
        nombre: idLista,
        votos: votos
      }));

      // Agregar voto nulo si existe
      if (resultados['NULO']) {
        resultadosFormateados.push({
          nombre: 'NULO',
          votos: resultados['NULO']
        });
      }

      // Identificar lista ganadora
      if (resultadosFormateados.length > 0) {
        const ganadora = resultadosFormateados.reduce((max, lista) => 
          lista.votos > max.votos ? lista : max
        );
        console.log(`Lista ganadora: ${ganadora.nombre} con ${ganadora.votos} votos`);
      }

      res.json(resultadosFormateados);

    } else if (filterType === 'departamento') {
      // Necesitamos obtener el departamento de cada usuario que votó
      const connection = await oracledb.getConnection(dbConfig);
      
      try {
        const departamentos = {};
        
        for (const voto of votosPeriodo) {
          const userResult = await connection.execute(
            `SELECT DEPARTAMENTO_US FROM USUARIOS WHERE ID_US = :idUs AND ESTADO_US = '1'`,
            [voto.idUs]
          );
          
          if (userResult.rows.length > 0) {
            const departamento = userResult.rows[0][0];
            departamentos[departamento] = (departamentos[departamento] || 0) + 1;
          }
        }

        const resultadosFormateados = Object.entries(departamentos).map(([departamento, votos]) => ({
          nombre: departamento,
          votos: votos
        }));

        res.json(resultadosFormateados);
      } finally {
        await connection.close();
      }
    }

  } catch (err) {
    console.error('Error al obtener resultados de blockchain:', err);
    if (err.response && err.response.data) {
      console.error('Detalles del error:', err.response.data);
    }
    res.status(500).json({
      message: 'Error al obtener los resultados de blockchain',
      error: err.response?.data || err.message
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Aplicación escuchando en http://0.0.0.0:${PORT}`);
});
