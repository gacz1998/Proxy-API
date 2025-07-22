const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Proxy de productos con filtro por family y category
app.get('/proxy/products', async (req, res) => {
  const { page_size = 24, page_number = 1, family, category } = req.query;
  const API_URL = `http://api.chile.cdopromocionales.com/v2/products?auth_token=d5pYdHwhB-r9F8uBvGvb1w&page_size=1000&page_number=1`;
  // Traemos todos (o máximo 1000) para luego filtrar localmente

  try {
    const response = await fetch(API_URL);
    const data = await response.json();

    if (!data.products || !Array.isArray(data.products)) {
      return res.status(500).json({ error: 'Respuesta inválida de API original' });
    }

    // Filtrado local por family
    let productosFiltrados = data.products;

    if (family) {
      productosFiltrados = productosFiltrados.filter(producto => {
        // Ajusta según campo exacto en producto que contiene family
        if (!producto.family_name) return false;
        return producto.family_name.toLowerCase() === family.toLowerCase();
      });
    }

    if (category) {
      productosFiltrados = productosFiltrados.filter(producto => {
        // Ajusta según campo exacto en producto que contiene category
        if (!producto.category) return false;
        return producto.category.toLowerCase() === category.toLowerCase();
      });
    }

    // Paginación local sobre productos filtrados
    const size = parseInt(page_size);
    const page = parseInt(page_number);
    const startIndex = (page - 1) * size;
    const endIndex = startIndex + size;
    const pageItems = productosFiltrados.slice(startIndex, endIndex);

    return res.json({
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

// Proxy para imágenes (descarta URLs inválidas)
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
