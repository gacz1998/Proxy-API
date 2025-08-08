const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const sharp = require('sharp');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

let cacheProductos = null;
let cacheTimestamp = 0;
const CACHE_EXPIRATION = 6 * 60 * 60 * 1000; // 6 horas

async function fetchProductosDesdeAPI() {
  const API_BASE = 'http://api.chile.cdopromocionales.com/v2/products';
  const AUTH_TOKEN = 'd5pYdHwhB-r9F8uBvGvb1w';
  const pageSize = 220; // máximo permitido por la API
  let pageNumber = 1;
  let todosProductos = [];
  let totalLeidos = 0;

  while (true) {
    const url = `${API_BASE}?auth_token=${AUTH_TOKEN}&page_size=${pageSize}&page_number=${pageNumber}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.products || !Array.isArray(data.products)) {
      throw new Error('Respuesta inválida de API');
    }

    todosProductos = todosProductos.concat(data.products);
    totalLeidos += data.products.length;

    if (data.products.length < pageSize) {
      // Última página
      break;
    }
    pageNumber++;
  }

  console.log(`Productos cargados desde API: ${totalLeidos}`);

  return todosProductos;
}

// Endpoint para paginar productos
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

    const size = Math.min(Math.max(parseInt(page_size) || 24, 1), 1000);
    const page = Math.max(parseInt(page_number) || 1, 1);

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

// NUEVO: endpoint para producto por SKU
app.get('/proxy/products/:sku', async (req, res) => {
  try {
    const skuBuscado = req.params.sku.toLowerCase();

    // Si cache no existe o expiró, recargar cache
    const ahora = Date.now();
    if (!cacheProductos || (ahora - cacheTimestamp) > CACHE_EXPIRATION) {
      console.log('Actualizando cache de productos para búsqueda SKU...');
      cacheProductos = await fetchProductosDesdeAPI();
      cacheTimestamp = ahora;
    }

    // Buscar producto en cache por sku (insensible a mayúsculas)
    const producto = cacheProductos.find(p => {
      const skuProducto = (p.sku || p.code || '').toLowerCase();
      return skuProducto === skuBuscado;
    });

    if (!producto) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }

    res.json(producto);
  } catch (error) {
    console.error('Error en búsqueda por SKU:', error);
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

// Tamaños soportados para imágenes
const SIZE_MAP = {
  small: 200,
  medium: 800,
  large: 1600
};

app.get('/proxy/image', async (req, res) => {
  let imageUrl = req.query.url;
  const size = req.query.size; // small, medium, large o undefined

  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('URL inválida');
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image')) {
      return res.redirect('https://via.placeholder.com/200x150?text=Sin+Imagen');
    }

    if (!size || !SIZE_MAP[size]) {
      // Sin redimensionar, entregamos original
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Content-Type', response.headers.get('content-type'));
      response.body.pipe(res);
      return;
    }

    const buffer = await response.buffer();
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
