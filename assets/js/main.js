import * as THREE from "three";

import Stats from "three/addons/libs/stats.module.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js"; // Añadido FBXLoader

import { Octree } from "three/addons/math/Octree.js";
import { Capsule } from "three/addons/math/Capsule.js";

import { OctreeHelper } from "three/addons/helpers/OctreeHelper.js";

const timer = new THREE.Timer();
timer.connect(document);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee);
scene.fog = new THREE.Fog(0x88ccee, 0, 50);

const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
);
camera.rotation.order = "YXZ";

const fillLight1 = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
fillLight1.position.set(2, 1, 1);
scene.add(fillLight1);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
directionalLight.position.set(-5, 25, -1);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.01;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.left = -30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = -30;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.radius = 4;
directionalLight.shadow.bias = -0.00006;
scene.add(directionalLight);

const container = document.getElementById("container");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const stats = new Stats();
stats.domElement.style.position = "absolute";
stats.domElement.style.top = "0px";
container.appendChild(stats.domElement);

const GRAVITY = 30;
const NUM_SPHERES = 100;
const SPHERE_RADIUS = 0.2;
const STEPS_PER_FRAME = 5;

const sphereGeometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 5);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

const spheres = [];
let sphereIdx = 0;

for (let i = 0; i < NUM_SPHERES; i++) {
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    scene.add(sphere);

    spheres.push({
        mesh: sphere,
        collider: new THREE.Sphere(new THREE.Vector3(0, -100, 0), SPHERE_RADIUS),
        velocity: new THREE.Vector3(),
    });
}

const worldOctree = new Octree();

const playerCollider = new Capsule(
    new THREE.Vector3(0, 0.35, 0),
    new THREE.Vector3(0, 1, 0),
    0.35,
);

let cameraYaw = 0;
let cameraPitch = 0;
const MAX_CAMERA_DISTANCE = 4.0;

const playerMesh = new THREE.Group();
scene.add(playerMesh);

// --- VARIABLES DE MÁQUINA DE ESTADOS ---
let mixer;
const actions = {};
let activeAction;
let activeThrowAction = null; 
let isThrowing = false; // Bandera para saber si está en medio de un lanzamiento

const characterLoader = new FBXLoader().setPath("./assets/models/fbx/");

const loadBase   = () => characterLoader.loadAsync("Vanguard By T. Choonyung.fbx");
const loadIdle   = () => characterLoader.loadAsync("Breathing Idle.fbx");
const loadWalk   = () => characterLoader.loadAsync("Walking.fbx");
const loadRun    = () => characterLoader.loadAsync("Running.fbx");
// NUEVAS ANIMACIONES
const loadJump   = () => characterLoader.loadAsync("Jump.fbx");
const loadFall   = () => characterLoader.loadAsync("Falling.fbx");
const loadThrowL = () => characterLoader.loadAsync("Throw Left.fbx");
const loadThrowR = () => characterLoader.loadAsync("Throw Right.fbx");

Promise.all([loadBase(), loadIdle(), loadWalk(), loadRun(), loadJump(), loadFall(), loadThrowL(), loadThrowR()])
    .then(([base, idle, walk, run, jump, fall, throwL, throwR]) => {
        
        const characterModel = base;
        characterModel.scale.set(0.008, 0.008, 0.008); 
        characterModel.rotateY(Math.PI); 
        playerMesh.add(characterModel);

        characterModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        mixer = new THREE.AnimationMixer(characterModel);

        // --- REGISTRO DE ANIMACIONES ---
        actions['idle'] = mixer.clipAction(idle.animations[0]);
        actions['walk'] = mixer.clipAction(walk.animations[0]);
        actions['run']  = mixer.clipAction(run.animations[0]);
        
        actions['jump'] = mixer.clipAction(jump.animations[0]);
        actions['fall'] = mixer.clipAction(fall.animations[0]);
        
        actions['throw_left'] = mixer.clipAction(throwL.animations[0]);
        actions['throw_right'] = mixer.clipAction(throwR.animations[0]);

        // CONFIGURACIÓN DE ANIMACIONES "ONCE" (Una sola vez)
        ['throw_left', 'throw_right', 'jump'].forEach(name => {
            actions[name].setLoop(THREE.LoopOnce, 1);
            actions[name].clampWhenFinished = true; 
        });

        // --- SOLUCIÓN 1: ACELERAR EL LANZAMIENTO ---
        // El valor 1.0 es velocidad normal. 2.5 significa 250% más rápido.
        // Ajusta este número hasta que sientas que el movimiento del brazo encaja con la pelota.
        // Cámbialo de 2.5 a 5.0 (o incluso 8.0 si quieres que sea casi instantáneo)
        actions['throw_left'].setEffectiveTimeScale(5.0);
        actions['throw_right'].setEffectiveTimeScale(5.0);
        
        // (Opcional) Si sientes que salta en cámara lenta, también puedes acelerar el salto:
        actions['jump'].setEffectiveTimeScale(1.5); 
        // -------------------------------------------

        // LISTENER: Cuando termine la animación de lanzar, apagamos la bandera
        mixer.addEventListener('finished', (e) => {
            if (e.action === actions['throw_left'] || e.action === actions['throw_right']) {
                isThrowing = false;
            }
        });

        activeAction = actions['idle'];
        activeAction.play();
    })
    .catch(error => {
        console.error("Error cargando los archivos FBX:", error);
    });

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
let mouseTime = 0;

const keyStates = {};
const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

document.addEventListener("keydown", (event) => {
    keyStates[event.code] = true;
});

document.addEventListener("keyup", (event) => {
    keyStates[event.code] = false;
});

document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
});

container.addEventListener("mousedown", (event) => {
    document.body.requestPointerLock();
    if (event.button === 0 || event.button === 2) {
        mouseTime = performance.now();
    }
});

document.addEventListener("mouseup", (event) => {
    if (document.pointerLockElement !== null) {
        if (event.button === 0 || event.button === 2) {
            throwBall(event.button);
            // ------------------------------------
        }
    }
});

document.body.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement === document.body) {
        cameraYaw -= event.movementX * 0.002;
        cameraPitch -= event.movementY * 0.002;
        cameraPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraPitch));
    }
});

window.addEventListener("resize", onWindowResize);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- ACTUALIZACIÓN DE LANZAMIENTO ---
function throwBall(buttonPressed) {
    const sphere = spheres[sphereIdx];
    camera.getWorldDirection(playerDirection);

    sphere.collider.center
        .copy(playerCollider.end)
        .addScaledVector(playerDirection, playerCollider.radius * 1.5);

    const impulse = 15 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001));

    sphere.velocity.copy(playerDirection).multiplyScalar(impulse);
    sphere.velocity.addScaledVector(playerVelocity, 2);

    sphereIdx = (sphereIdx + 1) % spheres.length;

    // LÓGICA DE ANIMACIÓN DE BRAZO
    if (mixer) {
        if (buttonPressed === 0) { // Clic Izquierdo -> Brazo Izquierdo
            activeThrowAction = actions['throw_left'];
        } else if (buttonPressed === 2) { // Clic Derecho -> Brazo Derecho
            activeThrowAction = actions['throw_right'];
        }
        
        isThrowing = true;
        activeThrowAction.reset(); // Reinicia la animación por si disparas muy rápido
    }
}

function playerCollisions() {
    const result = worldOctree.capsuleIntersect(playerCollider);
    playerOnFloor = false;

    if (result) {
        playerOnFloor = result.normal.y >= 0.15;
        if (!playerOnFloor) {
            playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
        }
        if (result.depth >= 1e-10) {
            playerCollider.translate(result.normal.multiplyScalar(result.depth));
        }
    }
}

function updatePlayer(deltaTime) {
    let damping = Math.exp(-4 * deltaTime) - 1;

    if (!playerOnFloor) {
        playerVelocity.y -= GRAVITY * deltaTime;
        damping *= 0.1;
    }

    playerVelocity.addScaledVector(playerVelocity, damping);
    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();

    playerMesh.position.set(
        playerCollider.start.x,
        playerCollider.start.y - playerCollider.radius, 
        playerCollider.start.z
    );
    playerMesh.rotation.y = cameraYaw;

    // --- NUEVA MÁQUINA DE ESTADOS JERÁRQUICA ---
    if (mixer) {
        mixer.update(deltaTime);

        let nextAction = actions['idle']; // Estado por defecto

        // Jerarquía 1: Lanzar tiene la mayor prioridad visual
        if (isThrowing) {
            nextAction = activeThrowAction;
        } 
        // Jerarquía 2: Físicas de aire (Saltar y Caer)
        else if (!playerOnFloor) {
            if (playerVelocity.y > 0) {
                nextAction = actions['jump'];
            } else {
                nextAction = actions['fall'];
            }
        } 
        // Jerarquía 3: Movimiento en el suelo (Caminar / Reposo)
        else {
            const isMoving = keyStates["KeyW"] || keyStates["KeyS"] || keyStates["KeyA"] || keyStates["KeyD"];
            if (isMoving) {
                nextAction = actions['walk']; 
            } else {
                nextAction = actions['idle'];
            }
        }

        // Ejecutar el Crossfade (Transición suave)
        if (activeAction && activeAction !== nextAction && nextAction !== undefined) {
            const currentAction = activeAction;
            activeAction = nextAction;

            // Transición rápida de 0.2s. 
            // Si venimos de un salto o lanzamiento, usamos reset() para que comience desde el inicio.
            currentAction.fadeOut(0.2);
            activeAction.reset().fadeIn(0.2).play();
        }
    }

    const targetPoint = playerMesh.position.clone();
    targetPoint.y += 1.2; 

    const idealOffset = new THREE.Vector3(0, 0, MAX_CAMERA_DISTANCE);
    const euler = new THREE.Euler(cameraPitch, cameraYaw, 0, 'YXZ');
    idealOffset.applyEuler(euler);
    const idealPosition = targetPoint.clone().add(idealOffset);

    const rayDirection = new THREE.Vector3().subVectors(idealPosition, targetPoint).normalize();
    const ray = new THREE.Ray(targetPoint, rayDirection);
    const collisionInfo = worldOctree.rayIntersect(ray);

    if (collisionInfo && collisionInfo.distance < MAX_CAMERA_DISTANCE) {
        camera.position.copy(targetPoint).addScaledVector(rayDirection, collisionInfo.distance - 0.2);
    } else {
        camera.position.copy(idealPosition);
    }

    camera.lookAt(targetPoint);
}

function playerSphereCollision(sphere) {
    const center = vector1
        .addVectors(playerCollider.start, playerCollider.end)
        .multiplyScalar(0.5);

    const sphere_center = sphere.collider.center;
    const r = playerCollider.radius + sphere.collider.radius;
    const r2 = r * r;

    for (const point of [playerCollider.start, playerCollider.end, center]) {
        const d2 = point.distanceToSquared(sphere_center);

        if (d2 < r2) {
            const normal = vector1.subVectors(point, sphere_center).normalize();
            const v1 = vector2.copy(normal).multiplyScalar(normal.dot(playerVelocity));
            const v2 = vector3.copy(normal).multiplyScalar(normal.dot(sphere.velocity));

            playerVelocity.add(v2).sub(v1);
            sphere.velocity.add(v1).sub(v2);

            const d = (r - Math.sqrt(d2)) / 2;
            sphere_center.addScaledVector(normal, -d);
        }
    }
}

function spheresCollisions() {
    for (let i = 0, length = spheres.length; i < length; i++) {
        const s1 = spheres[i];
        for (let j = i + 1; j < length; j++) {
            const s2 = spheres[j];
            const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
            const r = s1.collider.radius + s2.collider.radius;
            const r2 = r * r;

            if (d2 < r2) {
                const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
                const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
                const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

                s1.velocity.add(v2).sub(v1);
                s2.velocity.add(v1).sub(v2);

                const d = (r - Math.sqrt(d2)) / 2;
                s1.collider.center.addScaledVector(normal, d);
                s2.collider.center.addScaledVector(normal, -d);
            }
        }
    }
}

function updateSpheres(deltaTime) {
    spheres.forEach((sphere) => {
        sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);
        const result = worldOctree.sphereIntersect(sphere.collider);

        if (result) {
            sphere.velocity.addScaledVector(result.normal, -result.normal.dot(sphere.velocity) * 1.5);
            sphere.collider.center.add(result.normal.multiplyScalar(result.depth));
        } else {
            sphere.velocity.y -= GRAVITY * deltaTime;
        }

        const damping = Math.exp(-1.5 * deltaTime) - 1;
        sphere.velocity.addScaledVector(sphere.velocity, damping);
        playerSphereCollision(sphere);
    });

    spheresCollisions();

    for (const sphere of spheres) {
        sphere.mesh.position.copy(sphere.collider.center);
    }
}

function getForwardVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    return playerDirection;
}

function getSideVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);
    return playerDirection;
}

function controls(deltaTime) {
    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    if (keyStates["KeyW"]) playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
    if (keyStates["KeyS"]) playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
    if (keyStates["KeyA"]) playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
    if (keyStates["KeyD"]) playerVelocity.add(getSideVector().multiplyScalar(speedDelta));

    if (playerOnFloor && keyStates["Space"]) playerVelocity.y = 15;
}

const envLoader = new GLTFLoader().setPath("./assets/models/gltf/brutalism/");

envLoader.load("scene.gltf", (gltf) => {
    scene.add(gltf.scene);
    worldOctree.fromGraphNode(gltf.scene);

    gltf.scene.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
                child.material.transparent = false;
                child.material.depthWrite = true;
            }
            if (child.material.map) child.material.map.anisotropy = 4;
        }
    });

    playerCollider.start.set(0, 0.35, 0);
    playerCollider.end.set(0, 1, 0);
    playerVelocity.set(0, 0, 0); 
    
    cameraYaw = 0;
    cameraPitch = 0;

    const helper = new OctreeHelper(worldOctree);
    helper.visible = false;
    scene.add(helper);

    const gui = new GUI({ width: 200 });
    gui.add({ debug: false }, "debug").onChange(function (value) {
        helper.visible = value;
    });
});

function teleportPlayerIfOob() {
    if (camera.position.y <= -25) {
        playerCollider.start.set(0, 0.35, 0);
        playerCollider.end.set(0, 1, 0);
        playerCollider.radius = 0.35;
        playerVelocity.set(0, 0, 0);
    }
}

function animate() {
    timer.update();
    const deltaTime = Math.min(0.05, timer.getDelta()) / STEPS_PER_FRAME;

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(deltaTime);
        updatePlayer(deltaTime);
        updateSpheres(deltaTime);
        teleportPlayerIfOob();
    }

    renderer.render(scene, camera);
    stats.update();
}