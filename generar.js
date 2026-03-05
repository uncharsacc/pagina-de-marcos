const fs = require('fs');
const path = require('path');

const dirImagenes = './imagenes'; // Tu carpeta principal
const resultado = {};

// Leer las carpetas de marcas
const marcas = fs.readdirSync(dirImagenes);

marcas.forEach(marca => {
    const rutaMarca = path.join(dirImagenes, marca);
    
    if (fs.statSync(rutaMarca).isDirectory()) {
        // Leemos TODO lo que hay adentro que sea imagen
        const fotos = fs.readdirSync(rutaMarca).filter(archivo => 
            /\.(jpg|jpeg|png|webp|gif)$/i.test(archivo)
        );
        resultado[marca] = fotos;
    }
});

// Guardamos la lista en un archivo que el HTML pueda leer
const contenido = `const catalogoImagenes = ${JSON.stringify(resultado, null, 2)};`;
fs.writeFileSync('./datos-imagenes.js', contenido);

console.log("✅ ¡Lista de imágenes actualizada!");