const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
// La librería 'sharp' fue eliminada para evitar picos de memoria (OOMKilled) en el plan Starter.

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// La caché se ajusta a 10 minutos para reducir la latencia de las peticiones a la API externa.
let cacheProductos = null;
let cacheTimestamp = 0;
const CACHE_EXPIRATION = 10 * 60 * 1000; // 10 minutos en ms

// Función de fetch simplificada, asumiendo que 1000 productos es suficiente para el catálogo actual (450)
async function fetchProductosDesdeAPI() {
  // ATENCIÓN: Esta URL asume que la API externa permite page_size=1000 o que 450 productos caben en una página.
  const API_URL = `http://api.chile.cdopromocionales.com/v2/products?auth_token=d5pYdHwhB-r9F8uBvGvb1w&page_size=1000&page_number=1`;
  const response = await fetch(API_URL);
  
  if (!response.ok) {
    throw new Error(`Error al obtener datos de la API externa: ${response.status}`);
  }
  
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

    // 🚀 CORRECCIÓN: Reimplementación de validación robusta para paginación
    // Asegura que page_size esté entre 1 y 1000, y page_number sea al menos 1.
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

app.get('/proxy/image', async (req, res) => {
  let imageUrl = req.query.url;
  const size = req.query.size || 'original'; // default size

  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('URL inválida');
  }

  // Reemplaza "original" en la URL por el tamaño solicitado si existe
  if (size !== 'original') {
    // 💡 Usa una expresión regular para asegurar que reemplaza 'original' incluso si hay mayúsculas
    imageUrl = imageUrl.replace(/original/gi, size);
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image')) {
      return res.redirect('https://via.placeholder.com/400x400?text=Sin+Imagen');
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type'));
    
    // Transfiere el cuerpo de la respuesta de la imagen directamente al cliente
    response.body.pipe(res);
  } catch (error) {
    console.error('Error al cargar imagen:', error);
    res.redirect('https://via.placeholder.com/400x400?text=Sin+Imagen');
  }
});

// 🚀 CORRECCIÓN DE PUERTO: Usa el host '0.0.0.0' para evitar el error EADDRINUSE en Render
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
