const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

app.use(cors()); // Permitir todas las conexiones

const PORT = process.env.PORT || 3000;

// Proxy para productos
app.get('/proxy/products', async (req, res) => {
  const { page_size = 24, page_number = 1 } = req.query;
  const API_URL = `http://api.chile.cdopromocionales.com/v2/products?auth_token=d5pYdHwhB-r9F8uBvGvb1w&page_size=${page_size}&page_number=${page_number}`;

  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// Proxy para imágenes
app.get('/proxy/image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('Falta url de imagen');

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return res.status(500).send('Error al obtener la imagen');

    // Permitir CORS para que la imagen cargue en navegador sin bloqueo
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type'));

    // Pipe para enviar la imagen al cliente
    response.body.pipe(res);
  } catch (error) {
    res.status(500).send('Error en proxy de imagen');
  }
});

app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
