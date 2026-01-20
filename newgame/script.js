import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- НАСТРОЙКИ ---
const SPEED = 2.5;
const ROTATION_SPEED = 3.5;
const GRAVITY = 15.0; 
const SMOOTH_Y_FACTOR = 0.2; 

// КАМЕРА
const CAMERA_DIST = 2.5; 
const CAMERA_HEIGHT = 1.4;

// Глобальные переменные
let camera, scene, renderer, clock;
let playerObject = null;
let mixers = [];
let playerActions = {}; 
let activeAction = null;
let isGameActive = false;
let allMeshes = []; 

// КАМЕРА (СВОБОДНАЯ)
let cameraAngle = Math.PI; 
let cameraVerticalAngle = 0.2; 
let mouseLook = { active: false, x: 0, y: 0 }; 

// Физика
let verticalVelocity = 0; 
let isGrounded = false;
let targetY = 0; 

// Управление
let keys = { w: false, a: false, s: false, d: false };

// --- ИСПРАВЛЕНИЕ 1: ПРАВИЛЬНОЕ ОПРЕДЕЛЕНИЕ ПЛАНШЕТОВ (IPAD) ---
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                 (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 0);

// Мультитач
let joyManager = { active: false, x: 0, y: 0, touchId: null };
let touchLook = { active: false, lastX: 0, lastY: 0, touchId: null };

let soundAmbience, soundStepsGrass, soundStepsStone, soundBark;
let playerListener;

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, 60);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    playerListener = new THREE.AudioListener();
    camera.add(playerListener);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    const d = 50;
    dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    setupAudio();
    setupMenuSystem();

    // --- ТЕКСТУРА ТРАВЫ ---
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('./grass.jpg', function(texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(100, 100); 
        
        const groundGeo = new THREE.PlaneGeometry(2000, 2000);
        const groundMat = new THREE.MeshStandardMaterial({ 
            map: texture,
            roughness: 1,
            color: 0x888888 
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        
        // --- ИСПРАВЛЕНИЕ 2: ЧУТЬ ПРИПОДНЯТЬ ТРАВУ ---
        // Чтобы она была выше зеленого пола из world.glb
        ground.position.y = 0.02; 
        
        ground.receiveShadow = true;
        scene.add(ground);
        
        allMeshes.push(ground); 
    });

    const loader = new GLTFLoader();
    const loaderText = document.getElementById('loader-text');
    const loaderBar = document.getElementById('loader-bar-fill');
    const loadingScreen = document.getElementById('loading-screen');

    loader.load('./world.glb', 
    function (gltf) {
        console.log("Мир загружен!");
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            document.getElementById('main-menu').style.display = 'flex';
        }, 500);

        scene.add(gltf.scene);
        const allClips = gltf.animations;

        // Игрок
        playerObject = gltf.scene.getObjectByName('Player') || gltf.scene.getObjectByName('Soldier');
        
        if (playerObject) {
            playerObject.position.set(0, 5, 0); 
            targetY = 5;
            cameraAngle = playerObject.rotation.y + Math.PI;

            const pMixer = new THREE.AnimationMixer(playerObject);
            mixers.push(pMixer);

            const runClip = allClips.find(c => c.name.includes('Run') && c.name.includes('Character'));
            const idleClip = allClips.find(c => c.name.includes('Idle') && c.name.includes('Character') && !c.name.includes('Gun'));

            if (runClip && idleClip) {
                playerActions['Run'] = pMixer.clipAction(runClip);
                playerActions['Idle'] = pMixer.clipAction(idleClip);
                playerActions['Idle'].play();
                activeAction = playerActions['Idle'];
            }
        }

        // МИР
        gltf.scene.traverse(function (object) {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
                const n = object.name.toLowerCase();
                
                // --- ИСПРАВЛЕНИЕ 3: СКРЫВАЕМ ЗЕЛЕНЫЙ ПОЛ ИЗ МОДЕЛИ ---
                // Если объект называется "Plane" (как в редакторе), скрываем его,
                // чтобы видна была наша текстура травы
                if (n === 'plane') {
                    object.visible = false;
                    return; // Не добавляем его в allMeshes
                }

                let isPlayerPart = false;
                if (playerObject) {
                    let parent = object;
                    while (parent) {
                        if (parent === playerObject) { isPlayerPart = true; break; }
                        parent = parent.parent;
                    }
                }
                
                if (!isPlayerPart && !n.includes('sky') && !n.includes('cloud')) {
                    allMeshes.push(object);
                }
            }
        });

        // NPC и Животные
        const npcNames = ['Farmer', 'Worker', 'Suit', 'Adventurer', 'Animated_Woman'];
        const humanIdle = allClips.find(c => c.name.includes('Idle') && c.name.includes('Character') && !c.name.includes('Neutral'));
        npcNames.forEach(name => {
            const npc = gltf.scene.getObjectByName(name);
            if(npc && humanIdle) {
                const m = new THREE.AnimationMixer(npc);
                mixers.push(m);
                m.clipAction(humanIdle).play();
            }
        });

        const dog = gltf.scene.getObjectByName('Dog');
        if(dog) {
            const m = new THREE.AnimationMixer(dog);
            mixers.push(m);
            const a = allClips.find(c => c.name.includes('Idle') && c.name.includes('Animal'));
            if(a) m.clipAction(a).play();
            if (soundBark.buffer) {
                const s = new THREE.PositionalAudio(playerListener);
                s.setBuffer(soundBark.buffer);
                s.setRefDistance(3); s.setVolume(0.2); 
                dog.add(s); dog.userData.sound = s;
            }
        }
        
        const horse = gltf.scene.getObjectByName('Horse');
        if(horse) {
            const m = new THREE.AnimationMixer(horse);
            mixers.push(m);
            const a = allClips.find(c => c.name.includes('Eating'));
            if(a) m.clipAction(a).play();
        }

    }, 
    function (xhr) {
        if (xhr.lengthComputable) {
            const percent = (xhr.loaded / xhr.total) * 100;
            const loadedMB = (xhr.loaded / 1048576).toFixed(2);
            const totalMB = (xhr.total / 1048576).toFixed(2);
            loaderText.innerText = `ЗАГРУЗКА... ${Math.round(percent)}% (${loadedMB} MB / ${totalMB} MB)`;
            loaderBar.style.width = percent + '%';
        }
    },
    function (error) { console.error(error); });

    setupControls();
    window.addEventListener('resize', onWindowResize);
}

function checkIsWalkable(obj) {
    let current = obj;
    while(current) {
        const n = current.name.toLowerCase();
        if (n.includes('road') || n.includes('path') || n.includes('grass') || n.includes('ground') || n.includes('floor')) return true;
        current = current.parent;
    }
    return false;
}

function canMove(position, direction, distance) {
    const raycaster = new THREE.Raycaster();
    const rayOrigin = position.clone().add(new THREE.Vector3(0, 0.5, 0)); 
    raycaster.set(rayOrigin, direction.normalize());
    const intersects = raycaster.intersectObjects(allMeshes, true);
    if (intersects.length > 0) {
        if (intersects[0].distance < distance + 0.7) { 
            const hitObj = intersects[0].object;
            if (checkIsWalkable(hitObj)) return true;
            return false;
        }
    }
    return true;
}

function updatePhysics(delta) {
    if (!playerObject) return;
    verticalVelocity -= GRAVITY * delta; 
    let nextY = playerObject.position.y + verticalVelocity * delta;
    const raycaster = new THREE.Raycaster();
    const rayOrigin = playerObject.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObjects(allMeshes, true);
    isGrounded = false;
    if (intersects.length > 0) {
        const hitDist = intersects[0].distance; 
        const groundHeight = intersects[0].point.y;
        if (hitDist <= 1.6) { targetY = groundHeight; verticalVelocity = 0; isGrounded = true; } 
        else { targetY = nextY; }
    } else { targetY = nextY; }
    if (isGrounded) { playerObject.position.y = THREE.MathUtils.lerp(playerObject.position.y, targetY, SMOOTH_Y_FACTOR); } 
    else { playerObject.position.y = nextY; }
    if (playerObject.position.y < -20) { playerObject.position.set(0, 10, 0); verticalVelocity = 0; }
    
    let inputX = 0;
    let inputY = 0;
    if (keys.w) inputY -= 1; 
    if (keys.s) inputY += 1; 
    if (keys.a) inputX -= 1; 
    if (keys.d) inputX += 1; 
    
    // ВАЖНО: Джойстик работает, если isMobile = true
    if (isMobile && joyManager.active) {
        inputX = joyManager.x;
        inputY = joyManager.y;
    }

    let isMoving = false;
    if (Math.abs(inputX) > 0.1 || Math.abs(inputY) > 0.1) {
        isMoving = true;
        const joystickAngle = Math.atan2(inputX, -inputY); 
        const targetRotation = cameraAngle + joystickAngle;
        const q = new THREE.Quaternion();
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation);
        playerObject.quaternion.slerp(q, 0.15); 
        const moveDist = SPEED * delta;
        const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation);
        if (canMove(playerObject.position, forward, moveDist)) {
            playerObject.position.add(forward.multiplyScalar(moveDist));
        }
    }
    if (playerActions['Run'] && playerActions['Idle']) {
        const targetAction = isMoving ? playerActions['Run'] : playerActions['Idle'];
        if (activeAction !== targetAction) { 
            activeAction.fadeOut(0.2); 
            targetAction.reset().fadeIn(0.2).play(); 
            activeAction = targetAction; 
        }
    }
    handleFootsteps(isMoving);
}

function handleFootsteps(isMoving) {
    if (isMoving && isGrounded) {
        if (!soundStepsGrass.isPlaying && !soundStepsStone.isPlaying) { soundStepsGrass.play(); soundStepsStone.play(); }
        const raycaster = new THREE.Raycaster(playerObject.position.clone().add(new THREE.Vector3(0,0.5,0)), new THREE.Vector3(0,-1,0));
        const intersects = raycaster.intersectObjects(allMeshes, true);
        let onStone = false;
        if (intersects.length > 0) {
            const hitObj = intersects[0].object;
            let current = hitObj;
            while(current) {
                const n = current.name.toLowerCase();
                if (n.includes('road') || n.includes('path') || n.includes('stone')) { onStone = true; break; }
                current = current.parent;
            }
        }
        if (onStone) { soundStepsStone.setVolume(1.0); soundStepsGrass.setVolume(0); } else { soundStepsStone.setVolume(0); soundStepsGrass.setVolume(1.0); }
    } else { if(soundStepsGrass.isPlaying) soundStepsGrass.stop(); if(soundStepsStone.isPlaying) soundStepsStone.stop(); }
}

function updateCamera() {
    if (!playerObject) return;
    const center = playerObject.position.clone().add(new THREE.Vector3(0, CAMERA_HEIGHT, 0));
    const offsetX = CAMERA_DIST * Math.sin(cameraAngle) * Math.cos(cameraVerticalAngle);
    const offsetZ = CAMERA_DIST * Math.cos(cameraAngle) * Math.cos(cameraVerticalAngle);
    const offsetY = CAMERA_DIST * Math.sin(cameraVerticalAngle);
    camera.position.x = center.x + offsetX;
    camera.position.z = center.z + offsetZ;
    camera.position.y = center.y + offsetY;
    camera.lookAt(center);
}

function setupAudio() {
    const loader = new THREE.AudioLoader();
    soundAmbience = new THREE.Audio(playerListener);
    loader.load('./ambience.wav', b => { soundAmbience.setBuffer(b); soundAmbience.setLoop(true); soundAmbience.setVolume(1.0); });
    soundStepsGrass = new THREE.Audio(playerListener);
    loader.load('./grasswalk.wav', b => { soundStepsGrass.setBuffer(b); soundStepsGrass.setLoop(true); soundStepsGrass.setVolume(0); });
    soundStepsStone = new THREE.Audio(playerListener);
    loader.load('./stoneswalk.wav', b => { soundStepsStone.setBuffer(b); soundStepsStone.setLoop(true); soundStepsStone.setVolume(0); });
    soundBark = { buffer: null };
    loader.load('./dogbark.wav', b => { soundBark.buffer = b; });
}

function setupControls() {
    document.addEventListener('keydown', (e) => {
        if(e.code==='KeyW'||e.code==='ArrowUp') keys.w=true;
        if(e.code==='KeyS'||e.code==='ArrowDown') keys.s=true;
        if(e.code==='KeyA'||e.code==='ArrowLeft') keys.a=true;
        if(e.code==='KeyD'||e.code==='ArrowRight') keys.d=true;
    });
    document.addEventListener('keyup', (e) => {
        if(e.code==='KeyW'||e.code==='ArrowUp') keys.w=false;
        if(e.code==='KeyS'||e.code==='ArrowDown') keys.s=false;
        if(e.code==='KeyA'||e.code==='ArrowLeft') keys.a=false;
        if(e.code==='KeyD'||e.code==='ArrowRight') keys.d=false;
    });

    document.addEventListener('mousedown', () => { if(isGameActive) mouseLook.active = true; });
    document.addEventListener('mouseup', () => { mouseLook.active = false; });
    document.addEventListener('mousemove', (e) => {
        if (mouseLook.active) {
            cameraAngle -= e.movementX * 0.005;
            cameraVerticalAngle += e.movementY * 0.005;
            cameraVerticalAngle = Math.max(-1.0, Math.min(1.0, cameraVerticalAngle));
        }
    });
}

function stopGame() {
    isGameActive = false;
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    document.getElementById('joystick-zone').style.display = 'none';
    document.getElementById('look-zone').style.display = 'none';
    if(soundAmbience.isPlaying) soundAmbience.stop();
    if(soundStepsGrass.isPlaying) soundStepsGrass.stop();
    if(soundStepsStone.isPlaying) soundStepsStone.stop();
}

function setupMenuSystem() {
    document.getElementById('btn-start').addEventListener('click', () => {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        if (THREE.AudioContext.getContext().state === 'suspended') THREE.AudioContext.getContext().resume();
        soundAmbience.play();
        isGameActive = true;
        if (isMobile) setupMobileControls();
    });
    document.getElementById('exit-game-btn').addEventListener('click', () => { window.location.href = '../index.html'; });
    document.getElementById('btn-menu-exit').addEventListener('click', () => { window.location.href = '../index.html'; });
    document.getElementById('btn-credits').addEventListener('click', () => {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('credits-screen').style.display = 'flex';
    });
    document.getElementById('btn-credits-back').addEventListener('click', () => {
        document.getElementById('credits-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'flex';
    });
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    mixers.forEach(m => m.update(delta));
    if (isGameActive && playerObject) {
        updatePhysics(delta);
        updateCamera();
        if (soundBark.buffer && Math.random() < 0.01) {
             scene.traverse(obj => {
                if (obj.userData.sound && !obj.userData.sound.isPlaying && obj.name.toLowerCase().includes('dog')) {
                    if (playerObject.position.distanceTo(obj.position) < 3.0) obj.userData.sound.play();
                }
            });
        }
    } else {
        camera.position.x = Math.sin(Date.now() * 0.0005) * 15;
        camera.position.z = Math.cos(Date.now() * 0.0005) * 15;
        camera.lookAt(0, 0, 0);
    }
    renderer.render(scene, camera);
}

function setupMobileControls() {
    const jZone = document.getElementById('joystick-zone');
    const jKnob = document.getElementById('joystick-knob');
    const lZone = document.getElementById('look-zone');
    if (jZone) {
        jZone.style.display = 'block';
        jZone.addEventListener('touchstart', e => {
            e.preventDefault(); 
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (joyManager.touchId === null) {
                    joyManager.touchId = e.changedTouches[i].identifier;
                    joyManager.active = true;
                    joyManager.startX = e.changedTouches[i].clientX;
                    joyManager.startY = e.changedTouches[i].clientY;
                }
            }
        }, { passive: false });
        jZone.addEventListener('touchmove', e => {
            e.preventDefault(); 
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === joyManager.touchId) {
                    let dx = e.changedTouches[i].clientX - joyManager.startX;
                    let dy = e.changedTouches[i].clientY - joyManager.startY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const max = 35;
                    if (dist > max) { dx = (dx/dist)*max; dy = (dy/dist)*max; }
                    jKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                    joyManager.x = dx / max;
                    joyManager.y = dy / max;
                }
            }
        }, { passive: false });
        const endJoy = (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === joyManager.touchId) {
                    joyManager.active = false;
                    joyManager.touchId = null;
                    joyManager.x = 0;
                    joyManager.y = 0;
                    jKnob.style.transform = `translate(-50%, -50%)`;
                }
            }
        };
        jZone.addEventListener('touchend', endJoy);
        jZone.addEventListener('touchcancel', endJoy);
    }
    if (lZone) {
        lZone.style.display = 'block';
        lZone.addEventListener('touchstart', e => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (touchLook.touchId === null) {
                    touchLook.touchId = e.changedTouches[i].identifier;
                    touchLook.active = true;
                    touchLook.lastX = e.changedTouches[i].clientX;
                    touchLook.lastY = e.changedTouches[i].clientY;
                }
            }
        }, { passive: false });
        lZone.addEventListener('touchmove', e => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === touchLook.touchId) {
                    const deltaX = e.changedTouches[i].clientX - touchLook.lastX;
                    const deltaY = e.changedTouches[i].clientY - touchLook.lastY;
                    cameraAngle -= deltaX * 0.008; 
                    cameraVerticalAngle += deltaY * 0.008;
                    cameraVerticalAngle = Math.max(-1.0, Math.min(1.0, cameraVerticalAngle));
                    touchLook.lastX = e.changedTouches[i].clientX;
                    touchLook.lastY = e.changedTouches[i].clientY;
                }
            }
        }, { passive: false });
        const endLook = (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === touchLook.touchId) {
                    touchLook.active = false;
                    touchLook.touchId = null;
                }
            }
        };
        lZone.addEventListener('touchend', endLook);
        lZone.addEventListener('touchcancel', endLook);
    }
}
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}