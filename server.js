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
const sharp = require('sharp');

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

// Validación de archivos
const fileFilter = (req, file, cb) => {
  // Verificar el tipo de archivo
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Solo se permiten archivos de imagen'), false);
  }

  // Verificar la extensión
  const validExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!validExtensions.includes(ext)) {
    return cb(new Error('Formato de imagen no válido. Use: JPG, JPEG, PNG o GIF'), false);
  }

  cb(null, true);
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
    files: 20 // máximo 20 archivos
  },
  fileFilter: fileFilter
});

app.post('/uploadProvisionales', upload.any(), async (req, res) => {
  try {
    console.log('Archivos recibidos:', req.files);

    if (!req.files || req.files.length === 0) {
      console.error('No se subieron archivos');
      return res.status(400).json({ 
        success: false, 
        message: 'No se subieron archivos' 
      });
    }

    // Verificar tamaño de cada archivo
    const filesWithErrors = req.files.filter(file => file.size > 5 * 1024 * 1024);
    if (filesWithErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Algunos archivos exceden el tamaño máximo permitido (5MB)',
        files: filesWithErrors.map(f => f.originalname)
      });
    }

    // Procesar y redimensionar cada imagen
    for (const file of req.files) {
      try {
        const tempPath = file.path + '.tmp';
        await sharp(file.path)
          .resize(120, 144, {
            fit: 'cover',
            position: 'center'
          })
          .toFormat('png')
          .toFile(tempPath);

        // En Windows, primero intentamos renombrar el archivo temporal
        try {
          fs.renameSync(tempPath, file.path);
        } catch (renameErr) {
          // Si falla el renombre, copiamos el contenido y luego eliminamos
          fs.copyFileSync(tempPath, file.path);
          fs.unlinkSync(tempPath);
        }
      } catch (err) {
        console.error(`Error al procesar la imagen ${file.originalname}:`, err);
      }
    }

    // Si todo está bien, envía una respuesta de éxito
    res.status(200).json({ 
      success: true, 
      message: 'Imágenes procesadas y guardadas correctamente.' 
    });
  } catch (error) {
    console.error('Error al procesar archivos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al procesar los archivos',
      error: error.message 
    });
  }
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
//   password: 'Emilio.*142002',
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


// Ruta para guardar configuración
app.post('/guardar-configuracion', async (req, res) => {
  const { periodo, numListas, fechaPublicacion, horaInicio, horaFin } = req.body;

  console.log('Datos recibidos para configuración:', { periodo, numListas, fechaPublicacion, horaInicio, horaFin });

  try {
    const connection = await oracledb.getConnection(dbConfig);
    
    // Asegúrate de que los valores no sean undefined
    if (!fechaPublicacion || !horaInicio || !horaFin) {
      console.error('Faltan datos en la configuración:', { fechaPublicacion, horaInicio, horaFin });
      return res.status(400).json({ success: false, message: 'Faltan datos en la configuración.' });
    }

    // Convertir la fecha a un objeto Date
    const fecha = new Date(fechaPublicacion);
    const fechaOracle = fecha.toISOString().split('T')[0]; // Formato YYYY-MM-DD

    // Insertar en la tabla CONFIGURACION_VOTACION
    await connection.execute(
      `INSERT INTO CONFIGURACION_VOTACION (PERIODO_POSTULACION, FECHA_PUBLICACION, HORA_INICIO, HORA_FIN) 
       VALUES (:periodo, TO_DATE(:fechaPublicacion, 'YYYY-MM-DD'), :horaInicio, :horaFin)`,
      {
        periodo: periodo,
        fechaPublicacion: fechaOracle,
        horaInicio: horaInicio,
        horaFin: horaFin
      }
    );

    console.log('Configuración guardada:', { periodo, fechaPublicacion, horaInicio, horaFin });
    await connection.commit(); // Asegúrate de hacer commit después de la inserción
    res.json({ success: true });
  } catch (error) {
    console.error('Error al guardar la configuración:', error);
    res.status(500).json({ success: false, message: 'Error al guardar la configuración.' });
  }
});

// app.get('/verificar-hora', (req, res) => {
//   const ahora = new Date();
//   res.send(`Hora actual del servidor: ${ahora}`);
// });

// app.get('/test-verificacion', verificarFechaYHora, (req, res) => {
//   res.send('Middleware de verificación de hora funcionando.');
// });

async function verificarFechaYHora(req, res, next) {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    
    // Obtener la fecha y hora actual de Oracle en la zona horaria de US East (Ashburn)
    const timeResult = await connection.execute(
      `SELECT 
        TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York', 'DD/MM/YYYY') as fecha_actual,
        TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York', 'HH24:MI') as hora_actual
       FROM DUAL`
    );

    const fechaActual = timeResult.rows[0][0];
    const horaActual = timeResult.rows[0][1];

    console.log('Fecha actual Oracle (US East):', fechaActual);
    console.log('Hora actual Oracle (US East):', horaActual);

    // Obtener configuración de votación
    const { periodo } = req.query;
    const configResult = await connection.execute(
      `SELECT 
        TO_CHAR(FECHA_PUBLICACION, 'DD/MM/YYYY') as fecha_votacion,
        HORA_INICIO,
        HORA_FIN
       FROM CONFIGURACION_VOTACION 
       WHERE PERIODO_POSTULACION = :periodo`,
      [periodo]
    );

    if (configResult.rows.length === 0) {
      return res.json({ 
        puedeVotar: false, 
        mensaje: 'No se encontró configuración para el periodo especificado.' 
      });
    }

    const fechaVotacion = configResult.rows[0][0];
    const horaInicio = configResult.rows[0][1];
    const horaFin = configResult.rows[0][2];

    console.log('Fecha votación:', fechaVotacion);
    console.log('Hora inicio:', horaInicio);
    console.log('Hora fin:', horaFin);

    // Convertir fechas a objetos Date para comparación
    const [diaVot, mesVot, anioVot] = fechaVotacion.split('/');
    const fechaVotObj = new Date(anioVot, mesVot - 1, diaVot);
    
    const [diaAct, mesAct, anioAct] = fechaActual.split('/');
    const fechaActObj = new Date(anioAct, mesAct - 1, diaAct);

    // Convertir horas a minutos para comparación
    const [horaActualHH, horaActualMM] = horaActual.split(':').map(Number);
    let minutosActuales = horaActualHH * 60 + horaActualMM;

    const [horaInicioHH, horaInicioMM] = horaInicio.split(':').map(Number);
    const minutosInicio = horaInicioHH * 60 + horaInicioMM;

    const [horaFinHH, horaFinMM] = horaFin.split(':').map(Number);
    let minutosFinVotacion = horaFinHH * 60 + horaFinMM;

    // Si la hora de fin es menor que la hora de inicio, significa que es del día siguiente
    if (minutosFinVotacion < minutosInicio) {
        minutosFinVotacion += 24 * 60; // Agregar 24 horas en minutos
        // Si la hora actual es menor que la hora de inicio, también debe ajustarse
        if (minutosActuales < minutosInicio) {
            minutosActuales += 24 * 60;
        }
    }

    console.log('Fecha votación:', fechaVotacion);
    console.log('Fecha actual:', fechaActual);
    console.log('Hora actual:', horaActual);
    console.log('Hora inicio:', horaInicio);
    console.log('Hora fin:', horaFin);
    console.log('Minutos actuales (ajustados):', minutosActuales);
    console.log('Rango permitido:', minutosInicio, 'a', minutosFinVotacion);

    // Verificar si estamos en el día correcto
    const esHoy = fechaActObj.getFullYear() === fechaVotObj.getFullYear() &&
                 fechaActObj.getMonth() === fechaVotObj.getMonth() &&
                 fechaActObj.getDate() === fechaVotObj.getDate();
    
    // Si la hora de fin es del día siguiente, también debemos permitir votar si es el día siguiente
    const esDiaSiguiente = !esHoy && 
                          fechaActObj.getTime() === fechaVotObj.getTime() + 24 * 60 * 60 * 1000 &&
                          minutosActuales < minutosFinVotacion - 24 * 60;
    
    const estaEnHorario = minutosActuales >= minutosInicio && minutosActuales <= minutosFinVotacion;

    await connection.close();

    if (!esHoy && !esDiaSiguiente) {
      return res.json({ 
        puedeVotar: false, 
        mensaje: `La votación está programada para el ${fechaVotacion}.\nHorario de votación: ${horaInicio} a ${horaFin}.\n\nPor favor, ingrese nuevamente en la fecha y hora indicadas.` 
      });
    }

    if (!estaEnHorario) {
      return res.json({ 
        puedeVotar: false, 
        mensaje: `El horario de votación es de ${horaInicio} a ${horaFin}${minutosFinVotacion > 24 * 60 ? ' del día siguiente' : ''}.\nPor favor, ingrese nuevamente dentro del horario establecido.` 
      });
    }

    // Si llegamos aquí, significa que estamos en el día correcto y dentro del horario
    res.json({ 
      puedeVotar: true, 
      mensaje: 'Puede proceder con la votación.' 
    });

  } catch (error) {
    console.error('Error al verificar fecha y hora:', error);
    return res.status(500).json({ 
      puedeVotar: false, 
      mensaje: 'Error al verificar la fecha y hora de votación.' 
    });
  }
}


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
  let connection;

  try {
    console.log('Iniciando guardado de candidatos...');
    console.log('Datos recibidos:', JSON.stringify(formData, null, 2));

    connection = await oracledb.getConnection(dbConfig);
    
    // Guardar la configuración de la votación
    const { periodo, fechaPublicacion, horaInicio, horaFin } = formData;

    console.log('Datos de configuración:', { periodo, fechaPublicacion, horaInicio, horaFin });

    // Verificar si ya existe la configuración para este periodo
    const configExiste = await connection.execute(
      `SELECT COUNT(*) FROM CONFIGURACION_VOTACION WHERE PERIODO_POSTULACION = :periodo`,
      [periodo]
    );

    if (configExiste.rows[0][0] === 0) {
      // Formatear la fecha para Oracle
      const [year, month, day] = fechaPublicacion.split('-');
      const fechaFormateada = `${day}/${month}/${year}`;

      console.log('Insertando configuración:', {
        periodo,
        fechaPublicacion,
        fechaFormateada,
        horaInicio,
        horaFin
      });

      // Insertar en la tabla CONFIGURACION_VOTACION usando TO_DATE con el formato correcto
      await connection.execute(
        `INSERT INTO CONFIGURACION_VOTACION (PERIODO_POSTULACION, FECHA_PUBLICACION, HORA_INICIO, HORA_FIN) 
         VALUES (:periodo, TO_DATE(:fechaPublicacion, 'DD/MM/YYYY'), :horaInicio, :horaFin)`,
        {
          periodo: periodo,
          fechaPublicacion: fechaFormateada,
          horaInicio: horaInicio,
          horaFin: horaFin
        }
      );

      console.log('Configuración guardada exitosamente');
    } else {
      console.log('La configuración ya existe para este periodo');
    }

    // Verificar si ya existe el registro nulo para este periodo
    const checkNuloResult = await connection.execute(
      `SELECT COUNT(*) FROM LISTAS WHERE ID_LISTA = 'nulo' AND PERIODO_POSTULACION = :periodo`,
      [periodo]
    );

    // Solo insertar nulo si no existe
    if (checkNuloResult.rows[0][0] === 0) {
      await connection.execute(
        `INSERT INTO LISTAS (ID_LISTA, PERIODO_POSTULACION, ESTADO_LISTA, NOMBRE_LISTA)
         VALUES ('nulo', :periodo, 1, 'nulo')`,
        [periodo]
      );
      console.log("Lista nulo guardada");
    }

    // Verificar si ya existe el registro blanco para este periodo
    const checkBlancoResult = await connection.execute(
      `SELECT COUNT(*) FROM LISTAS WHERE ID_LISTA = 'blanco' AND PERIODO_POSTULACION = :periodo`,
      [periodo]
    );

    // Solo insertar blanco si no existe
    if (checkBlancoResult.rows[0][0] === 0) {
      await connection.execute(
        `INSERT INTO LISTAS (ID_LISTA, PERIODO_POSTULACION, ESTADO_LISTA, NOMBRE_LISTA)
         VALUES ('blanco', :periodo, 1, 'blanco')`,
        [periodo]
      );
      console.log("Lista blanco guardada");
    }

    // Procesar cada lista
    for (const [index, lista] of formData.listas.entries()) {
      const id_lista = `LISTA${index + 1}`;
      console.log(`Procesando ${id_lista}:`, lista);
      
      // Verificar si la lista ya existe
      const listaExiste = await connection.execute(
        `SELECT COUNT(*) FROM LISTAS WHERE ID_LISTA = :id_lista AND PERIODO_POSTULACION = :periodo`,
        [id_lista, periodo]
      );

      if (listaExiste.rows[0][0] === 0) {
        // Insertar la lista
        await connection.execute(
          `INSERT INTO LISTAS (ID_LISTA, PERIODO_POSTULACION, ESTADO_LISTA, NOMBRE_LISTA)
           VALUES (:id_lista, :periodo, 1, :nombre_lista)`,
          {
            id_lista: id_lista,
            periodo: periodo,
            nombre_lista: lista.nombreLista
          }
        );
        console.log(`Lista ${id_lista} guardada`);

        // Procesar candidatos de la lista
        const dignidades = {
          presidente: lista.presidente,
          vicepresidente: lista.vicepresidente,
          secretario: lista.secretario,
          tesorero: lista.tesorero,
          sindico: lista.sindico
        };

        // Insertar candidatos principales
        for (const [dignidad, id_us] of Object.entries(dignidades)) {
          if (id_us) {
            console.log(`Insertando candidato para ${dignidad}:`, id_us);
            await connection.execute(
              `INSERT INTO CANDIDATOS (ID_US, ID_LISTA, PERIODO_POSTULACION, DIGNIDAD_CAND, ESTADO_CAND)
               VALUES (:id_us, :id_lista, :periodo, :dignidad, 1)`,
              {
                id_us: id_us,
                id_lista: id_lista,
                periodo: periodo,
                dignidad: dignidad
              }
            );
          }
        }

        // Insertar vocales principales
        for (let i = 0; i < lista.vocalesPrincipales.length; i++) {
          const id_us = lista.vocalesPrincipales[i];
          if (id_us) {
            console.log(`Verificando vocal principal ${i + 1}:`, id_us);
            // Verificar si el candidato ya existe
            const candidatoExiste = await connection.execute(
              `SELECT COUNT(*) FROM CANDIDATOS 
               WHERE ID_US = :id_us 
               AND ID_LISTA = :id_lista 
               AND PERIODO_POSTULACION = :periodo`,
              [id_us, id_lista, periodo]
            );

            if (candidatoExiste.rows[0][0] === 0) {
              console.log(`Insertando vocal principal ${i + 1}:`, id_us);
              await connection.execute(
                `INSERT INTO CANDIDATOS (ID_US, ID_LISTA, PERIODO_POSTULACION, DIGNIDAD_CAND, ESTADO_CAND)
                 VALUES (:id_us, :id_lista, :periodo, :dignidad, 1)`,
                {
                  id_us: id_us,
                  id_lista: id_lista,
                  periodo: periodo,
                  dignidad: `vocalPrincipal${i + 1}`
                }
              );
            } else {
              console.log(`El candidato ${id_us} ya existe en esta lista y periodo`);
            }
          }
        }

        // Insertar vocales suplentes
        for (let i = 0; i < lista.vocalesSuplentes.length; i++) {
          const id_us = lista.vocalesSuplentes[i];
          if (id_us) {
            console.log(`Verificando vocal suplente ${i + 1}:`, id_us);
            // Verificar si el candidato ya existe
            const candidatoExiste = await connection.execute(
              `SELECT COUNT(*) FROM CANDIDATOS 
               WHERE ID_US = :id_us 
               AND ID_LISTA = :id_lista 
               AND PERIODO_POSTULACION = :periodo`,
              [id_us, id_lista, periodo]
            );

            if (candidatoExiste.rows[0][0] === 0) {
              console.log(`Insertando vocal suplente ${i + 1}:`, id_us);
              await connection.execute(
                `INSERT INTO CANDIDATOS (ID_US, ID_LISTA, PERIODO_POSTULACION, DIGNIDAD_CAND, ESTADO_CAND)
                 VALUES (:id_us, :id_lista, :periodo, :dignidad, 1)`,
                {
                  id_us: id_us,
                  id_lista: id_lista,
                  periodo: periodo,
                  dignidad: `vocalSuplente${i + 1}`
                }
              );
            } else {
              console.log(`El candidato ${id_us} ya existe en esta lista y periodo`);
            }
          }
        }
      } else {
        console.log(`La lista ${id_lista} ya existe para este periodo`);
      }
    }

    await connection.commit();
    console.log("Todos los datos guardados correctamente");
    res.status(200).send('Datos guardados correctamente');
  } catch (error) {
    console.error('Error al guardar los datos:', error);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error al hacer rollback:', rollbackError);
      }
    }
    res.status(500).send('Error al guardar los datos: ' + error.message);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('Error al cerrar la conexión:', closeError);
      }
    }
  }
});


// console.log('Datos del formulario recibidos:', formData);


app.post('/guardar-votos', async (req, res) => {
  let connection;
  try {
    const { usuario, formData } = req.body;
    const period = formData.periodo;
    const id_lista = formData.idLista;
    const nombreLista = formData.nombreLista;
    const aceptaAuditoria = formData.aceptaAuditoria ? 1 : 0;

    // Construir el idVoto en el formato requerido
    const idVoto = `${id_lista}_${period}_${usuario}`;

    connection = await oracledb.getConnection(dbConfig);

    // Verificar si el usuario existe y está activo
    const userCheckQuery = `SELECT ID_US FROM USUARIOS WHERE ID_US = :usuario AND ESTADO_US = 1`;
    const userResult = await connection.execute(userCheckQuery, [usuario]);

    if (userResult.rows.length === 0) {
      throw new Error('Usuario no encontrado o inactivo');
    }

    // Verificar si el votante ya existe en la tabla VOTANTES para el periodo actual
    const checkVotanteQuery = `
      SELECT ID_US 
      FROM VOTANTES 
      WHERE ID_US = :usuario 
      AND PERIODO = :periodo`;
    
    const result = await connection.execute(checkVotanteQuery, [usuario, period]);

    if (result.rows.length === 0) {
      // Insertar nuevo registro en VOTANTES
      await connection.execute(
        `INSERT INTO VOTANTES (ID_US, ESTADO_VOT, PERIODO) 
         VALUES (:usuario, 1, :periodo)`,
        [usuario, period]
      );
      console.log('Votante registrado correctamente.');
    } else {
      // Verificar si ya votó
      const checkVotoQuery = `
        SELECT COUNT(*) 
        FROM VOTOS 
        WHERE ID_US = :usuario 
        AND PERIODO_POSTULACION = :periodo`;
      
      const votoResult = await connection.execute(checkVotoQuery, [usuario, period]);
      
      if (votoResult.rows[0][0] > 0) {
        throw new Error('El usuario ya ha votado en este periodo');
      }
    }

    // Inserción del voto en la tabla VOTOS
     const insertQuery = `
      INSERT INTO VOTOS (ID_LISTA, PERIODO_POSTULACION, ID_US, FECHA_VOTACION, ACEPTA_AUDITORIA)
      VALUES (:idLista, :periodoPostulacion, :usuario, CURRENT_TIMESTAMP, :aceptaAuditoria)`;

    await connection.execute(insertQuery, [id_lista, period, usuario, aceptaAuditoria]);

    // Llamada a la Blockchain platform de OCI
    const credentials = Buffer.from('sebastianmogrovejo7@gmail.com:Emilio.*142002').toString('base64');
    const blockchainResponse = await axios.post('https://votoblockchain-4-bmogrovejog-iad.blockchain.ocp.oraclecloud.com:7443/restproxy/api/v2/channels/default/transactions', {
      chaincode: "data_synchronization_votos_v9",
      args: [
        "createVotosListas",
        JSON.stringify({
          idVoto: idVoto,
          idLista: id_lista,
          nombreLista: nombreLista,
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
        'Authorization': `Basic ${credentials}`
      }
    });

    console.log('Blockchain response:', blockchainResponse.data);

    await connection.commit();

    // Enviar correo de confirmación
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
    console.error('Error al guardar los votos:', err);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error al hacer rollback:', rollbackError);
      }
    }
    res.status(500).json({ 
      error: true, 
      message: err.message || 'Error al procesar el voto' 
    });
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
  const { periodo } = req.query;
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);
    
    const result = await connection.execute(
      `SELECT 
        c.ID_LISTA as idLista,
        c.DIGNIDAD_CAND as dignidadCand,
        u.NOMBRE_US || ' ' || u.APELLIDO_US as nombreCompleto,
        l.NOMBRE_LISTA as nombreLista
       FROM CANDIDATOS c
       JOIN USUARIOS u ON c.ID_US = u.ID_US
       JOIN LISTAS l ON c.ID_LISTA = l.ID_LISTA AND c.PERIODO_POSTULACION = l.PERIODO_POSTULACION
       WHERE c.PERIODO_POSTULACION = :periodo
       AND c.ESTADO_CAND = 1
       ORDER BY c.ID_LISTA, c.DIGNIDAD_CAND`,
      [periodo],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Procesar los resultados para asegurar que los caracteres especiales se manejen correctamente
    const candidatos = result.rows.map(row => ({
      idLista: row.IDLISTA,
      dignidadCand: row.DIGNIDADCAND,
      nombreCompleto: row.NOMBRECOMPLETO,
      nombreLista: row.NOMBRELISTA
    }));

    res.json(candidatos);
  } catch (error) {
    console.error('Error al obtener candidatos:', error);
    res.status(500).json({ error: 'Error al obtener los candidatos' });
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
  const { periodo } = req.query;
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT 
        u.DEPARTAMENTO_US as departamento,
        COUNT(*) as total_votos,
        v.ID_LISTA as id_lista,
        l.NOMBRE_LISTA as nombre_lista
       FROM VOTOS v
       JOIN USUARIOS u ON v.ID_US = u.ID_US
       JOIN LISTAS l ON v.ID_LISTA = l.ID_LISTA AND v.PERIODO_POSTULACION = l.PERIODO_POSTULACION
       WHERE v.PERIODO_POSTULACION = :periodo
       GROUP BY u.DEPARTAMENTO_US, v.ID_LISTA, l.NOMBRE_LISTA
       ORDER BY u.DEPARTAMENTO_US, v.ID_LISTA`,
      [periodo],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Agrupar los resultados por departamento
    const votosPorDepartamento = result.rows.reduce((acc, row) => {
      const departamento = row.DEPARTAMENTO;
      if (!acc[departamento]) {
        acc[departamento] = {
          nombre: departamento,
          votos: 0,
          detalles: []
        };
      }
      acc[departamento].votos += row.TOTAL_VOTOS;
      acc[departamento].detalles.push({
        lista: `${row.ID_LISTA} - ${row.NOMBRE_LISTA}`,
        votos: row.TOTAL_VOTOS
      });
      return acc;
    }, {});

    // Convertir a array para la respuesta
    const resultado = Object.values(votosPorDepartamento);
    res.json(resultado);

  } catch (error) {
    console.error('Error al obtener resultados por departamento:', error);
    res.status(500).json({ error: 'Error al obtener los resultados por departamento' });
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

// Código anterior usando base de datos (comentado para referencia futura)
/*
app.get('/api/resultados', async (req, res) => {
  const periodo = req.query.periodo;

  try {
    const connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT L.ID_LISTA AS nombre, COUNT(V.ID_VOTO) AS votos
       FROM LISTAS L
       LEFT JOIN VOTOS V ON L.ID_LISTA = V.ID_LISTA AND V.PERIODO_POSTULACION = :periodo
       WHERE L.ESTADO_LISTA = 1
       GROUP BY L.ID_LISTA
       ORDER BY votos DESC`,
      [periodo]
    );

    const votosNulos = await connection.execute(
      `SELECT COUNT(*) AS votos
       FROM VOTOS
       WHERE ID_LISTA = 'NULO' AND PERIODO_POSTULACION = :periodo`,
      [periodo]
    );

    const data = result.rows.map(row => ({
      nombre: row[0],
      votos: row[1]
    }));

    if (votosNulos.rows[0][0] > 0) {
      data.push({
        nombre: 'NULO',
        votos: votosNulos.rows[0][0]
      });
    }

    res.json(data);
    await connection.close();
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});
*/

// Agregar nueva ruta para obtener resultados desde blockchain
app.get('/api/resultados/blockchain', async (req, res) => {
  try {
    const { periodo } = req.query;
    console.log('Consultando votos por lista para periodo:', periodo);

    const credentials = Buffer.from('sebastianmogrovejo7@gmail.com:Emilio.*142002').toString('base64');
    
    const blockchainResponse = await axios.post(
      'https://votoblockchain-4-bmogrovejog-iad.blockchain.ocp.oraclecloud.com:7443/restproxy/api/v2/channels/default/transactions',
      {
        chaincode: "data_synchronization_votos_v9",
        args: ["getVotesByRange", "", "z"],
        timeout: 18000,
        sync: true
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        }
      }
    );

    if (blockchainResponse.data.returnCode === 'Success') {
      const votos = blockchainResponse.data.result.payload;
      // Filtrar votos por periodo y agrupar por lista
      const votosPorLista = votos
        .filter(voto => voto.periodoPostulacion === periodo)
        .reduce((acc, voto) => {
          const idLista = voto.idLista;
          if (!acc[idLista]) {
            acc[idLista] = {
              nombre: voto.nombreLista,
              votos: 0
            };
          }
          acc[idLista].votos++;
          return acc;
        }, {});

      // Asegurarnos que existan las entradas para votos nulos y blancos
      if (!votosPorLista['nulo']) {
        votosPorLista['nulo'] = {
          nombre: 'nulo',
          votos: 0
        };
      }
      if (!votosPorLista['blanco']) {
        votosPorLista['blanco'] = {
          nombre: 'blanco',
          votos: 0
        };
      }

      // Convertir a array para la respuesta
      const resultado = Object.entries(votosPorLista)
        .filter(([id]) => id !== 'nulo' && id !== 'blanco') // Filtrar temporalmente nulos y blancos
        .map(([_, data]) => data); // Convertir solo las listas normales

      // Agregar nulos y blancos al final
      resultado.push(votosPorLista['nulo']);
      resultado.push(votosPorLista['blanco']);

      res.json(resultado);
    } else {
      throw new Error(blockchainResponse.data.error || 'Error desconocido en la blockchain');
    }
  } catch (error) {
    console.error('Error al obtener resultados de blockchain:', error);
    console.error('Detalles del error:', error.response?.data);
    res.status(500).json({ error: 'Error al obtener resultados de la blockchain' });
  }
});

app.get('/verificar-horario', async (req, res) => {
  const { periodo } = req.query;
  
  try {
    const connection = await oracledb.getConnection(dbConfig);
    
    // Obtener la fecha y hora actual de Oracle en la zona horaria de US East (Ashburn)
    const timeResult = await connection.execute(
      `SELECT 
        TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York', 'DD/MM/YYYY') as fecha_actual,
        TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York', 'HH24:MI') as hora_actual
       FROM DUAL`
    );

    const fechaActual = timeResult.rows[0][0];
    const horaActual = timeResult.rows[0][1];

    console.log('Fecha actual Oracle (US East):', fechaActual);
    console.log('Hora actual Oracle (US East):', horaActual);

    // Obtener configuración de votación
    const configResult = await connection.execute(
      `SELECT 
        TO_CHAR(FECHA_PUBLICACION, 'DD/MM/YYYY') as fecha_votacion,
        HORA_INICIO,
        HORA_FIN
       FROM CONFIGURACION_VOTACION 
       WHERE PERIODO_POSTULACION = :periodo`,
      [periodo]
    );

    if (configResult.rows.length === 0) {
      return res.json({ 
        puedeVotar: false, 
        mensaje: 'No se encontró configuración para este periodo de votación.' 
      });
    }

    const fechaVotacion = configResult.rows[0][0];
    const horaInicio = configResult.rows[0][1];
    const horaFin = configResult.rows[0][2];

    // Convertir fechas a objetos Date para comparación
    const [diaVot, mesVot, anioVot] = fechaVotacion.split('/');
    const fechaVotObj = new Date(anioVot, mesVot - 1, diaVot);
    
    const [diaAct, mesAct, anioAct] = fechaActual.split('/');
    const fechaActObj = new Date(anioAct, mesAct - 1, diaAct);

    // Convertir horas a minutos para comparación
    const [horaActualHH, horaActualMM] = horaActual.split(':').map(Number);
    let minutosActuales = horaActualHH * 60 + horaActualMM;

    const [horaInicioHH, horaInicioMM] = horaInicio.split(':').map(Number);
    const minutosInicio = horaInicioHH * 60 + horaInicioMM;

    const [horaFinHH, horaFinMM] = horaFin.split(':').map(Number);
    let minutosFinVotacion = horaFinHH * 60 + horaFinMM;

    // Si la hora de fin es menor que la hora de inicio, significa que es del día siguiente
    if (minutosFinVotacion < minutosInicio) {
        minutosFinVotacion += 24 * 60; // Agregar 24 horas en minutos
        // Si la hora actual es menor que la hora de inicio, también debe ajustarse
        if (minutosActuales < minutosInicio) {
            minutosActuales += 24 * 60;
        }
    }

    console.log('Fecha votación:', fechaVotacion);
    console.log('Fecha actual:', fechaActual);
    console.log('Hora actual:', horaActual);
    console.log('Hora inicio:', horaInicio);
    console.log('Hora fin:', horaFin);
    console.log('Minutos actuales (ajustados):', minutosActuales);
    console.log('Rango permitido:', minutosInicio, 'a', minutosFinVotacion);

    // Verificar si estamos en el día correcto
    const esHoy = fechaActObj.getFullYear() === fechaVotObj.getFullYear() &&
                 fechaActObj.getMonth() === fechaVotObj.getMonth() &&
                 fechaActObj.getDate() === fechaVotObj.getDate();
    
    // Si la hora de fin es del día siguiente, también debemos permitir votar si es el día siguiente
    const esDiaSiguiente = !esHoy && 
                          fechaActObj.getTime() === fechaVotObj.getTime() + 24 * 60 * 60 * 1000 &&
                          minutosActuales < minutosFinVotacion - 24 * 60;
    
    const estaEnHorario = minutosActuales >= minutosInicio && minutosActuales <= minutosFinVotacion;

    await connection.close();

    if (!esHoy && !esDiaSiguiente) {
      return res.json({ 
        puedeVotar: false, 
        mensaje: `La votación está programada para el ${fechaVotacion}.\nHorario de votación: ${horaInicio} a ${horaFin}.\n\nPor favor, ingrese nuevamente en la fecha y hora indicadas.` 
      });
    }

    if (!estaEnHorario) {
      return res.json({ 
        puedeVotar: false, 
        mensaje: `El horario de votación es de ${horaInicio} a ${horaFin}${minutosFinVotacion > 24 * 60 ? ' del día siguiente' : ''}.\nPor favor, ingrese nuevamente dentro del horario establecido.` 
      });
    }

    // Si llegamos aquí, significa que estamos en el día correcto y dentro del horario
    res.json({ 
      puedeVotar: true, 
      mensaje: 'Puede proceder con la votación.' 
    });

  } catch (error) {
    console.error('Error al verificar horario:', error);
    res.status(500).json({ 
      puedeVotar: false, 
      mensaje: 'Error al verificar el horario de votación.' 
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Nuevo endpoint para obtener nombres completos de usuarios
app.post('/obtener-nombres-usuarios', async (req, res) => {
  const { usuarios } = req.body;
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);
    
    const result = await connection.execute(
      `SELECT ID_US, NOMBRE_US || ' ' || APELLIDO_US as NOMBRE_COMPLETO
       FROM USUARIOS 
       WHERE ID_US IN (${usuarios.map(u => `'${u}'`).join(',')})`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Crear un objeto con los nombres normalizados
    const nombres = {};
    result.rows.forEach(row => {
      nombres[row.ID_US] = row.NOMBRE_COMPLETO;
    });

    res.json({ nombres });
  } catch (error) {
    console.error('Error al obtener nombres:', error);
    res.status(500).json({ error: 'Error al obtener los nombres' });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('Error al cerrar la conexión:', error);
      }
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Aplicación escuchando en http://0.0.0.0:${PORT}`);
});
