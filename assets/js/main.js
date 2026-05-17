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
const NUM_PROJECTILES = 100;
const STEPS_PER_FRAME = 5;

const projectiles = [];
let projectileIdx = 0;

for (let i = 0; i < NUM_PROJECTILES; i++) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    projectiles.push({
        mesh: mesh,
        collider: new THREE.Sphere(new THREE.Vector3(0, -100, 0), 0.1),
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

let mixer;
const actions = {};
let activeAction;
let activeThrowAction = null; 
let isThrowing = false;

// --- DECLARACIÓN DE CARGADORES ---
const envLoader = new GLTFLoader().setPath("./assets/models/gltf/brutalism/");
const characterLoader = new FBXLoader().setPath("./assets/models/fbx/");

// --- DEFINICIÓN DE PROMESAS UNIFICADAS ---
const loadEnv    = () => envLoader.loadAsync("scene.gltf");
const loadBase   = () => characterLoader.loadAsync("Vanguard By T. Choonyung.fbx");
const loadIdle   = () => characterLoader.loadAsync("Breathing Idle.fbx");
const loadWalk   = () => characterLoader.loadAsync("Walking.fbx");
const loadRun    = () => characterLoader.loadAsync("Running.fbx");
const loadJump   = () => characterLoader.loadAsync("Jump.fbx");
const loadFall   = () => characterLoader.loadAsync("Falling.fbx");
const loadThrowL = () => characterLoader.loadAsync("Throw Left.fbx");
const loadThrowR = () => characterLoader.loadAsync("Throw Right.fbx");

// Forzamos al motor a esperar la descarga de TODO (incluyendo el mapa) antes de inicializar
Promise.all([
    loadBase(), loadIdle(), loadWalk(), loadRun(), 
    loadJump(), loadFall(), loadThrowL(), loadThrowR(),
    loadEnv() // Escenario añadido al pool asíncrono
])
    .then(([base, idle, walk, run, jump, fall, throwL, throwR, envGltf]) => {
        
        // 1. CONFIGURACIÓN DEL ESCENARIO HORNEADO
        scene.add(envGltf.scene);
        worldOctree.fromGraphNode(envGltf.scene);

        envGltf.scene.traverse((child) => {
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

        // 2. CONFIGURACIÓN DEL JUGADOR
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

        // 3. REGISTRO DE ANIMACIONES
        mixer = new THREE.AnimationMixer(characterModel);

        actions['idle'] = mixer.clipAction(idle.animations[0]);
        actions['walk'] = mixer.clipAction(walk.animations[0]);
        actions['run']  = mixer.clipAction(run.animations[0]);
        actions['jump'] = mixer.clipAction(jump.animations[0]);
        actions['fall'] = mixer.clipAction(fall.animations[0]);
        actions['throw_left'] = mixer.clipAction(throwL.animations[0]);
        actions['throw_right'] = mixer.clipAction(throwR.animations[0]);

        ['throw_left', 'throw_right', 'jump'].forEach(name => {
            actions[name].setLoop(THREE.LoopOnce, 1);
            actions[name].clampWhenFinished = true; 
        });

        // Configuración de velocidades rápidas
        actions['throw_left'].setEffectiveTimeScale(5.0);
        actions['throw_right'].setEffectiveTimeScale(5.0);
        actions['jump'].setEffectiveTimeScale(1.5); 

        mixer.addEventListener('finished', (e) => {
            if (e.action === actions['throw_left'] || e.action === actions['throw_right']) {
                isThrowing = false;
            }
        });

        activeAction = actions['idle'];
        activeAction.play();

        // 4. RESET DE POSICIÓN Y CÁMARA (Garantiza sincronía con el suelo del Octree)
        playerCollider.start.set(0, 0.35, 0);
        playerCollider.end.set(0, 1, 0);
        playerVelocity.set(0, 0, 0); 
        
        cameraYaw = 0;
        cameraPitch = 0;

        // 5. HERRAMIENTAS DE DEBBUGING VISUAL
        const helper = new OctreeHelper(worldOctree);
        helper.visible = false;
        scene.add(helper);

        const gui = new GUI({ width: 200 });
        gui.add({ debug: false }, "debug").onChange(function (value) {
            helper.visible = value;
        });
    })
    .catch(error => {
        console.error("Error crítico durante la carga de recursos:", error);
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
            throwProjectile(event.button); 
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

function throwProjectile(buttonPressed) {
    const projectile = projectiles[projectileIdx];

    if (projectile.mesh.geometry) projectile.mesh.geometry.dispose();
    if (projectile.mesh.material) projectile.mesh.material.dispose();

    const n = Math.floor(Math.random() * 5) + 3; 
    const randomColor = new THREE.Color(Math.random(), Math.random(), Math.random());
    const radius = Math.random() * 0.25 + 0.15; 
    const height = Math.random() * 0.6 + 0.3;   

    if (buttonPressed === 0) { 
        projectile.mesh.geometry = new THREE.CylinderGeometry(radius, radius, height, n);
        activeThrowAction = actions['throw_left'];
    } else if (buttonPressed === 2) { 
        projectile.mesh.geometry = new THREE.ConeGeometry(radius, height, n);
        activeThrowAction = actions['throw_right'];
    }

    projectile.mesh.material = new THREE.MeshLambertMaterial({ color: randomColor });
    projectile.collider.radius = Math.max(radius, height / 2);

    camera.getWorldDirection(playerDirection);

    projectile.collider.center
        .copy(playerCollider.end)
        .addScaledVector(playerDirection, playerCollider.radius * 1.5);

    const impulse = 15 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001));

    projectile.velocity.copy(playerDirection).multiplyScalar(impulse);
    projectile.velocity.addScaledVector(playerVelocity, 2);

    projectileIdx = (projectileIdx + 1) % projectiles.length;

    if (mixer) {
        isThrowing = true;
        activeThrowAction.stop(); 
        activeThrowAction.play();
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

    if (mixer) {
        mixer.update(deltaTime);

        let nextAction = actions['idle']; 

        if (isThrowing) {
            nextAction = activeThrowAction;
        } 
        else if (!playerOnFloor) {
            if (playerVelocity.y > 0) {
                nextAction = actions['jump'];
            } else {
                nextAction = actions['fall'];
            }
        } 
        else {
            const isMoving = keyStates["KeyW"] || keyStates["KeyS"] || keyStates["KeyA"] || keyStates["KeyD"];
            if (isMoving) {
                nextAction = actions['walk']; 
            } else {
                nextAction = actions['idle'];
            }
        }

        if (activeAction && activeAction !== nextAction && nextAction !== undefined) {
            const currentAction = activeAction;
            activeAction = nextAction;

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

function playerProjectileCollision(projectile) {
    const center = vector1
        .addVectors(playerCollider.start, playerCollider.end)
        .multiplyScalar(0.5);

    const projectile_center = projectile.collider.center;
    const r = playerCollider.radius + projectile.collider.radius;
    const r2 = r * r;

    for (const point of [playerCollider.start, playerCollider.end, center]) {
        const d2 = point.distanceToSquared(projectile_center);

        if (d2 < r2) {
            const normal = vector1.subVectors(point, projectile_center).normalize();
            const v1 = vector2.copy(normal).multiplyScalar(normal.dot(playerVelocity));
            const v2 = vector3.copy(normal).multiplyScalar(normal.dot(projectile.velocity));

            playerVelocity.add(v2).sub(v1);
            projectile.velocity.add(v1).sub(v2);

            const d = (r - Math.sqrt(d2)) / 2;
            projectile_center.addScaledVector(normal, -d);
        }
    }
}

function projectilesCollisions() {
    for (let i = 0, length = projectiles.length; i < length; i++) {
        const s1 = projectiles[i];
        for (let j = i + 1; j < length; j++) {
            const s2 = projectiles[j];
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

function updateProjectiles(deltaTime) {
    projectiles.forEach((projectile) => {
        projectile.collider.center.addScaledVector(projectile.velocity, deltaTime);
        const result = worldOctree.sphereIntersect(projectile.collider);

        if (result) {
            projectile.velocity.addScaledVector(result.normal, -result.normal.dot(projectile.velocity) * 1.5);
            projectile.collider.center.add(result.normal.multiplyScalar(result.depth));
        } else {
            projectile.velocity.y -= GRAVITY * deltaTime;
        }

        const damping = Math.exp(-1.5 * deltaTime) - 1;
        projectile.velocity.addScaledVector(projectile.velocity, damping);
        playerProjectileCollision(projectile);
    });

    projectilesCollisions();

    for (const projectile of projectiles) {
        projectile.mesh.position.copy(projectile.collider.center);
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
        updateProjectiles(deltaTime); 
        teleportPlayerIfOob();
    }

    renderer.render(scene, camera);
    stats.update();
}