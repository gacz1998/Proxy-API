const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const sharp = require('sharp'); // <-- Importa sharp

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

let cacheProductos = null;
let cacheTimestamp = 0;
const CACHE_EXPIRATION = 10 * 60 * 1000; // 10 minutos en ms

async function fetchProductosDesdeAPI() {
  const API_URL = `http://api.chile.cdopromocionales.com/v2/products?auth_token=d5pYdHwhB-r9F8uBvGvb1w&page_size=1000&page_number=1`;
  const response = await fetch(API_URL);
  const data = await response.json();
  if (!data.products || !Array.isArray(data.products)) {
    throw new Error('Respuesta inválida de API');
  }
  return data.products;
}

app.get('/proxy/products', async (req, res) => {
  try {
    const ahora = Date.now();
    if (!cacheProductos || (ahora - cacheTimestamp) > CACHE_EXPIRATION) {
      console.log('Actualizando cache de productos...');
      cacheProductos = await fetchProductosDesdeAPI();
      cacheTimestamp = ahora;
    }

    let productosFiltrados = cacheProductos;

    const { page_size = 24, page_number = 1, family, category } = req.query;

    if (family) {
      productosFiltrados = productosFiltrados.filter(p => p.family_name?.toLowerCase() === family.toLowerCase());
    }
    if (category) {
      productosFiltrados = productosFiltrados.filter(p => p.category?.toLowerCase() === category.toLowerCase());
    }

    const size = parseInt(page_size);
    const page = parseInt(page_number);
    const startIndex = (page - 1) * size;
    const endIndex = startIndex + size;
    const pageItems = productosFiltrados.slice(startIndex, endIndex);

    res.json({
      products: pageItems,
      total: productosFiltrados.length,
      page_number: page,
      page_size: size,
    });

  } catch (error) {
    console.error('Error proxy productos:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// Tamaños soportados y sus anchos en px
const SIZE_MAP = {
  small: 200,
  medium: 800,
  large: 1600
};

app.get('/proxy/image', async (req, res) => {
  const imageUrl = req.query.url;
  const size = req.query.size; // puede ser small, medium, large o undefined

  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('URL inválida');
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image')) {
      return res.redirect('https://via.placeholder.com/200x150?text=Sin+Imagen');
    }

    // Si no se solicita tamaño, devuelve imagen original directo
    if (!size || !SIZE_MAP[size]) {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Content-Type', response.headers.get('content-type'));
      response.body.pipe(res);
      return;
    }

    const buffer = await response.buffer();

    // Redimensionar con Sharp
    const width = SIZE_MAP[size];

    const resizedBuffer = await sharp(buffer)
      .resize({ width })
      .toBuffer();

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type'));
    res.send(resizedBuffer);

  } catch (error) {
    console.error('Error al cargar imagen:', error);
    res.redirect('https://via.placeholder.com/200x150?text=Sin+Imagen');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
