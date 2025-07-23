app.get('/proxy/products', async (req, res) => {
  const { page_size = 24, page_number = 1, family, category } = req.query;

  const pageSizeAPI = 100;
  let pageNumberAPI = 1;
  let allProducts = [];
  let hasMore = true;

  try {
    while (hasMore) {
      const API_URL = `http://api.chile.cdopromocionales.com/v2/products?auth_token=d5pYdHwhB-r9F8uBvGvb1w&page_size=${pageSizeAPI}&page_number=${pageNumberAPI}`;
      const response = await fetch(API_URL);
      const data = await response.json();

      if (!data.products || !Array.isArray(data.products) || data.products.length === 0) {
        hasMore = false;
        break;
      }

      allProducts.push(...data.products);

      // Si la cantidad devuelta es menor que el tamaño de página, ya no hay más
      if (data.products.length < pageSizeAPI) {
        hasMore = false;
      } else {
        pageNumberAPI++;
      }
    }

    let productosFiltrados = allProducts;

    if (family) {
      productosFiltrados = productosFiltrados.filter(p => {
        return p.family_name && p.family_name.toLowerCase() === family.toLowerCase();
      });
    }

    if (category) {
      productosFiltrados = productosFiltrados.filter(p => {
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
