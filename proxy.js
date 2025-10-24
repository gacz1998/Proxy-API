const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// =========================================================================
// === CONFIGURACIÓN DE CACHÉ CON DIFERENTES EXPIRACIONES ===
// =========================================================================

// La caché de productos tiene toda la información.
let cacheProductos = null;
let cacheTimestamp = 0;

// EXPIRACIÓN 1: Para la información sensible como Stock - 30 MINUTOS
const CACHE_EXPIRATION_STOCK = 30 * 60 * 1000; // 30 minutos en ms

// EXPIRACIÓN 2: Para la información de Imágenes/Recursos pesados - 14 DÍAS
const CACHE_EXPIRATION_PRODUCTS = 14 * 24 * 60 * 60 * 1000; // 14 días en ms

// Bandera para evitar múltiples recargas concurrentes
let isRefreshingCache = false; 

// Caché para los datos binarios de las imágenes con expiración de 14 días
const imageCache = new Map();


/**
 * 🚀 OPTIMIZACIÓN DE CONCURRENCIA:
 * Obtiene todos los productos de la API externa realizando hasta 6 peticiones
 * de paginación de forma concurrente (en paralelo) usando Promise.all.
 */
async function fetchProductosDesdeAPI() {
    const API_BASE = 'http://api.chile.cdopromocionales.com/v2/products';
    const AUTH_TOKEN = 'd5pYdHwhB-r9F8uBvGvb1w';
    const pageSize = 100; 
    
    // Usamos 6 páginas (600 productos máx.) en concurrencia.
    const MAX_PAGES = 6; 
    
    console.log(`Iniciando carga CONCURRENTE de productos (hasta ${MAX_PAGES} páginas)...`);
    
    const pagePromises = [];
    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
        const url = `${API_BASE}?auth_token=${AUTH_TOKEN}&page_size=${pageSize}&page_number=${pageNumber}`;
        
        // Creamos una promesa para cada página
        pagePromises.push(
            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        console.warn(`Página ${pageNumber} falló con status ${response.status}. Ignorando.`);
                        return { products: [] }; 
                    }
                    return response.json();
                })
                .then(data => {
                    if (!data.products || !Array.isArray(data.products)) {
                        console.warn(`Respuesta inválida para página ${pageNumber}. Ignorando.`);
                        return { products: [] };
                    }
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

    const results = await Promise.all(pagePromises);
    let todosProductos = [];
    
    for (const result of results) {
        if (result.products.length > 0) {
            todosProductos = todosProductos.concat(result.products);
            if (result.isLastPage) {
                break;
            }
        }
    }

    if (todosProductos.length === 0) {
        throw new Error('No se pudieron cargar productos de la API');
    }

    console.log(`Productos cargados desde API (Concurrente): ${todosProductos.length}`);
    return todosProductos;
}

// 💖 RUTA: Endpoint de Keep-Alive para evitar que el servicio se apague.
app.get('/keep-alive', (req, res) => {
    console.log('Keep-Alive: Recibido pulso para mantener el servicio activo.');
    res.status(200).send('OK');
});

app.get('/proxy/products', async (req, res) => {
    try {
        const ahora = Date.now();
        // Usamos la expiración más corta (STOCK: 30 min) para decidir cuándo iniciar el refresh en BACKGROUND.
        const cacheExpiradaParaStock = (ahora - cacheTimestamp) > CACHE_EXPIRATION_STOCK;

        // ** LÓGICA DE STALE-WHILE-REVALIDATE (Stock 30 min) **
        if (!cacheProductos) {
            // 1. Si la caché está VACÍA (primer arranque), BLOQUEAMOS.
            console.log('Cache VACÍA. Bloqueando la petición para cargar inicial...');
            cacheProductos = await fetchProductosDesdeAPI();
            cacheTimestamp = ahora;
        } else if (cacheExpiradaParaStock && !isRefreshingCache) {
            // 2. Si la caché de STOCK expiró (30 min) y NO se está recargando:
            //    a) Servimos los productos viejos inmediatamente (no bloqueamos al usuario).
            //    b) Iniciamos la recarga en segundo plano (asíncrona).
            
            console.log('Cache EXPIRADA para STOCK. Sirviendo datos viejos e iniciando recarga en BACKGROUND (30 min).');
            
            isRefreshingCache = true;
            // Inicia la recarga sin esperar el resultado
            fetchProductosDesdeAPI()
                .then(nuevosProductos => {
                    cacheProductos = nuevosProductos;
                    cacheTimestamp = Date.now(); 
                    console.log('Recarga de caché en BACKGROUND completada con éxito. Próxima actualización de Stock en 30 minutos.');
                })
                .catch(error => {
                    console.error('ERROR en recarga de caché en BACKGROUND:', error.message);
                })
                .finally(() => {
                    isRefreshingCache = false;
                });
            
            // La ejecución del request continúa, sirviendo el 'cacheProductos' viejo
        }
        
        // ... filtramos y paginamos.
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

// =========================================================================
// === MANEJO DE IMÁGENES: Caching de 14 días para la imagen BINARIA ===
// =========================================================================

app.get('/proxy/image', async (req, res) => {
    let imageUrl = req.query.url;
    const size = req.query.size || 'original'; // default size
    const cacheKey = `${imageUrl}_${size}`;
    const ahora = Date.now();

    if (!imageUrl || !imageUrl.startsWith('http')) {
        return res.status(400).send('URL inválida');
    }

    // 1. Lógica de reescritura de URL
    let finalImageUrl = imageUrl;
    if (size !== 'original') {
        finalImageUrl = imageUrl.replace(/original/gi, size);
    }

    // 2. Verificar caché del proxy (14 días de expiración)
    const cachedImage = imageCache.get(cacheKey);

    if (cachedImage && (ahora - cachedImage.timestamp) < CACHE_EXPIRATION_PRODUCTS) {
        // La imagen está en caché y no ha expirado
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', cachedImage.contentType);
        // Devolvemos el Buffer desde la cadena base64 guardada
        return res.send(Buffer.from(cachedImage.data, 'base64'));
    }

    // 3. Obtener la imagen de la fuente externa (si expiró o no existe)
    try {
        const response = await fetch(finalImageUrl);
        const contentType = response.headers.get('content-type');
        
        if (!response.ok || !contentType?.startsWith('image')) {
            return res.redirect('https://via.placeholder.com/400x400?text=Sin+Imagen');
        }

        // 4. Leer y cachear la imagen (como cadena base64)
        const imageBuffer = await response.buffer();
        
        imageCache.set(cacheKey, {
            data: imageBuffer.toString('base64'), // Guardamos en base64 para evitar problemas de memoria con objetos Buffer
            contentType: contentType,
            timestamp: ahora
        });
        
        // 5. Devolver la imagen
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', contentType);
        res.send(imageBuffer);

    } catch (error) {
        console.error('Error al cargar imagen:', error);
        res.redirect('https://via.placeholder.com/400x400?text=Sin+Imagen');
    }
});

// Usa el host '0.0.0.0' para evitar el error EADDRINUSE
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    
    // Al iniciar el servidor, carga la caché por primera vez de forma asíncrona
    // Esto es vital para reducir la latencia de la PRIMERA petición después de un despliegue.
    fetchProductosDesdeAPI()
        .then(productos => {
            cacheProductos = productos;
            cacheTimestamp = Date.now();
            console.log('Carga inicial de caché completada en el arranque.');
        })
        .catch(err => {
            console.error('Error en la carga inicial de productos al arranque:', err.message);
        });
});
