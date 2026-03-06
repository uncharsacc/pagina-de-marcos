const fs = require('fs');
const path = require('path');

const dirLogos = './logos'; // Carpeta donde están los logos
const archivoSalida = './datos-logos.js';

try {
    const archivos = fs.readdirSync(dirLogos);
    const mapaLogos = {};

    archivos.forEach(archivo => {
        // Obtenemos el nombre sin la extensión (ej: "VESPA")
        const nombreSinExt = path.parse(archivo).name;
        // Guardamos la ruta completa del archivo
        mapaLogos[nombreSinExt] = `logos/${archivo}`;
    });

    const contenido = `const mapaLogos = ${JSON.stringify(mapaLogos, null, 2)};`;
    fs.writeFileSync(archivoSalida, contenido);

    console.log("✅ ¡Mapa de logos generado con éxito en datos-logos.js!");
} catch (error) {
    console.error("❌ Error al leer la carpeta de logos:", error);
}