const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// Crear carpeta images si no existe
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}

// Servir carpeta images estáticamente
app.use('/images', express.static(imagesDir));

const SHOP = 'tu-tienda.myshopify.com';
const ACCESS_TOKEN = 'tu-access-token-shopify';

async function descargarImagen(url) {
  try {
    // Crear nombre único para la imagen con hash del URL
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const ext = path.extname(url).split('?')[0] || '.jpg';
    const filename = `${hash}${ext}`;
    const filepath = path.join(imagesDir, filename);

    // Si ya existe, devolver ruta local
    if (fs.existsSync(filepath)) {
      return `/images/${filename}`;
    }

    // Descargar imagen
    const response = await fetch(url);
    if (!response.ok) throw new Error('Error descargando imagen');

    const buffer = await response.buffer();
    fs.writeFileSync(filepath, buffer);
    return `/images/${filename}`;
  } catch (error) {
    console.error('Error en descargarImagen:', error);
    return null;
  }
}

app.get('/proxy/product', async (req, res) => {
  const sku = req.query.sku;
  if (!sku) return res.status(400).json({ error: 'SKU es requerido' });

  try {
    // Traer productos de Shopify (puedes ajustar endpoint y lógica)
    const response = await fetch(`https://${SHOP}/admin/api/2023-04/products.json`, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Error en API Shopify' });
    }

    const data = await response.json();
    const product = data.products.find(p =>
      p.variants.some(v => v.sku === sku)
    );

    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    // Descargar imágenes y reemplazar URLs por locales
    for (let i = 0; i < product.images.length; i++) {
      const url = product.images[i].src;
      const localPath = await descargarImagen(url);
      if (localPath) product.images[i].localSrc = localPath;
      else product.images[i].localSrc = url; // fallback URL original
    }

    res.json(product);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.listen(port, () => {
  console.log(`Proxy corriendo en puerto ${port}`);
});
