## 🎮 TPS Three.js - Laboratorio de Colisiones y Animaciones 3D

Este proyecto es un entorno interactivo en tercera persona desarrollado con la biblioteca **Three.js**. Implementa un sistema avanzado de físicas utilizando `Octree` y `Capsule`, además de integrar una Máquina de Estados Finitos (FSM) para el control de animaciones de un avatar en tiempo real, permitiendo la navegación por un escenario de "Brutalismo" y la interacción dinámica mediante proyectiles procedimentales.

---

## 🚀 Características Principales

- **Sistema TPS y Animaciones:** Cámara orbital en tercera persona con un avatar 3D (Vanguard). Incluye un mezclador de animaciones (Idle, Walk, Run, Jump, Fall) que reacciona a las entradas del usuario y a las físicas del entorno.
- **Motor de Colisiones Dinámico:** Uso de `Octree` para mapear la geometría del escenario (GLTF) y evitar clipping de cámara, y `Capsule` para las colisiones exactas del jugador con el suelo y las paredes.
- **Proyectiles Procedurales y Animados:** - **Click Izquierdo:** El personaje realiza una animación de lanzamiento con el brazo izquierdo y dispara un **Prisma** (Cilindro con `n` lados).
  - **Click Derecho:** El personaje anima el brazo derecho y lanza una **Pirámide** (Cono con `n` lados base).
  - **Variación Dinámica:** Cada proyectil se instancia con un color RGB aleatorio, un tamaño variable y un número de caras distinto al momento de hacer clic.
- **Optimización Asíncrona:** Carga de múltiples recursos simultáneos (Modelo FBX, Escenario GLTF y 6+ pistas de animación) unificados mediante `Promise.all` para asegurar un renderizado sin interrupciones ni cargas parciales.

---

## 🛠️ Tecnologías Utilizadas

El proyecto prioriza el uso de estándares modernos y renderizado de alto rendimiento en el navegador.

![Three.js](https://img.shields.io/badge/threejs-black?style=for-the-badge&logo=three.js&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![WebGL](https://img.shields.io/badge/WebGL-990000?style=for-the-badge&logo=webgl&logoColor=white)
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![Mixamo](https://img.shields.io/badge/Mixamo-2D3342?style=for-the-badge)
![Sketchfab](https://img.shields.io/badge/Sketchfab-1CAAD9?style=for-the-badge&logo=sketchfab&logoColor=white)

### 📊 Porcentaje de Uso
Dado que es un entorno gráfico interactivo, el proyecto se divide entre la lógica de programación y la carga de recursos visuales (Assets):

* **Recursos 3D y Assets (Modelos, Animaciones, Texturas):** ~70% del volumen del proyecto. Procesados a través de Mixamo (FBX) y entornos mapeados de Sketchfab (GLTF).
* **JavaScript (Lógica FSM, Físicas y API de Three.js):** ~25% de la estructura funcional.
* **HTML5/CSS3 (Interfaz y Lienzo WebGL):** ~5% de la estructura de renderizado.

---

## 👨‍💻 Información del Desarrollador

* **Nombre:** Miguel Angel Cano Alejandro
* **Universidad:** Instituto Tecnológico de Pachuca
* **Carrera:** Ingeniería en Sistemas Computacionales
* **Semestre:** 6to Semestre
* **Correo Electrónico:** mcanoalejandro@gmail.com
* **Teléfono:** +52 772 148 6990

---

## 📂 Estructura del Proyecto

Basada en una organización modular para integrar correctamente los cargadores `GLTFLoader` y `FBXLoader`, junto con las texturas y esqueletos de animación:

```text
📦 THREEJS-3D-SCENERY
 ┣ 📂 assets
 ┃ ┣ 📂 build
 ┃ ┃ ┣ 📜 three.core.js
 ┃ ┃ ┗ 📜 three.module.js
 ┃ ┣ 📂 css
 ┃ ┃ ┗ 📜 style.css
 ┃ ┣ 📂 img
 ┃ ┃ ┗ 🖼️ favicon.png
 ┃ ┣ 📂 js
 ┃ ┃ ┗ 📜 main.js
 ┃ ┣ 📂 jsm
 ┃ ┃ ┣ 📂 curves
 ┃ ┃ ┃ ┣ 📜 NURBSCurve.js
 ┃ ┃ ┃ ┗ 📜 NURBSUtils.js
 ┃ ┃ ┣ 📂 helpers
 ┃ ┃ ┃ ┗ 📜 OctreeHelper.js
 ┃ ┃ ┣ 📂 libs
 ┃ ┃ ┃ ┣ 📜 fflate.module.js
 ┃ ┃ ┃ ┣ 📜 lil-gui.module.min.js
 ┃ ┃ ┃ ┗ 📜 stats.module.js
 ┃ ┃ ┣ 📂 loaders
 ┃ ┃ ┃ ┣ 📜 FBXLoader.js
 ┃ ┃ ┃ ┗ 📜 GLTFLoader.js
 ┃ ┃ ┣ 📂 math
 ┃ ┃ ┃ ┣ 📜 Capsule.js
 ┃ ┃ ┃ ┗ 📜 Octree.js
 ┃ ┃ ┗ 📂 utils
 ┃ ┃   ┣ 📜 BufferGeometryUtils.js
 ┃ ┃   ┗ 📜 SkeletonUtils.js
 ┃ ┗ 📂 models
 ┃   ┣ 📂 fbx
 ┃   ┃ ┣ 📦 Breathing Idle.fbx
 ┃   ┃ ┣ 📦 Falling.fbx
 ┃   ┃ ┣ 📦 Jump.fbx
 ┃   ┃ ┣ 📦 Running.fbx
 ┃   ┃ ┣ 📦 Throw Left.fbx
 ┃   ┃ ┣ 📦 Throw Right.fbx
 ┃   ┃ ┣ 📦 Vanguard By T. Choonyung.fbx
 ┃   ┃ ┗ 📦 Walking.fbx
 ┃   ┗ 📂 gltf
 ┃     ┗ 📂 brutalism
 ┃       ┣ 📂 textures
 ┃       ┃ ┣ 🖼️ Material.002_baseColor.png
 ┃       ┃ ┗ 🖼️ Material.003_normal.png
 ┃       ┣ 📜 license.txt
 ┃       ┣ 📦 scene.bin
 ┃       ┗ 📜 scene.gltf
 ┗ 📜 index.html