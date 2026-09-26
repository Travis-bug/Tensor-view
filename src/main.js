import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

let interactions = [
    { id: "1", doer: "P1", action: "Slap", receiver: "P2", visible: true },
    { id: "2", doer: "P2", action: "Punch", receiver: "P3", visible: true },
    { id: "3", doer: "P3", action: "Kick", receiver: "P4", visible: true },
    { id: "4", doer: "P4", action: "Spit", receiver: "P2", visible: true },
    { id: "5", doer: "P2", action: "Shoot", receiver: "P5", visible: true },
    { id: "6", doer: "P5", action: "Elbow", receiver: "P1", visible: true }
];

// State for the layer (glass matrix) visibility toggles
let layerVisibility = {
    "Slap": true, "Punch": true, "Kick": true, "Spit": true, "Shoot": true, "Elbow": true
};

const colors = [0xff4444, 0xffaa00, 0x44ff44, 0x44aaff, 0xaa44ff, 0xff44aa, 0x00ffff, 0xff00ff, 0xffff00];
let activeMeshes = [];
let animatedWireframes = [];

const container = document.getElementById('canvas-container');
const listDiv = document.getElementById('data-list');
const legendDiv = document.getElementById('legend-content');
const addForm = document.getElementById('add-form');
const clearBtn = document.getElementById('clear-btn');
const inputDoer = document.getElementById('doer');
const inputAction = document.getElementById('action');
const inputReceiver = document.getElementById('receiver');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(12, 12, 18);
// On tall, narrow screens (portrait phones) pull the camera back so the whole tensor fits
const startAspect = container.clientWidth / container.clientHeight;
if (startAspect < 1) camera.position.multiplyScalar(Math.min(1 / startAspect, 2.4));

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(10, 20, 15);
scene.add(dirLight);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(container.clientWidth, container.clientHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function updateVisualization() {
    activeMeshes.forEach(mesh => {
        mesh.traverse(child => {
            if (child instanceof CSS2DObject && child.element.parentNode) {
                child.element.parentNode.removeChild(child.element);
            }
        });
        scene.remove(mesh);
    });
    activeMeshes = [];
    animatedWireframes = [];

    if (interactions.length === 0) {
        renderUI([]);
        return;
    }

    const actors = Array.from(new Set(interactions.flatMap(i => [i.doer, i.receiver])));
    const actions = Array.from(new Set(interactions.map(i => i.action)));

    // Ensure all actions exist in visibility state
    actions.forEach(a => {
        if (layerVisibility[a] === undefined) layerVisibility[a] = true;
    });

    const gridSize = Math.max(actors.length, 2);
    const offset = (gridSize - 1) / 2;
    const zDepthScale = 3;
    const totalDepth = (Math.max(actions.length - 1, 0)) * zDepthScale;

    // A. Draw Global Bounding Box & Axes (Now strictly separated and padded)
    const padding = 3; // Padding so the grids live *inside* the box
    const boxGeoSize = gridSize + padding;
    const boxGeoDepth = (totalDepth > 0 ? totalDepth : 1) + padding;

    const boundingBoxGeo = new THREE.BoxGeometry(boxGeoSize, boxGeoSize, boxGeoDepth);
    const boundingBoxEdges = new THREE.EdgesGeometry(boundingBoxGeo);
    const boundingBoxMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    const boundingBox = new THREE.LineSegments(boundingBoxEdges, boundingBoxMat);
    scene.add(boundingBox);
    activeMeshes.push(boundingBox);

    const xDiv = document.createElement('div');
    xDiv.className = 'axis-label axis-x';
    xDiv.textContent = 'X: Doer →';
    const xLabel = new CSS2DObject(xDiv);
    xLabel.position.set(0, -(boxGeoSize/2) - 0.5, (boxGeoDepth/2) + 0.5);
    scene.add(xLabel);
    activeMeshes.push(xLabel);

    const yDiv = document.createElement('div');
    yDiv.className = 'axis-label axis-y';
    yDiv.textContent = '↑ Y: Receiver';
    const yLabel = new CSS2DObject(yDiv);
    yLabel.position.set(-(boxGeoSize/2) - 0.5, 0, (boxGeoDepth/2) + 0.5);
    scene.add(yLabel);
    activeMeshes.push(yLabel);

    const zDiv = document.createElement('div');
    zDiv.className = 'axis-label axis-z';
    zDiv.textContent = 'Z: Action ↙';
    const zLabel = new CSS2DObject(zDiv);
    zLabel.position.set(-(boxGeoSize/2) - 0.5, (boxGeoSize/2) + 0.5, 0);
    scene.add(zLabel);
    activeMeshes.push(zLabel);

    const gridDotGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const gridDotMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    const activeNodeGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const wireframeGeo = new THREE.SphereGeometry(0.35, 12, 12);

    // B. Render Z-Slices
    actions.forEach((actionName, zIndex) => {
        // Skip rendering the layer if it is toggled off
        if (!layerVisibility[actionName]) return;

        const zPos = zIndex * zDepthScale - (totalDepth / 2);
        const color = colors[zIndex % colors.length];

        const layerGroup = new THREE.Group();
        layerGroup.position.set(0, 0, zPos);

        const glassMat = new THREE.MeshPhysicalMaterial({
            color: color, metalness: 0.2, roughness: 0.1, transmission: 0.6,
            transparent: true, opacity: 0.35, clearcoat: 1.0, side: THREE.DoubleSide
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(gridSize, gridSize), glassMat);
        layerGroup.add(plane);

        const gridHelper = new THREE.GridHelper(gridSize, gridSize, 0xffffff, 0x555555);
        gridHelper.rotation.x = Math.PI / 2;
        layerGroup.add(gridHelper);

        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                const dot = new THREE.Mesh(gridDotGeo, gridDotMat);
                dot.position.set(x - offset, y - offset, 0);
                layerGroup.add(dot);
            }
        }

        scene.add(layerGroup);
        activeMeshes.push(layerGroup);
    });

    // C. Render Active Interaction Nodes
    interactions.forEach(item => {
        // Only render the node if the node is visible AND its corresponding layer is visible
        if (!item.visible || !layerVisibility[item.action]) return;

        const xIndex = actors.indexOf(item.doer);
        const yIndex = actors.indexOf(item.receiver);
        const zIndex = actions.indexOf(item.action);

        const xPos = xIndex - offset;
        const yPos = -(yIndex - offset);
        const zPos = (zIndex * zDepthScale) - (totalDepth / 2);

        const baseColor = new THREE.Color(colors[zIndex % colors.length]);
        const darkerNodeColor = baseColor.clone().multiplyScalar(0.6);

        const interactionGroup = new THREE.Group();
        interactionGroup.position.set(xPos, yPos, zPos);

        const material = new THREE.MeshPhongMaterial({ color: darkerNodeColor, shininess: 100 });
        const sphere = new THREE.Mesh(activeNodeGeo, material);
        interactionGroup.add(sphere);

        const wireMat = new THREE.MeshBasicMaterial({ color: baseColor, wireframe: true, transparent: true, opacity: 0.9 });
        const wireMesh = new THREE.Mesh(wireframeGeo, wireMat);
        interactionGroup.add(wireMesh);
        animatedWireframes.push(wireMesh);

        const textDiv = document.createElement('div');
        textDiv.className = 'node-label';
        textDiv.style.color = `#${baseColor.getHexString()}`;
        textDiv.textContent = `${item.doer} → ${item.receiver}`;
        const label = new CSS2DObject(textDiv);
        interactionGroup.add(label);

        scene.add(interactionGroup);
        activeMeshes.push(interactionGroup);
    });

    renderUI(actions);
}

function renderUI(actions) {
    listDiv.innerHTML = '';
    interactions.forEach((item, index) => {
        const layerColorHex = colors[actions.indexOf(item.action) % colors.length].toString(16).padStart(6, '0');
        const layerColor = `#${layerColorHex}`;

        const card = document.createElement('div');
        card.className = 'interaction-card';
        card.style.borderColor = layerColor;

        const leftSide = document.createElement('div');
        leftSide.className = 'card-left';

        // Checkbox for Node Visibility
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'node-check';
        checkbox.checked = item.visible;
        checkbox.addEventListener('change', (e) => {
            interactions[index].visible = e.target.checked;
            updateVisualization();
        });

        const text = document.createElement('span');
        text.innerHTML = `<b style="color:white">${item.doer}</b> → <span style="color:${layerColor}">${item.action}</span> → <b style="color:white">${item.receiver}</b>`;

        leftSide.appendChild(checkbox);
        leftSide.appendChild(text);

        // Slide Switch for Grid Layer Visibility
        const switchLabel = document.createElement('label');
        switchLabel.className = 'switch';

        const switchInput = document.createElement('input');
        switchInput.type = 'checkbox';
        switchInput.checked = layerVisibility[item.action];
        switchInput.addEventListener('change', (e) => {
            // Update state for the entire layer
            layerVisibility[item.action] = e.target.checked;
            updateVisualization();
        });

        const switchSlider = document.createElement('span');
        switchSlider.className = 'switch-slider';
        // Dynamically style the iOS toggle to match the layer color
        if (layerVisibility[item.action]) {
            switchSlider.style.backgroundColor = layerColor;
            switchSlider.style.borderColor = layerColor;
        } else {
            switchSlider.style.backgroundColor = 'transparent';
            switchSlider.style.borderColor = '#555';
        }

        switchLabel.appendChild(switchInput);
        switchLabel.appendChild(switchSlider);

        card.appendChild(leftSide);
        card.appendChild(switchLabel);
        listDiv.appendChild(card);
    });

    legendDiv.innerHTML = actions.map((a, i) => `
        <div class="legend-item">
            <div class="color-box" style="background-color: #${colors[i % colors.length].toString(16).padStart(6, '0')}"></div>
            <span>Layer ${i + 1}: ${a}</span>
        </div>
    `).join('');
}


// Helper function to sanitize user input for the tensor
function normalizeData(input) {
    return input
        .toLowerCase() // Force everything to lowercase (e.g., "John" -> "john")
        .replace(/\s*\(.*?\)\s*/g, '') // Remove anything inside parentheses, like "(his bsf)"
        .trim(); // Remove accidental spaces at the start or end
}

addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const doer = normalizeData(inputDoer.value)
    const receiver = normalizeData(inputReceiver.value)
    const action = inputAction.value.trim().toLowerCase();

    if (doer && action && receiver) {
        interactions.push({ id: Date.now().toString(), doer, action, receiver, visible: true });
        addForm.reset();
        updateVisualization();
    }
});

clearBtn.addEventListener('click', () => {
    interactions = [];
    layerVisibility = {};
    updateVisualization();
});

// Resize whenever the canvas area changes size: window resizes and the sidebar opening or closing
new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
}).observe(container);

// Sidebar toggle: starts hidden on phones so visitors see the tensor first
const menuToggle = document.getElementById('menu-toggle');

function setSidebarOpen(open) {
    document.body.classList.toggle('sidebar-closed', !open);
    menuToggle.setAttribute('aria-expanded', String(open));
}

// Keep this query in sync with the phone media query in style.css
setSidebarOpen(!window.matchMedia('(max-width: 768px), (max-height: 500px)').matches);
menuToggle.addEventListener('click', () => {
    setSidebarOpen(document.body.classList.contains('sidebar-closed'));
});

// Remove the welcome screen once its fade-out finishes
const welcome = document.getElementById('welcome');
welcome.addEventListener('animationend', (e) => {
    if (e.target === welcome) welcome.remove();
});

// Fade the welcome screen out once the tensor is ready, but show it for at least ~2 seconds.
// performance.now() counts from when the page started loading.
const MIN_WELCOME_MS = 2200;
requestAnimationFrame(() => {
    setTimeout(() => welcome.classList.add('hide'), Math.max(0, MIN_WELCOME_MS - performance.now()));
});

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    animatedWireframes.forEach(wireframe => {
        wireframe.rotation.x += 0.01;
        wireframe.rotation.y += 0.015;
        const scale = 1 + Math.sin(elapsedTime * 4) * 0.15;
        wireframe.scale.set(scale, scale, scale);
    });

    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

updateVisualization();
animate();