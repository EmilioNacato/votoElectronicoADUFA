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
const csv = require('csv-parse');
const XLSX = require('xlsx');
const bcrypt = require('bcrypt');
const saltRounds = 10;

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

function hashUsuario(usuario) {
  return crypto.createHash('sha256')
    .update(usuario)
    .digest('hex');
}

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
    files: 20 // máximo 20 archivos
  },
  fileFilter: fileFilter
});

// Configuración de multer para archivos CSV y Excel
const storageDocumentos = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const fileFilterDocumentos = (req, file, cb) => {
  // Verificar el tipo de archivo
  if (file.mimetype === 'text/csv' || 
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel') {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos CSV o Excel (.xlsx)'), false);
  }
};

const uploadDocumentos = multer({
  storage: storageDocumentos,
  fileFilter: fileFilterDocumentos,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB máximo
  }
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
const dbConfig = {
  user: 'C##emilioadmin',
  password: 'Emilio.*142002',
  connectString: 'localhost/XE'
};

// Configuración de la base de datos
// const dbConfig = {
//   user: 'ADMIN', // Usuario de la base de datos
//   password: 'xXsCzXQj@S39', // Contraseña del usuario de la base de datos
//   connectString: 'votoelectronico_high' // Usar el alias del tnsnames.ora
// };

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

    let promises = batch.map(async (usuario, index) => {
      const userId = usuario[0];
      const email = usuario[1];

      // Generar contraseña aleatoria
      const contrasenaAleatoria = crypto.randomBytes(4).toString('hex'); // 8 caracteres
      
      try {
        // Primero hashear la contraseña
        const contrasenaUsHash = await hashPassword(contrasenaAleatoria);

        // Actualizar la contraseña en la base de datos
        const connection = await oracledb.getConnection(dbConfig);
        await connection.execute(
          `UPDATE USUARIOS SET CONTRASENA_US = :password WHERE ID_US = :userId`,
          {
            password: { val: contrasenaUsHash },
            userId: { val: userId }
          }
        );
        await connection.commit();
        await connection.close();

        // Configurar las opciones del correo con la contraseña sin hashear
        const mailOptions = {
          from: 'emilionacato75@gmail.com',
          to: email,
          subject: 'Credenciales de Votación',
          text: `Hola, su ID de usuario es: ${userId}\nSu contraseña es: ${contrasenaAleatoria}\nY el enlace de votación es: ${link}`
        };

        // Enviar correo con un retardo
        return await enviarCorreoConRetardo(transporter, mailOptions, index * 10000);
      } catch (error) {
        console.error('Error procesando usuario:', userId, error);
        throw error;
      }
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

    // Validar que la fecha esté en un rango razonable
    const fechaActual = new Date();
    const fechaMaxima = new Date();
    fechaMaxima.setFullYear(fechaActual.getFullYear() + 10);
    const fechaPublicacionDate = new Date(fechaPublicacion);

    if (fechaPublicacionDate < fechaActual || fechaPublicacionDate > fechaMaxima) {
      return res.status(400).json({ 
        success: false, 
        message: 'La fecha debe estar entre hoy y ' + fechaMaxima.getFullYear() 
      });
    }

    // Convertir la fecha al formato esperado por Oracle (DD/MM/YYYY)
    const [year, month, day] = fechaPublicacion.split('-');
    const fechaOracle = `${day}/${month}/${year}`;

    // Insertar en la tabla CONFIGURACION_VOTACION
    await connection.execute(
      `INSERT INTO CONFIGURACION_VOTACION (PERIODO_POSTULACION, FECHA_PUBLICACION, HORA_INICIO, HORA_FIN) 
       VALUES (:periodo, TO_DATE(:fechaPublicacion, 'DD/MM/YYYY'), :horaInicio, :horaFin)`,
      {
        periodo: periodo,
        fechaPublicacion: fechaOracle,
        horaInicio: horaInicio,
        horaFin: horaFin
      }
    );

    console.log('Configuración guardada:', { periodo, fechaPublicacion: fechaOracle, horaInicio, horaFin });
    await connection.commit();
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

async function verificarFechaYHora(req, res) {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    
    // Obtener la fecha y hora actual de Oracle usando el timezone de US East (Ashburn)
    const timeResult = await connection.execute(
      `SELECT 
        TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/New_York', 'DD/MM/YYYY') as fecha_actual,
        TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/New_York', 'HH24:MI') as hora_actual
       FROM DUAL`
    );

    const fechaActual = timeResult.rows[0][0];
    const horaActual = timeResult.rows[0][1];

    console.log('Fecha actual Oracle (US East):', fechaActual);
    console.log('Hora actual Oracle (US East):', horaActual);

    // Obtener configuración de votación
    const { periodo } = req.query;
    const configResult = await connection.execute(
      `SELECT TO_CHAR(FECHA_PUBLICACION, 'DD/MM/YYYY') as fecha_votacion,
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
    console.log('Fecha actual:', fechaActual);
    console.log('Hora actual:', horaActual);
    console.log('Hora inicio:', horaInicio);
    console.log('Hora fin:', horaFin);

    // Convertir fechas a objetos Date para comparación
    const [diaVot, mesVot, anioVot] = fechaVotacion.split('/');
    const fechaVotObj = new Date(anioVot, mesVot - 1, diaVot);
    
    const [diaAct, mesAct, anioAct] = fechaActual.split('/');
    const fechaActObj = new Date(anioAct, mesAct - 1, diaAct);

    // Convertir horas a minutos para comparación
    const [horaActualHH, horaActualMM] = horaActual.split(':').map(Number);
    const minutosActuales = horaActualHH * 60 + horaActualMM;

    const [horaInicioHH, horaInicioMM] = horaInicio.split(':').map(Number);
    const minutosInicio = horaInicioHH * 60 + horaInicioMM;

    const [horaFinHH, horaFinMM] = horaFin.split(':').map(Number);
    const minutosFinVotacion = horaFinHH * 60 + horaFinMM;

    console.log('Minutos actuales:', minutosActuales);
    console.log('Rango permitido:', minutosInicio, 'a', minutosFinVotacion);

    // Verificar si estamos en el día correcto
    const esHoy = fechaActObj.getFullYear() === fechaVotObj.getFullYear() &&
                 fechaActObj.getMonth() === fechaVotObj.getMonth() &&
                 fechaActObj.getDate() === fechaVotObj.getDate();
    
    const estaEnHorario = minutosActuales >= minutosInicio && minutosActuales <= minutosFinVotacion;

    await connection.close();

    if (!esHoy) {
      return res.json({ 
        puedeVotar: false, 
        mensaje: `La votación está programada para el ${fechaVotacion}.\nHorario de votación: ${horaInicio} a ${horaFin}.\n\nPor favor, ingrese nuevamente en la fecha y hora indicadas.` 
      });
    }

    if (!estaEnHorario) {
      return res.json({ 
        puedeVotar: false, 
        mensaje: `El horario de votación es de ${horaInicio} a ${horaFin}.\nPor favor, ingrese nuevamente dentro del horario establecido.` 
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
      `SELECT ID_ROL, ESTADO_US, CONTRASENA_US, INTENTOS_FALLIDOS, EMAIL_US 
       FROM USUARIOS 
       WHERE ID_US = :username`,
      [username]
    );

    if (result.rows.length > 0) {
      const [role, estado, contrasenaHash, intentosFallidos, email] = result.rows[0];

      // Verificar si el usuario está activo
      if (estado === 0) {
        res.send('<script>alert("Su cuenta está inactiva. Por favor, contacte al administrador."); window.location.href="/";</script>');
        await connection.close();
        return;
      }

      const contrasenaValida = await comparePassword(password, contrasenaHash);

      if (contrasenaValida) {
        // Solo resetear contador de intentos si es rol 2 (votante)
        if (role === '2') {
          await connection.execute(
            `UPDATE USUARIOS SET INTENTOS_FALLIDOS = 0 WHERE ID_US = :username`,
            [username]
          );
          await connection.commit();
        }

        const usuario = username;
        console.log('Usuario autenticado:', { role });

        res.send(`
          <script>
            localStorage.setItem('rol', '${role}');
            localStorage.setItem('usuario', '${usuario}');
            localStorage.setItem('contrasenaHash', '${contrasenaHash}');

            if (${role} === 1) {
              window.location.href = '/html/configuracion.html';
            } else if (${role} === 2) {
              const storedPeriodo = localStorage.getItem('periodo');

              if (storedPeriodo !== '${periodo}' && '${periodo}'.trim() !== '') {
                localStorage.setItem('periodo', '${periodo}');
              }

              const finalPeriodo = localStorage.getItem('periodo');
              if (!finalPeriodo || finalPeriodo.trim() === '') {
                alert("El periodo no se encuentra. Por favor, vuelva a intentarlo.");
                window.location.href = '/';
              } else {
                window.location.href = '/html/votacionADUFA.html?periodo=' + finalPeriodo;
              }
            } else {
              alert("Rol desconocido");
              window.location.href = '/';
            }
          </script>
        `);
      } else {
        // Solo incrementar intentos y bloquear si es rol 2 (votante)
        if (role === '2') {
          const nuevosIntentos = (intentosFallidos || 0) + 1;
          
          if (nuevosIntentos >= 3) {
            // Desactivar usuario y resetear contador
            await connection.execute(
              `UPDATE USUARIOS 
               SET ESTADO_US = 0, INTENTOS_FALLIDOS = 0 
               WHERE ID_US = :username`,
              [username]
            );
            await connection.commit();
            res.send('<script>alert("Su cuenta ha sido bloqueada por múltiples intentos fallidos. Por favor, contacte al administrador."); window.location.href="/";</script>');
          } else {
            // Solo incrementar el contador
            await connection.execute(
              `UPDATE USUARIOS 
               SET INTENTOS_FALLIDOS = :intentos 
               WHERE ID_US = :username`,
              [nuevosIntentos, username]
            );
            await connection.commit();
            res.send(`<script>alert("Contraseña incorrecta. Intentos restantes: ${3 - nuevosIntentos}"); window.location.href="/";</script>`);
          }
        } else {
          // Para administradores, simplemente mostrar error
          res.send('<script>alert("Contraseña incorrecta"); window.location.href="/";</script>');
        }
      }
    } else {
      res.send('<script>alert("Usuario incorrecto"); window.location.href="/";</script>');
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
    const usuarioHash = hashUsuario(usuario);

    // Construir el idVoto en el formato requerido
    const idVoto = `${id_lista}_${period}_${usuarioHash}`;

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
        WHERE ID_US = :usuarioHash 
        AND PERIODO_POSTULACION = :periodo`;

      const votoResult = await connection.execute(checkVotoQuery, [usuarioHash, period]);
      
      if (votoResult.rows[0][0] > 0) {
        throw new Error('El usuario ya ha votado en este periodo');
      }
    }

    // Inserción del voto en la tabla VOTOS
    const insertQuery = `
      INSERT INTO VOTOS (ID_LISTA, PERIODO_POSTULACION, ID_US, FECHA_VOTACION, ACEPTA_AUDITORIA)
                         VALUES (:idLista, :periodoPostulacion, :usuario, CURRENT_TIMESTAMP, :aceptaAuditoria)`;

    await connection.execute(insertQuery, [id_lista, period, usuarioHash, aceptaAuditoria]);

    console.log('=== Datos a guardar en la base de datos ===');
    console.log('ID Usuario:', usuario);
    console.log('ID Usuario Hash:', usuarioHash);
    console.log('Periodo:', period);
    console.log('ID Lista:', id_lista);
    console.log('Nombre Lista:', nombreLista);
    console.log('Acepta Auditoría:', aceptaAuditoria);
    console.log('ID Voto generado:', idVoto);
    console.log('Fecha y hora del voto:', new Date().toISOString());
    console.log('=====================================');

    // Llamada a la Blockchain platform de OCI
    /* const credentials = Buffer.from('sebastianmogrovejo7@gmail.com:Emilio.*142002').toString('base64');
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

    console.log('Blockchain response:', blockchainResponse.data); */

    await connection.commit();

    // Enviar correo de confirmación
    /* const emailQuery = `SELECT EMAIL_US FROM USUARIOS WHERE ID_US = :usuario`;
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
    }); */

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

  const idHasheado = hashUsuario(usuario);

  try {
    const connection = await oracledb.getConnection(dbConfig);

    // Consulta para verificar si el usuario ya ha votado para el período especificado
    const query = `
      SELECT COUNT(*) AS VOTO_REALIZADO
      FROM VOTOS
      WHERE ID_US = :usuario
        AND PERIODO_POSTULACION = :periodo
    `;

    const result = await connection.execute(query, [idHasheado, periodo]);

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
    const numeroVotantesUnicos = resultNumVotantesUnicos.rows[0][0];

    // Consulta para obtener los resultados por lista
    const query = `
      SELECT l.NOMBRE_LISTA, l.ID_LISTA, COUNT(v.ID_US) AS VOTOS
      FROM VOTOS v
      JOIN LISTAS l ON v.ID_LISTA = l.ID_LISTA AND v.PERIODO_POSTULACION = l.PERIODO_POSTULACION
      WHERE v.PERIODO_POSTULACION = :periodo
      GROUP BY l.NOMBRE_LISTA, l.ID_LISTA
      ORDER BY VOTOS DESC
    `;

    const result = await connection.execute(query, [periodo]);
    const resultados = [];
    let listaGanadora = null;
    let maxVotos = 0;

    // Procesar resultados y encontrar la lista ganadora
    for (const row of result.rows) {
      const [nombre, idLista, votos] = row;
      const porcentaje = ((votos / numeroVotantesUnicos) * 100).toFixed(2);
      
      if (nombre.toLowerCase() !== 'nulo' && nombre.toLowerCase() !== 'blanco' && votos > maxVotos) {
        maxVotos = votos;
        listaGanadora = { nombre, idLista, votos, porcentaje };
      }
      
      resultados.push({ nombre, votos, porcentaje });
    }

    // Si hay una lista ganadora, obtener información de sus candidatos
    let ganadores = null;
    if (listaGanadora) {
      const queryCandidatos = `
        SELECT c.DIGNIDAD_CAND, u.NOMBRE_US, u.APELLIDO_US
        FROM CANDIDATOS c
        JOIN USUARIOS u ON c.ID_US = u.ID_US
        WHERE c.ID_LISTA = :idLista 
        AND c.PERIODO_POSTULACION = :periodo
        AND c.DIGNIDAD_CAND IN ('presidente', 'vicepresidente')
      `;

      const candidatosResult = await connection.execute(
        queryCandidatos, 
        [listaGanadora.idLista, periodo],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      ganadores = {
        lista: listaGanadora.nombre,
        votos: listaGanadora.votos,
        porcentaje: listaGanadora.porcentaje,
        candidatos: candidatosResult.rows.map(row => ({
          dignidad: row.DIGNIDAD_CAND,
          nombre: `${row.NOMBRE_US} ${row.APELLIDO_US}`,
          foto: `../assets/img/fotosListas/foto${row.DIGNIDAD_CAND.charAt(0).toUpperCase() + row.DIGNIDAD_CAND.slice(1)}${listaGanadora.idLista}periodo${periodo}.png`
        }))
      };
    }

    await connection.close();
    res.json({ resultados, ganadores });
  } catch (err) {
    console.error('Error al obtener los resultados:', err);
    res.status(500).send('Error al obtener los resultados');
  }
});

// Ruta para obtener todos los usuarios activos e inactivos
app.get('/api/usuarios-crud', async (req, res) => {
  try {
    const connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT ID_US, ID_ROL, NOMBRE_US, APELLIDO_US, DEPARTAMENTO_US, ESTADO_US 
       FROM USUARIOS 
       ORDER BY ID_US`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    await connection.close();
    res.json(result.rows);
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
    const result = await connection.execute(
      `SELECT ID_US, ID_ROL, NOMBRE_US, APELLIDO_US, DEPARTAMENTO_US 
       FROM USUARIOS 
       WHERE ID_US = :id`,
      [id]
    );
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
      DEPARTAMENTO_US: row[4]
    });
  } catch (err) {
    console.error('Error al obtener el usuario:', err);
    res.status(500).json({ error: 'Error al obtener el usuario' });
  }
});

// Ruta para crear un nuevo usuario
app.post('/api/usuarios-crud', async (req, res) => {
  const { idUs, idRol, nombreUs, apellidoUs, departamentoUs } = req.body;
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    
    // Verificar si el ID ya existe y agregar número si es necesario
    let counter = 1;
    let finalId = idUs;
    let baseId = idUs;
    let startingNumber = 1;

    // Extraer el número del final del ID si existe
    const matches = idUs.match(/^([a-zA-Z]+)(\d+)$/);
    if (matches) {
      baseId = matches[1];
      startingNumber = parseInt(matches[2]);
    }

    // Buscar todos los IDs que empiecen con el ID base
    const existingIds = await connection.execute(
      'SELECT ID_US FROM USUARIOS WHERE ID_US LIKE :id_pattern ORDER BY ID_US',
      { id_pattern: { val: `${baseId}%` } }
    );

    if (existingIds.rows.length === 0) {
      // No existe ningún ID con este patrón
      finalId = idUs;
    } else {
      // Verificar si el ID exacto ya existe
      const exactMatch = existingIds.rows.find(row => row[0] === finalId);
      if (!exactMatch) {
        // Si el ID exacto no existe, podemos usarlo
        finalId = idUs;
      } else {
        // Crear un conjunto de números ya usados
        const numerosUsados = new Set();
        existingIds.rows.forEach(row => {
          const id = row[0];
          if (id.startsWith(baseId)) {
            const numMatch = id.substring(baseId.length).match(/^\d+$/);
            if (numMatch) {
              numerosUsados.add(parseInt(numMatch[0]));
            }
          }
        });

        // Encontrar el primer número disponible
        let numeroDisponible = 1;
        while (numerosUsados.has(numeroDisponible)) {
          numeroDisponible++;
        }

        finalId = `${baseId}${numeroDisponible}`;
      }
    }

    // Generar correo electrónico automáticamente
    const email_us = `${finalId}@espe.edu.ec`;

    // Generar contraseña aleatoria y hashearla
    const contrasenaAleatoria = crypto.randomBytes(4).toString('hex');
    const contrasenaHash = await hashPassword(contrasenaAleatoria);
    
    await connection.execute(
      `INSERT INTO USUARIOS (ID_US, ID_ROL, NOMBRE_US, APELLIDO_US, DEPARTAMENTO_US, CONTRASENA_US, ESTADO_US, EMAIL_US) 
       VALUES (:id_us, :id_rol, :nombre_us, :apellido_us, :departamento_us, :contrasena_us, 1, :email_us)`,
      {
        id_us: { val: finalId },
        id_rol: { val: idRol },
        nombre_us: { val: nombreUs },
        apellido_us: { val: apellidoUs },
        departamento_us: { val: departamentoUs },
        contrasena_us: { val: contrasenaHash },
        email_us: { val: email_us }
      }
    );
    await connection.commit();

    // Si el ID fue modificado, informar al usuario
    if (finalId !== idUs) {
      res.json({ 
        message: `Usuario creado exitosamente con ID ${finalId} (el ID fue modificado porque ${idUs} ya existía).\nLa contraseña se asignará cuando inicie un proceso de votación.`,
        newId: finalId 
      });
    } else {
      res.json({ 
        message: `Usuario creado exitosamente.\nLa contraseña se asignará cuando inicie un proceso de votación.` 
      });
    }
  } catch (err) {
    console.error('Error al crear el usuario:', err);
    res.status(500).json({ error: 'Error al crear el usuario' });
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

// Ruta para actualizar un usuario existente
app.put('/api/usuarios-crud/:id', async (req, res) => {
  const id = req.params.id;
  const { idRol, nombreUs, apellidoUs, departamentoUs } = req.body;
  try {
    const connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `UPDATE USUARIOS SET ID_ROL = :idRol, NOMBRE_US = :nombreUs, APELLIDO_US = :apellidoUs, DEPARTAMENTO_US = :departamentoUs 
       WHERE ID_US = :id`,
      [idRol, nombreUs, apellidoUs, departamentoUs, id]
    );
    await connection.commit();
    await connection.close();
    res.json({ message: 'Usuario actualizado exitosamente' });
  } catch (err) {
    console.error('Error al actualizar el usuario:', err);
    res.status(500).json({ error: 'Error al actualizar el usuario' });
  }
});

// Ruta para desactivar un usuario
app.put('/api/usuarios-crud/:id/desactivar', async (req, res) => {
  const id = req.params.id;
  try {
    const connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `UPDATE USUARIOS SET ESTADO_US = 0 WHERE ID_US = :id`,
      [id]
    );
    await connection.commit();
    await connection.close();
    res.json({ message: 'Usuario desactivado exitosamente' });
  } catch (err) {
    console.error('Error al desactivar el usuario:', err);
    res.status(500).json({ error: 'Error al desactivar el usuario' });
  }
});

// Ruta para activar un usuario
app.put('/api/usuarios-crud/:id/activar', async (req, res) => {
  const id = req.params.id;
  try {
    const connection = await oracledb.getConnection(dbConfig);

    // Primero verificar el rol del usuario
    const rolResult = await connection.execute(
      `SELECT ID_ROL, EMAIL_US FROM USUARIOS WHERE ID_US = :id`,
      [id]
    );

    if (rolResult.rows.length === 0) {
      throw new Error('Usuario no encontrado');
    }

    const [rol, email] = rolResult.rows[0];

    // Solo generar nueva contraseña y enviar correo si es rol 2 (votante)
    if (rol === '2') {
      // Generar nueva contraseña aleatoria
      const nuevaContrasena = crypto.randomBytes(4).toString('hex');
      const contrasenaHash = await hashPassword(nuevaContrasena);

      // Actualizar usuario: activar, resetear intentos y actualizar contraseña
      await connection.execute(
        `UPDATE USUARIOS 
         SET ESTADO_US = 1, 
             INTENTOS_FALLIDOS = 0,
             CONTRASENA_US = :contrasena
         WHERE ID_US = :id`,
        [contrasenaHash, id]
      );

      // Enviar correo con la nueva contraseña
      const mailOptions = {
        from: 'emilionacato75@gmail.com',
        to: email,
        subject: 'Cuenta Reactivada - Nueva Contraseña',
        text: `Su cuenta ha sido reactivada.\n\nSu nueva contraseña es: ${nuevaContrasena}\n\nPor favor, ingrese al sistema con estas nuevas credenciales.`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error al enviar el correo:', error);
        } else {
          console.log('Correo enviado:', info.response);
        }
      });

      res.json({ message: 'Usuario activado exitosamente y nueva contraseña enviada por correo' });
    } else {
      // Para administradores, solo activar la cuenta
      await connection.execute(
        `UPDATE USUARIOS SET ESTADO_US = 1 WHERE ID_US = :id`,
        [id]
      );
      res.json({ message: 'Usuario activado exitosamente' });
    }

    await connection.commit();
    await connection.close();
  } catch (err) {
    console.error('Error al activar el usuario:', err);
    res.status(500).json({ error: 'Error al activar el usuario' });
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
  const departamento = req.query.departamento;

  if (!periodo || !departamento) {
    return res.status(400).json({ message: 'Periodo y departamento son requeridos' });
  }

  try {
    const connection = await oracledb.getConnection(dbConfig);

    // Primero obtener los usuarios del departamento
    const usuariosResult = await connection.execute(
      `SELECT ID_US 
       FROM USUARIOS 
       WHERE DEPARTAMENTO_US = :departamento 
       AND ID_ROL = '2' 
       AND ESTADO_US = '1'`,
      [departamento]
    );

    // Crear array de IDs hasheados
    const usuariosHasheados = usuariosResult.rows.map(([id]) => hashUsuario(id));

    if (usuariosHasheados.length === 0) {
      await connection.close();
      return res.json({
        noData: true,
        message: `No se encontraron votantes registrados en el departamento ${departamento} para el periodo ${periodo}.`
      });
    }

    // Obtener los votos usando los IDs hasheados
    const query = `
      WITH VotosProcesados AS (
        SELECT 
          CASE 
            WHEN v.ID_LISTA = 'nulo' THEN 'NULO'
            WHEN v.ID_LISTA = 'blanco' THEN 'BLANCO'
            ELSE l.NOMBRE_LISTA 
          END as NOMBRE,
          v.ID_US
        FROM VOTOS v
        LEFT JOIN LISTAS l ON v.ID_LISTA = l.ID_LISTA AND v.PERIODO_POSTULACION = l.PERIODO_POSTULACION
        WHERE v.PERIODO_POSTULACION = :periodo
        AND v.ID_US IN (${usuariosHasheados.map(id => `'${id}'`).join(',')})
      )
      SELECT 
        NOMBRE,
        COUNT(ID_US) as VOTOS
      FROM VotosProcesados
      GROUP BY NOMBRE
      ORDER BY 
        CASE 
          WHEN NOMBRE IN ('NULO', 'BLANCO') THEN 2
          ELSE 1 
        END,
        NOMBRE`;

    const result = await connection.execute(
      query,
      [periodo],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Si no hay votos registrados
    if (result.rows.length === 0) {
      await connection.close();
      return res.json({
        noData: true,
        message: `No se han registrado votos en el departamento ${departamento} para el periodo ${periodo}.`
      });
    }

    // Formatear resultados
    const resultadosFormateados = result.rows.map(row => ({
      nombre: row.NOMBRE,
      votos: row.VOTOS
    }));

    await connection.close();
    res.json(resultadosFormateados);
  } catch (err) {
    console.error('Error al obtener resultados por departamento:', err);
    res.status(500).json({ 
      message: 'Error al obtener resultados por departamento',
      error: err.message 
    });
  }
});

app.get('/api/auditoria', async (req, res) => {
  const { periodo } = req.query;

  if (!periodo) {
    return res.status(400).json({ message: 'Periodo es requerido' });
  }

  try {
    const connection = await oracledb.getConnection(dbConfig);

    // Consulta para obtener todos los usuarios elegibles
    const usuariosResult = await connection.execute(
      `SELECT ID_US, NOMBRE_US, APELLIDO_US, DEPARTAMENTO_US
       FROM USUARIOS
       WHERE ID_ROL = '2' AND ESTADO_US = '1'`
    );

    // Obtener todos los votos del periodo
    const votosResult = await connection.execute(
      `SELECT ID_US, ACEPTA_AUDITORIA
       FROM VOTOS
       WHERE PERIODO_POSTULACION = :periodo`,
      [periodo]
    );

    // Crear un Set de IDs hasheados de usuarios que han votado
    const votosMap = new Map(
      votosResult.rows.map(([idUs, aceptaAuditoria]) => [idUs, aceptaAuditoria])
    );

    // Procesar usuarios y sus estados de votación
    const usuariosAuditados = usuariosResult.rows
      .map(([id, nombre, apellido, departamento]) => {
        const idHasheado = hashUsuario(id);
        const haVotado = votosMap.has(idHasheado);
        const aceptoAuditoria = haVotado ? votosMap.get(idHasheado) === 1 : false;

        // Solo incluir en la auditoría si aceptó o no ha votado
        if (aceptoAuditoria || !haVotado) {
          return {
            id,
            nombre,
            apellido,
            departamento,
            haVotado
          };
        }
        return null;
      })
      .filter(usuario => usuario !== null);

    // Calcular estadísticas
    const totalVotantes = usuariosResult.rows.length;
    const votantesQueHanVotado = votosResult.rows.length;

    // Enviar la respuesta
    res.json({
      totalVotantes,
      votantesQueHanVotado,
      usuariosAuditados,
    });

    await connection.close();
  } catch (err) {
    console.error('Error en la auditoría:', err);
    res.status(500).json({ 
      message: 'Error al obtener datos de auditoría',
      error: err.message 
    });
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
  const periodo = req.query.periodo;
  const filterType = req.query.filterType || 'lista';
  console.log(`Consultando votos por ${filterType} para periodo: ${periodo}`);

  try {
    const credentials = Buffer.from('sebastianmogrovejo7@gmail.com:Emilio.*142002').toString('base64');
    const blockchainResponse = await axios.post('https://votoblockchain-4-bmogrovejog-iad.blockchain.ocp.oraclecloud.com:7443/restproxy/api/v2/channels/default/transactions', {
      chaincode: "data_synchronization_votos_v9",
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

    console.log('Respuesta de blockchain:', blockchainResponse.data);

    if (blockchainResponse.data.returnCode !== 'Success') {
      console.error('Error en la respuesta de blockchain:', blockchainResponse.data);
      throw new Error(blockchainResponse.data.error || 'Error al obtener datos de blockchain');
    }

    const votosBlockchain = blockchainResponse.data.result.payload || [];
    console.log('Votos obtenidos:', votosBlockchain);
    
    const votosPeriodo = votosBlockchain.filter(voto => voto.periodoPostulacion === periodo);
    console.log('Votos filtrados por periodo:', votosPeriodo);
    
    let resultados;
    
    if (filterType === 'lista') {
      // Agrupar votos por lista
      resultados = votosPeriodo.reduce((acc, voto) => {
        const idLista = voto.idLista;
        const nombreLista = voto.nombreLista;
        const key = idLista === 'blanco' ? 'BLANCO' : 
                   idLista === 'nulo' ? 'NULO' : 
                   `${idLista} - ${nombreLista}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      // Calcular total de votos para porcentajes
      const totalVotos = Object.values(resultados).reduce((sum, count) => sum + count, 0);

      // Convertir a formato esperado por el frontend
      const resultadosFormateados = Object.entries(resultados).map(([nombre, votos]) => ({
        nombre,
        votos,
        porcentaje: ((votos / totalVotos) * 100).toFixed(2)
      }));

      console.log('Resultados formateados:', resultadosFormateados);
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

        console.log('Resultados por departamento:', resultadosFormateados);
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
      error: err.response?.data || err.message,
      details: err.stack
    });
  }
});

app.get('/verificar-horario', async (req, res) => {
  const { periodo } = req.query;
  
  try {
    const connection = await oracledb.getConnection(dbConfig);
    
    // Obtener la fecha y hora actual de Oracle usando el timezone de US East (Ashburn)
    const timeResult = await connection.execute(
      `SELECT 
        TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/New_York', 'DD/MM/YYYY') as fecha_actual,
        TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/New_York', 'HH24:MI') as hora_actual
       FROM DUAL`
    );

    const fechaActual = timeResult.rows[0][0];
    const horaActual = timeResult.rows[0][1];

    console.log('Fecha actual Oracle (US East):', fechaActual);
    console.log('Hora actual Oracle (US East):', horaActual);

    // Obtener configuración de votación
    const configResult = await connection.execute(
      `SELECT TO_CHAR(FECHA_PUBLICACION, 'DD/MM/YYYY') as fecha_votacion,
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
    const minutosActuales = horaActualHH * 60 + horaActualMM;

    const [horaInicioHH, horaInicioMM] = horaInicio.split(':').map(Number);
    const minutosInicio = horaInicioHH * 60 + horaInicioMM;

    const [horaFinHH, horaFinMM] = horaFin.split(':').map(Number);
    const minutosFinVotacion = horaFinHH * 60 + horaFinMM;

    console.log('Fecha votación:', fechaVotacion);
    console.log('Fecha actual:', fechaActual);
    console.log('Hora actual:', horaActual);
    console.log('Hora inicio:', horaInicio);
    console.log('Hora fin:', horaFin);
    console.log('Minutos actuales:', minutosActuales);
    console.log('Rango permitido:', minutosInicio, 'a', minutosFinVotacion);

    // Verificar si estamos en el día correcto
    const esHoy = fechaActObj.getFullYear() === fechaVotObj.getFullYear() &&
                 fechaActObj.getMonth() === fechaVotObj.getMonth() &&
                 fechaActObj.getDate() === fechaVotObj.getDate();
    
    const estaEnHorario = minutosActuales >= minutosInicio && minutosActuales <= minutosFinVotacion;

    await connection.close();

    if (!esHoy) {
      return res.json({ 
        puedeVotar: false, 
        mensaje: `La votación está programada para el ${fechaVotacion}.\nHorario de votación: ${horaInicio} a ${horaFin}.\n\nPor favor, ingrese nuevamente en la fecha y hora indicadas.` 
      });
    }

    if (!estaEnHorario) {
      return res.json({ 
        puedeVotar: false, 
        mensaje: `El horario de votación es de ${horaInicio} a ${horaFin}.\nPor favor, ingrese nuevamente dentro del horario establecido.` 
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

// Función para generar ID de usuario a partir del nombre
function generarIdUsuario(nombre, apellido) {
  // Convertir a minúsculas y remover acentos
  const nombreNormalizado = nombre.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n");
  const apellidoNormalizado = apellido.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n");

  // Tomar primera letra del nombre y primera palabra del apellido
  const inicialNombre = nombreNormalizado.split(' ')[0].charAt(0);
  const inicialSegundoNombre = nombreNormalizado.split(' ')[1] ? nombreNormalizado.split(' ')[1].charAt(0) : '';
  const primerApellido = apellidoNormalizado.split(' ')[0];

  return (inicialNombre + inicialSegundoNombre + primerApellido).toLowerCase();
}

// Endpoint para la carga masiva de usuarios
app.post('/api/usuarios-crud/upload', uploadDocumentos.single('file'), async (req, res) => {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const file = req.file;
    const fileContent = fs.readFileSync(file.path, 'utf-8');
    const records = [];
    const errors = [];

    if (file.originalname.endsWith('.csv')) {
      await new Promise((resolve, reject) => {
        csv.parse(fileContent, {
          columns: header => header.map(column => column.trim()),
          skip_empty_lines: true,
          relax_column_count: true,
          trim: true,
          on_record: (record, {lines}) => {
            // Asegurarse de que todos los campos requeridos existan
            if (!record.NOMBRE_US || !record.APELLIDO_US || !record.DEPARTAMENTO_US || !record.CONTRASENA_US) {
              throw new Error(`Faltan campos requeridos en la línea ${lines}`);
            }
            // ID_ROL es opcional, si no existe no lo incluimos en el objeto
            const cleanRecord = {
              NOMBRE_US: record.NOMBRE_US,
              APELLIDO_US: record.APELLIDO_US,
              DEPARTAMENTO_US: record.DEPARTAMENTO_US,
              CONTRASENA_US: record.CONTRASENA_US
            };
            // Solo añadir ID_ROL si existe en el registro
            if (record.ID_ROL) {
              cleanRecord.ID_ROL = record.ID_ROL.trim();
            }
            return cleanRecord;
          }
        })
        .on('data', (data) => records.push(data))
        .on('error', reject)
        .on('end', resolve);
      });
    } else if (file.originalname.endsWith('.xlsx')) {
      // Leer el archivo Excel correctamente como buffer
      const buffer = fs.readFileSync(file.path);
      const workbook = XLSX.read(buffer, { 
        type: 'buffer',
        codepage: 65001 // UTF-8
      });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { 
        raw: false,
        defval: '', // Valor por defecto para celdas vacías
        dateNF: 'yyyy-mm-dd'
      });

      // Procesar cada registro del Excel y normalizar caracteres especiales
      jsonData.forEach((record, index) => {
        if (!record.NOMBRE_US || !record.APELLIDO_US || !record.DEPARTAMENTO_US || !record.CONTRASENA_US) {
          throw new Error(`Faltan campos requeridos en la fila ${index + 2}`);
        }
        
        // Función para normalizar texto con caracteres especiales
        const normalizeText = (text) => {
          return text.toString()
            .normalize('NFKC')  // Normalización de caracteres compuestos
            .replace(/[\u0300-\u036f]/g, '') // Eliminar caracteres de control
            .normalize('NFC');  // Recomponer caracteres
        };
        
        const cleanRecord = {
          NOMBRE_US: normalizeText(record.NOMBRE_US).trim(),
          APELLIDO_US: normalizeText(record.APELLIDO_US).trim(),
          DEPARTAMENTO_US: normalizeText(record.DEPARTAMENTO_US).trim(),
          CONTRASENA_US: record.CONTRASENA_US.trim()
        };
        
        if (record.ID_ROL) {
          cleanRecord.ID_ROL = record.ID_ROL.toString().trim();
        }
        
        records.push(cleanRecord);
      });
    }

    for (const record of records) {
      try {
        // Generar ID_US usando la función existente
        const id_us = generarIdUsuario(record.NOMBRE_US, record.APELLIDO_US);
        
        // Verificar si el ID ya existe y agregar número si es necesario
        let counter = 1;
        let finalId = id_us;
        let baseId = idUs;
        let startingNumber = 1;

        // Extraer el número del final del ID si existe
        const matches = idUs.match(/^([a-zA-Z]+)(\d+)$/);
        if (matches) {
          baseId = matches[1];
          startingNumber = parseInt(matches[2]);
        }

        // Buscar todos los IDs que empiecen con el ID base
        const existingIds = await connection.execute(
          'SELECT ID_US FROM USUARIOS WHERE ID_US LIKE :id_pattern ORDER BY ID_US',
          { id_pattern: { val: `${baseId}%` } }
        );

        if (existingIds.rows.length === 0) {
          // No existe ningún ID con este patrón
          finalId = idUs;
        } else {
          // Verificar si el ID exacto ya existe
          const exactMatch = existingIds.rows.find(row => row[0] === finalId);
          if (!exactMatch) {
            // Si el ID exacto no existe, podemos usarlo
            finalId = idUs;
          } else {
            // Crear un conjunto de números ya usados
            const numerosUsados = new Set();
            existingIds.rows.forEach(row => {
              const id = row[0];
              if (id.startsWith(baseId)) {
                const numMatch = id.substring(baseId.length).match(/^\d+$/);
                if (numMatch) {
                  numerosUsados.add(parseInt(numMatch[0]));
                }
              }
            });

            // Encontrar el primer número disponible
            let numeroDisponible = 1;
            while (numerosUsados.has(numeroDisponible)) {
              numeroDisponible++;
            }

            finalId = `${baseId}${numeroDisponible}`;
          }
        }

        // Generar correo electrónico automáticamente
        const email_us = `${finalId}@espe.edu.ec`;

        // Usar '2' como valor por defecto para ID_ROL si no está presente
        const id_rol = record.ID_ROL || '2';

        // Validar que el ID_ROL exista
        const rolExists = await connection.execute(
          'SELECT COUNT(*) FROM ROL WHERE ID_ROL = :id_rol',
          [id_rol]
        );

        if (rolExists.rows[0][0] === 0) {
          throw new Error(`El rol "${id_rol}" no existe en la base de datos`);
        }

        const contrasenaUsHash = hashPassword(record.CONTRASENA_US);

        // Insertar usuario con todos los campos requeridos
        await connection.execute(
          `INSERT INTO USUARIOS (
            ID_US, 
            ID_ROL, 
            NOMBRE_US, 
            APELLIDO_US, 
            DEPARTAMENTO_US, 
            CONTRASENA_US, 
            ESTADO_US,
            EMAIL_US
          ) VALUES (
            :id_us, 
            :id_rol, 
            :nombre_us, 
            :apellido_us, 
            :departamento_us, 
            :contrasena_us, 
            :estado_us,
            :email_us
          )`,
          {
            id_us: { val: finalId },
            id_rol: { val: id_rol },
            nombre_us: { val: record.NOMBRE_US },
            apellido_us: { val: record.APELLIDO_US },
            departamento_us: { val: record.DEPARTAMENTO_US },
            contrasena_us: { val: contrasenaUsHash },
            estado_us: { val: 1 },
            email_us: { val: email_us }
          }
        );
        await connection.commit();
      } catch (err) {
        console.error('Error al procesar registro:', err);
        errors.push(`Error al crear usuario ${record.NOMBRE_US} ${record.APELLIDO_US}: ${err.message}`);
      }
    }

    fs.unlinkSync(file.path);

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Se encontraron errores al procesar algunos usuarios',
        errors
      });
    } else {
      res.json({
        success: true,
        message: 'Usuarios cargados exitosamente'
      });
    }
  } catch (err) {
    console.error('Error al procesar el archivo:', err);
    res.status(500).json({
      success: false,
      message: 'Error al procesar el archivo',
      error: err.message
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

app.get('/usuarios_ejemplo.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=usuarios_ejemplo.csv');
  res.sendFile(path.join(__dirname, 'usuarios_ejemplo.csv'));
});

app.get('/usuarios_ejemplo.xlsx', (req, res) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=usuarios_ejemplo.xlsx');
  res.sendFile(path.join(__dirname, 'usuarios_ejemplo.xlsx'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Aplicación escuchando en http://0.0.0.0:${PORT}`);
});

// Para hashear contraseñas
async function hashPassword(password) {
  return await bcrypt.hash(password, saltRounds);
}

// Para verificar contraseñas
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Set para almacenar periodos que ya están siendo procesados
const periodosEnProceso = new Set();

// Función para verificar periodos y actualizar contraseñas
async function verificarPeriodosYActualizarContrasenas() {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    
    // Obtener la hora actual de Oracle en timezone correcto
    const timeResult = await connection.execute(
      `SELECT 
        TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/New_York', 'DD/MM/YYYY') as fecha_actual,
        TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/New_York', 'HH24:MI:SS') as hora_actual
       FROM DUAL`
    );

    const fechaActual = timeResult.rows[0][0];
    const horaActual = timeResult.rows[0][1];

    // Obtener periodos activos
    const periodosResult = await connection.execute(
      `SELECT 
        PERIODO_POSTULACION,
        TO_CHAR(FECHA_PUBLICACION, 'DD/MM/YYYY') as fecha_votacion,
        HORA_FIN
       FROM CONFIGURACION_VOTACION 
       WHERE ESTADO_PERIODO = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    for (const periodo of periodosResult.rows) {
      // Si el periodo ya está siendo procesado, saltarlo
      if (periodosEnProceso.has(periodo.PERIODO_POSTULACION)) {
        continue;
      }

      // Convertir fechas a objetos Date para comparación
      const [diaVot, mesVot, anioVot] = periodo.FECHA_VOTACION.split('/');
      const fechaVotObj = new Date(anioVot, mesVot - 1, diaVot);
      
      const [diaAct, mesAct, anioAct] = fechaActual.split('/');
      const fechaActObj = new Date(anioAct, mesAct - 1, diaAct);

      // Convertir horas a minutos para comparación
      const [horaActualHH, horaActualMM, horaActualSS] = horaActual.split(':').map(Number);
      const minutosActuales = horaActualHH * 60 + horaActualMM;

      const [horaFinHH, horaFinMM] = periodo.HORA_FIN.split(':').map(Number);
      const minutosFinVotacion = horaFinHH * 60 + horaFinMM;

      // Verificar si es el mismo día y pasó la hora de fin
      const esHoy = fechaActObj.getFullYear() === fechaVotObj.getFullYear() &&
                   fechaActObj.getMonth() === fechaVotObj.getMonth() &&
                   fechaActObj.getDate() === fechaVotObj.getDate();
      
      const pasaronHoraFin = minutosActuales > minutosFinVotacion || 
                            (minutosActuales === minutosFinVotacion && horaActualSS > 0);

      if (esHoy && pasaronHoraFin) {
        // Marcar el periodo como en proceso
        periodosEnProceso.add(periodo.PERIODO_POSTULACION);

        console.log(`Actualizando contraseñas para periodo ${periodo.PERIODO_POSTULACION}...`);
        
        try {
          // Obtener usuarios votantes
          const usuarios = await connection.execute(
            `SELECT ID_US FROM USUARIOS WHERE ID_ROL = '2' AND ESTADO_US = 1`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );

          // Actualizar contraseñas
          for (const usuario of usuarios.rows) {
            const nuevaContrasena = crypto.randomBytes(4).toString('hex');
            const contrasenaHash = await hashPassword(nuevaContrasena);

            await connection.execute(
              `UPDATE USUARIOS SET CONTRASENA_US = :password WHERE ID_US = :userId`,
              {
                password: { val: contrasenaHash },
                userId: { val: usuario.ID_US }
              }
            );
          }

          // Actualizar estado del periodo a finalizado
          await connection.execute(
            `UPDATE CONFIGURACION_VOTACION SET ESTADO_PERIODO = 0 
             WHERE PERIODO_POSTULACION = :periodo`,
            { periodo: { val: periodo.PERIODO_POSTULACION } }
          );

          await connection.commit();
          console.log(`✓ Periodo ${periodo.PERIODO_POSTULACION} finalizado y contraseñas actualizadas`);
        } catch (error) {
          console.error(`Error procesando periodo ${periodo.PERIODO_POSTULACION}:`, error);
          // Remover el periodo del set en caso de error
          periodosEnProceso.delete(periodo.PERIODO_POSTULACION);
          throw error;
        }
      }
    }

  } catch (error) {
    console.error('Error en verificación de periodos:', error);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error en rollback:', rollbackError);
      }
    }
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('Error cerrando conexión:', closeError);
      }
    }
  }
}

// Iniciar verificación periódica cada segundo
setInterval(verificarPeriodosYActualizarContrasenas, 1000);

// Ruta para verificar usuario y contraseña
app.get('/verificar-usuario', async (req, res) => {
  const { usuario, contrasenaHash } = req.query;

  try {
    const connection = await oracledb.getConnection(dbConfig);
    
    const result = await connection.execute(
      `SELECT COUNT(*) AS EXISTE
       FROM USUARIOS 
       WHERE ID_US = :usuario 
       AND CONTRASENA_US = :contrasenaHash
       AND ESTADO_US = 1`,
      [usuario, contrasenaHash]
    );

    const existe = result.rows[0][0] > 0;
    await connection.close();

    res.json({ existe });
  } catch (error) {
    console.error('Error al verificar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para verificar si el usuario es administrador
app.get('/verificar-administrador', async (req, res) => {
  const { usuario, contrasenaHash } = req.query;

  try {
    const connection = await oracledb.getConnection(dbConfig);
    
    const result = await connection.execute(
      `SELECT COUNT(*) AS EXISTE
       FROM USUARIOS 
       WHERE ID_US = :usuario 
       AND CONTRASENA_US = :contrasenaHash
       AND ESTADO_US = 1
       AND ID_ROL = '1'`,
      [usuario, contrasenaHash]
    );

    const existe = result.rows[0][0] > 0;
    await connection.close();

    res.json({ existe });
  } catch (error) {
    console.error('Error al verificar administrador:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para obtener todos los departamentos
app.get('/api/departamentos', async (req, res) => {
  try {
    const connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT DISTINCT DEPARTAMENTO_US 
       FROM USUARIOS 
       WHERE ID_ROL = '2' 
       AND ESTADO_US = '1'
       AND DEPARTAMENTO_US IS NOT NULL
       ORDER BY DEPARTAMENTO_US`
    );

    await connection.close();

    const departamentos = result.rows.map(row => row[0]).filter(Boolean);
    console.log('Departamentos encontrados:', departamentos);
    res.json(departamentos);
  } catch (err) {
    console.error('Error al obtener departamentos:', err);
    res.status(500).json({ error: 'Error al obtener departamentos' });
  }
});

// Ruta para obtener resultados por departamento
app.get('/api/resultados/departamento', async (req, res) => {
  const periodo = req.query.periodo;
  const departamento = req.query.departamento;

  if (!periodo || !departamento) {
    return res.status(400).json({ message: 'Periodo y departamento son requeridos' });
  }

  try {
    const connection = await oracledb.getConnection(dbConfig);

    // Primero obtener los usuarios del departamento
    const usuariosResult = await connection.execute(
      `SELECT ID_US 
       FROM USUARIOS 
       WHERE DEPARTAMENTO_US = :departamento 
       AND ID_ROL = '2' 
       AND ESTADO_US = '1'`,
      [departamento]
    );

    // Crear array de IDs hasheados
    const usuariosHasheados = usuariosResult.rows.map(([id]) => hashUsuario(id));

    if (usuariosHasheados.length === 0) {
      await connection.close();
      return res.json({
        noData: true,
        message: `No se encontraron votantes registrados en el departamento ${departamento} para el periodo ${periodo}.`
      });
    }

    // Obtener los votos usando los IDs hasheados
    const query = `
      SELECT 
        CASE 
          WHEN v.ID_LISTA IN ('nulo', 'blanco') THEN UPPER(v.ID_LISTA)
          ELSE l.NOMBRE_LISTA 
        END as NOMBRE,
        COUNT(v.ID_US) as VOTOS
      FROM VOTOS v
      LEFT JOIN LISTAS l ON v.ID_LISTA = l.ID_LISTA AND v.PERIODO_POSTULACION = l.PERIODO_POSTULACION
      WHERE v.PERIODO_POSTULACION = :periodo
      AND v.ID_US IN (${usuariosHasheados.map(id => `'${id}'`).join(',')})
      GROUP BY 
        CASE 
          WHEN v.ID_LISTA IN ('nulo', 'blanco') THEN UPPER(v.ID_LISTA)
          ELSE l.NOMBRE_LISTA 
        END
      ORDER BY 
        CASE 
          WHEN UPPER(v.ID_LISTA) IN ('NULO', 'BLANCO') THEN 2
          ELSE 1 
        END,
        NOMBRE`;

    const result = await connection.execute(
      query,
      [periodo],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Si no hay votos registrados
    if (result.rows.length === 0) {
      await connection.close();
      return res.json({
        noData: true,
        message: `No se han registrado votos en el departamento ${departamento} para el periodo ${periodo}.`
      });
    }

    // Formatear resultados
    const resultadosFormateados = result.rows.map(row => ({
      nombre: row.NOMBRE,
      votos: row.VOTOS
    }));

    await connection.close();
    res.json(resultadosFormateados);
  } catch (err) {
    console.error('Error al obtener resultados por departamento:', err);
    res.status(500).json({ 
      message: 'Error al obtener resultados por departamento',
      error: err.message 
    });
  }
});
