import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- НАСТРОЙКИ ---
const SPEED = 2.5;
const ROTATION_SPEED = 3.5;

// КАМЕРА (ЭКШЕН СТИЛЬ: НИЗКО И БЛИЗКО)
// Y=1.4 (Уровень плеча), Z=-1.8 (Очень близко)
const CAMERA_OFFSET = new THREE.Vector3(0, 1, -2); 

const GRAVITY = 15.0; 
const SMOOTH_Y_FACTOR = 0.2; 

// Глобальные переменные
let camera, scene, renderer, clock;
let playerObject = null;
let mixers = [];
let playerActions = {}; 
let activeAction = null;
let isGameActive = false;
let allMeshes = []; 

// Физика
let verticalVelocity = 0; 
let isGrounded = false;
let targetY = 0; 

// Управление
let keys = { w: false, a: false, s: false, d: false };
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let joyManager = { active: false, x: 0, y: 0 };
let touchLook = { active: false, x: 0 };

// Звуки
let soundAmbience, soundStepsGrass, soundStepsStone, soundBark;
let playerListener;

init();
animate();

function init() {
    scene = new THREE.Scene();
    // 1. ЧИСТЫЙ ЦВЕТ НЕБА
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, 60);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 5);
    
    playerListener = new THREE.AudioListener();
    camera.add(playerListener);

    // 2. ПРОСТОЕ И СОЧНОЕ ОСВЕЩЕНИЕ
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    const d = 50;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
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

    const loader = new GLTFLoader();
    
    // ЭЛЕМЕНТЫ ЗАГРУЗКИ
    const loaderText = document.getElementById('loader-text');
    const loaderBar = document.getElementById('loader-bar-fill');
    const loadingScreen = document.getElementById('loading-screen');

    // 1. ЗАГРУЗКА
    loader.load('./world.glb', 
    function (gltf) {
        // --- УСПЕХ ---
        console.log("Загружено!");
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            document.getElementById('main-menu').style.display = 'flex';
        }, 500);

        scene.add(gltf.scene);

        const allClips = gltf.animations;

        // ИГРОК
        playerObject = gltf.scene.getObjectByName('Player') || gltf.scene.getObjectByName('Soldier');
        
        if (playerObject) {
            playerObject.position.set(0, 5, 0); 
            targetY = 5;

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

        // NPC И ЖИВОТНЫЕ
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
    // --- 2. ПРОГРЕСС (В МЕГАБАЙТАХ) ---
    function (xhr) {
        if (xhr.lengthComputable) {
            const percent = (xhr.loaded / xhr.total) * 100;
            const loadedMB = (xhr.loaded / 1048576).toFixed(2); // Перевод в МБ
            const totalMB = (xhr.total / 1048576).toFixed(2);
            
            // ОБНОВЛЯЕМ ТЕКСТ: "ЗАГРУЗКА... 45% (5.4 MB / 12.0 MB)"
            loaderText.innerText = `ЗАГРУЗКА... ${Math.round(percent)}% (${loadedMB} MB / ${totalMB} MB)`;
            loaderBar.style.width = percent + '%';
        }
    },
    // --- 3. ОШИБКА ---
    function (error) {
        console.error(error);
        loaderText.innerText = "ОШИБКА ЗАГРУЗКИ";
        loaderText.style.color = "red";
    });

    setupControls();
    window.addEventListener('resize', onWindowResize);
}

function checkIsWalkable(obj) {
    let current = obj;
    while(current) {
        const n = current.name.toLowerCase();
        if (n.includes('road') || n.includes('path') || n.includes('grass') || n.includes('ground') || n.includes('floor')) {
            return true;
        }
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
        
        if (hitDist <= 1.6) { 
            targetY = groundHeight;
            verticalVelocity = 0;
            isGrounded = true;
        } else {
            targetY = nextY; 
        }
    } else {
        targetY = nextY; 
    }

    if (isGrounded) {
        playerObject.position.y = THREE.MathUtils.lerp(playerObject.position.y, targetY, SMOOTH_Y_FACTOR);
    } else {
        playerObject.position.y = nextY; 
    }

    if (playerObject.position.y < -20) {
        playerObject.position.set(0, 10, 0); 
        verticalVelocity = 0;
    }

    // ДВИЖЕНИЕ
    let moveDist = SPEED * delta;
    let rotDist = ROTATION_SPEED * delta;
    let isMoving = false;

    if (keys.a) playerObject.rotation.y += rotDist;
    if (keys.d) playerObject.rotation.y -= rotDist;
    if (isMobile && joyManager.active) playerObject.rotation.y -= joyManager.x * rotDist;

    let moveDir = new THREE.Vector3();
    let attemptMove = false;

    if (keys.w || (isMobile && joyManager.active && joyManager.y < -0.2)) {
        playerObject.getWorldDirection(moveDir);
        attemptMove = true;
    }
    if (keys.s || (isMobile && joyManager.active && joyManager.y > 0.2)) {
        playerObject.getWorldDirection(moveDir);
        moveDir.negate();
        attemptMove = true;
    }

    if (attemptMove) {
        if (canMove(playerObject.position, moveDir.clone(), moveDist)) {
            playerObject.position.add(moveDir.multiplyScalar(moveDist));
            isMoving = true;
        }
    }

    // Анимация
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
        if (!soundStepsGrass.isPlaying && !soundStepsStone.isPlaying) {
             soundStepsGrass.play(); soundStepsStone.play();
        }
        
        const raycaster = new THREE.Raycaster(playerObject.position.clone().add(new THREE.Vector3(0,0.5,0)), new THREE.Vector3(0,-1,0));
        const intersects = raycaster.intersectObjects(allMeshes, true);
        
        let onStone = false;
        if (intersects.length > 0) {
            const hitObj = intersects[0].object;
            let current = hitObj;
            while(current) {
                const n = current.name.toLowerCase();
                if (n.includes('road') || n.includes('path') || n.includes('stone')) {
                    onStone = true;
                    break;
                }
                current = current.parent;
            }
        }

        if (onStone) {
            soundStepsStone.setVolume(1.0); soundStepsGrass.setVolume(0);
        } else {
            soundStepsStone.setVolume(0); soundStepsGrass.setVolume(1.0);
        }
    } else {
        if(soundStepsGrass.isPlaying) soundStepsGrass.stop();
        if(soundStepsStone.isPlaying) soundStepsStone.stop();
    }
}

function updateCamera() {
    if (!playerObject) return;
    const relativeOffset = CAMERA_OFFSET.clone();
    
    relativeOffset.applyAxisAngle(new THREE.Vector3(0,1,0), playerObject.rotation.y);
    
    const targetPos = playerObject.position.clone().add(relativeOffset);
    camera.position.lerp(targetPos, 0.1);
    
    // СМОТРИМ НА ПОЯСНИЦУ/ГРУДЬ (Y=1.3)
    const lookTarget = playerObject.position.clone().add(new THREE.Vector3(0, 1.3, 0)); 
    camera.lookAt(lookTarget);
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
    
    document.getElementById('exit-game-btn').addEventListener('click', stopGame);
    document.getElementById('btn-menu-exit').addEventListener('click', () => window.location.reload());

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
        let startX=0, startY=0;
        jZone.addEventListener('touchstart', e=>{ joyManager.active=true; startX=e.touches[0].clientX; startY=e.touches[0].clientY; });
        jZone.addEventListener('touchmove', e=>{
            if(!joyManager.active)return;
            let dx=e.touches[0].clientX-startX; let dy=e.touches[0].clientY-startY;
            const dist=Math.sqrt(dx*dx+dy*dy); const max=35;
            if(dist>max){ dx=(dx/dist)*max; dy=(dy/dist)*max; }
            jKnob.style.transform=`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            joyManager.x = dx/max; joyManager.y = dy/max;
        });
        jZone.addEventListener('touchend', ()=>{ joyManager.active=false; joyManager.x=0; joyManager.y=0; jKnob.style.transform=`translate(-50%, -50%)`; });
    }
    if (lZone) {
        lZone.style.display = 'block';
        let lookStart=0;
        lZone.addEventListener('touchstart', e=>{ touchLook.active=true; lookStart=e.touches[0].clientX; });
        lZone.addEventListener('touchmove', e=>{ 
            if(!touchLook.active || !playerObject) return;
            const delta = e.touches[0].clientX - lookStart;
            playerObject.rotation.y -= delta * 0.01;
            lookStart = e.touches[0].clientX;
        });
        lZone.addEventListener('touchend', ()=> touchLook.active=false);
    }
}
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}