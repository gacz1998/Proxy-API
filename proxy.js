const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Proxy de productos con filtro por family y category (carga todas las páginas)
app.get('/proxy/products', async (req, res) => {
  const { page_size = 24, page_number = 1, family, category } = req.query;

  const API_BASE = 'http://api.chile.cdopromocionales.com/v2/products';
  const AUTH_TOKEN = 'd5pYdHwhB-r9F8uBvGvb1w';
  const PAGE_SIZE_API = 100;  // Tamaño de página para la API original

  let currentPage = 1;
  let allProducts = [];
  let hasMore = true;

  try {
    // Recorre todas las páginas de la API original
    while (hasMore) {
      const apiUrl = `${API_BASE}?auth_token=${AUTH_TOKEN}&page_size=${PAGE_SIZE_API}&page_number=${currentPage}`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!data.products || !Array.isArray(data.products) || data.products.length === 0) {
        hasMore = false;
        break;
      }

      allProducts = allProducts.concat(data.products);

      // Si la respuesta fue menor al size, llegamos al final
      if (data.products.length < PAGE_SIZE_API) {
        hasMore = false;
      } else {
        currentPage++;
      }
    }

    // Aplica filtros locales
    let productosFiltrados = allProducts;

    if (family) {
      productosFiltrados = productosFiltrados.filter(p =>
        p.family_name?.toLowerCase() === family.toLowerCase()
      );
    }

    if (category) {
      productosFiltrados = productosFiltrados.filter(p =>
        p.category?.toLowerCase() === category.toLowerCase()
      );
    }

    // Paginación local
    const size = parseInt(page_size);
    const page = parseInt(page_number);
    const start = (page - 1) * size;
    const end = start + size;
    const pageItems = productosFiltrados.slice(start, end);

    res.json({
      products: pageItems,
      total: productosFiltrados.length,
      page_number: page,
      page_size: size
    });
  } catch (error) {
    console.error('Error proxy productos:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// Proxy de imágenes (sin cambios)
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
