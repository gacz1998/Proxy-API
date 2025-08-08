const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

let cacheProductos = null;
let cacheTimestamp = 0;
const CACHE_EXPIRATION = 6 * 60 * 60 * 1000; // 6 horas

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

app.get('/proxy/image', async (req, res) => {
  let imageUrl = req.query.url;
  const size = req.query.size || 'original'; // default size

  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('URL inválida');
  }

  // Reemplaza "original" en la URL por el tamaño solicitado si existe
  if (size !== 'original') {
    if (imageUrl.includes('original')) {
      imageUrl = imageUrl.replace(/original/gi, size);
    }
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image')) {
      return res.redirect('https://via.placeholder.com/400x400?text=Sin+Imagen');
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type'));
    response.body.pipe(res);
  } catch (error) {
    console.error('Error al cargar imagen:', error);
    res.redirect('https://via.placeholder.com/400x400?text=Sin+Imagen');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
