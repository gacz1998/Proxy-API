const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

const API_URL_BASE = 'http://api.chile.cdopromocionales.com/v2/products?auth_token=d5pYdHwhB-r9F8uBvGvb1w';

app.get('/proxy/products', async (req, res) => {
  const { page_size = 24, page_number = 1, family, category } = req.query;

  // Construir parámetros para la API externa
  const params = new URLSearchParams({
    page_size,
    page_number,
  });
  if (family) params.append('family', family);
  if (category) params.append('category', category);

  const API_URL = `${API_URL_BASE}&${params.toString()}`;

  try {
    const response = await fetch(API_URL);
    const data = await response.json();

    if (!data.products || !Array.isArray(data.products)) {
      return res.status(500).json({ error: 'Respuesta inválida de API original' });
    }

    res.json(data);

  } catch (error) {
    console.error('Error proxy productos:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// Proxy para imágenes (igual que antes)
app.get('/proxy/image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('URL inválida');
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image')) {
      return res.redirect('https://via.placeholder.com/200x150?text=Sin+Imagen');
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type'));
    response.body.pipe(res);
  } catch (error) {
    console.error('Error al cargar imagen:', error);
    res.redirect('https://via.placeholder.com/200x150?text=Sin+Imagen');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
