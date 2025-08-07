const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

const API_BASE = 'http://api.chile.cdopromocionales.com/v2/products';
const AUTH_TOKEN = 'd5pYdHwhB-r9F8uBvGvb1w';

// Ruta para obtener productos con paginación
app.get('/proxy/products', async (req, res) => {
  let page_size = parseInt(req.query.page_size, 10) || 10;
  let page_number = parseInt(req.query.page_number, 10) || 1;

  page_size = Math.min(Math.max(page_size, 1), 50);
  page_number = Math.max(page_number, 1);

  const apiUrl = `${API_BASE}?auth_token=${AUTH_TOKEN}&page_size=${page_size}&page_number=${page_number}`;

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      console.error('Error en API externa:', response.statusText);
      return res.status(502).json({ error: 'Error en la API externa' });
    }

    const data = await response.json();

    if (!data.products || !Array.isArray(data.products)) {
      return res.status(500).json({ error: 'Respuesta inválida de la API original' });
    }

    res.json({
      products: data.products,
      total: data.total || 0,
      page_number,
      page_size,
    });
  } catch (error) {
    console.error('Error en el proxy de productos:', error);
    res.status(500).json({ error: 'Error al obtener productos desde el proxy' });
  }
});

// Ruta para cargar imagen y servirla desde el proxy
app.get('/proxy/image', async (req, res) => {
  const imageUrl = req.query.url;

  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('URL de imagen inválida');
  }

  try {
    const response = await fetch(imageUrl);

    if (!response.ok || !response.headers.get('content-type')?.startsWith('image')) {
      return res.redirect('https://via.placeholder.com/300x200?text=Sin+Imagen');
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type'));
    response.body.pipe(res);
  } catch (error) {
    console.error('Error al obtener imagen desde el proxy:', error);
    res.redirect('https://via.placeholder.com/300x200?text=Sin+Imagen');
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor proxy corriendo en http://localhost:${PORT}`);
});
