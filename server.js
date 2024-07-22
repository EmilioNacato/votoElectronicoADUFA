const express = require('express');
const path = require('path');
const app = express();
const port = 40000;

// Configurar la carpeta public para archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Aplicación escuchando en http://0.0.0.0:${port}`);
});
