const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

app.get('/proxy/products', async (req, res) => {
  const { page_size = 24, page_number = 1, family, category } = req.query;

  // Traemos hasta 1000 productos para filtrar localmente
  const API_URL = `http://api.chile.cdopromocionales.com/v2/products?auth_token=d5pYdHwhB-r9F8uBvGvb1w&page_size=1000&page_number=1`;

  try {
    const response = await fetch(API_URL);
    const data = await response.json();

    if (!data.products || !Array.isArray(data.products)) {
      return res.status(500).json({ error: 'Respuesta inválida de API original' });
    }

    let productosFiltrados = data.products;

    if (family) {
      productosFiltrados = productosFiltrados.filter(p => {
        // Cambia "family_name" según tu API real
        return p.family_name && p.family_name.toLowerCase() === family.toLowerCase();
      });
    }

    if (category) {
      productosFiltrados = productosFiltrados.filter(p => {
        // Cambia "category" según tu API real
        return p.category && p.category.toLowerCase() === category.toLowerCase();
      });
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
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
