const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// La caché se ajusta a 10 minutos para reducir la latencia de las peticiones a la API externa.
let cacheProductos = null;
let cacheTimestamp = 0;
const CACHE_EXPIRATION = 10 * 60 * 1000; // 10 minutos en ms

/**
 * 🚀 OPTIMIZACIÓN DE CONCURRENCIA:
 * Obtiene todos los productos de la API externa realizando hasta 10 peticiones
 * de paginación de forma concurrente (en paralelo) usando Promise.all.
 * Esto reduce drásticamente el tiempo de recarga de la caché.
 */
async function fetchProductosDesdeAPI() {
    const API_BASE = 'http://api.chile.cdopromocionales.com/v2/products';
    const AUTH_TOKEN = 'd5pYdHwhB-r9F8uBvGvb1w';
    const pageSize = 100; // Tamaño de página seguro
    
    // Definimos un número máximo de páginas a revisar concurrentemente (cubre hasta 1000 productos)
    const MAX_PAGES = 10; 
    
    console.log('Iniciando carga CONCURRENTE de productos (hasta 10 páginas)...');
    
    const pagePromises = [];
    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
        const url = `${API_BASE}?auth_token=${AUTH_TOKEN}&page_size=${pageSize}&page_number=${pageNumber}`;
        
        // Creamos una promesa para cada página, manejando errores internos para que Promise.all no falle
        pagePromises.push(
            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        console.warn(`Página ${pageNumber} falló con status ${response.status}. Ignorando.`);
                        // Devolvemos un objeto vacío en caso de fallo de red/status para no romper Promise.all
                        return { products: [] }; 
                    }
                    return response.json();
                })
                .then(data => {
                    if (!data.products || !Array.isArray(data.products)) {
                        console.warn(`Respuesta inválida para página ${pageNumber}. Ignorando.`);
                        return { products: [] };
                    }
                    // Retornamos los productos y una bandera para saber si fue la última página
                    return { 
                        products: data.products, 
                        isLastPage: data.products.length < pageSize 
                    };
                })
                .catch(error => {
                    console.error(`Error de red al cargar página ${pageNumber}: ${error.message}`);
                    return { products: [] };
                })
        );
    }

    // Esperamos a que todas las peticiones concurrentes finalicen
    const results = await Promise.all(pagePromises);

    let todosProductos = [];
    
    // Procesamos secuencialmente los resultados CONCURRENTES:
    // Concatenamos los productos y nos detenemos cuando encontramos la página parcial (la última).
    for (const result of results) {
        if (result.products.length > 0) {
            todosProductos = todosProductos.concat(result.products);
            
            // Si esta página tiene menos que el tamaño de página, asumimos que es la última y terminamos
            if (result.isLastPage) {
                break;
            }
        }
    }

    if (todosProductos.length === 0) {
        // Lanzar error si ninguna página pudo cargar, manteniendo la robustez del cache.
        throw new Error('No se pudieron cargar productos de la API');
    }

    console.log(`Productos cargados desde API (Concurrente): ${todosProductos.length}`);
    return todosProductos;
}

app.get('/proxy/products', async (req, res) => {
    try {
        const ahora = Date.now();
        // Lógica de caché: actualiza solo si la caché está vacía o ha expirado
        if (!cacheProductos || (ahora - cacheTimestamp) > CACHE_EXPIRATION) {
            console.log('Actualizando cache de productos...');
            cacheProductos = await fetchProductosDesdeAPI();
            cacheTimestamp = ahora;
        }

        let productosFiltrados = cacheProductos;

        const { page_size = 24, page_number = 1, family, category } = req.query;

        // Lógica de filtrado
        if (family) {
            productosFiltrados = productosFiltrados.filter(p => p.family_name?.toLowerCase() === family.toLowerCase());
        }
        if (category) {
            productosFiltrados = productosFiltrados.filter(p => p.category?.toLowerCase() === category.toLowerCase());
        }

        // Lógica de paginación para la respuesta del proxy
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

// Usa el host '0.0.0.0' para evitar el error EADDRINUSE
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
