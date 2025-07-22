const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors()); // Permite solicitudes CORS desde cualquier origen

const PORT = process.env.PORT || 3000;

app.get('/proxy/products', async (req, res) => {
  const { page_size = 24, page_number = 1 } = req.query;

  const API_URL = `http://api.chile.cdopromocionales.com/v2/products?auth_token=d5pYdHwhB-r9F8uBvGvb1w&page_size=${page_size}&page_number=${page_number}`;

  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
