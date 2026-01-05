/* ===================================
   Level 1: Logic & Animations
   =================================== */

let editor, pyodide;
const sounds = {
    whoosh: new Audio('../sounds/whoosh.wav'),
    notif: new Audio('../sounds/notification.wav')
};

window.onload = async () => {
    // 1. Setup Editor
    editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
        mode: "python",
        theme: "monokai",
        lineNumbers: true
    });
    editor.setValue('print("Hello World!")');

    // 2. Lock the print() syntax
    editor.markText({line: 0, ch: 0}, {line: 0, ch: 7}, {readOnly: true, className: 'cm-locked'});
    editor.markText({line: 0, ch: 19}, {line: 0, ch: 21}, {readOnly: true, className: 'cm-locked'});

    // 3. Load Python
    const output = document.getElementById('output');
    pyodide = await loadPyodide();
    output.textContent = "✅ Computer is Awake! Change the message and click Start.";
};

document.getElementById('runBtn').onclick = () => {
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stepBtn').disabled = false;
    document.getElementById('output').textContent = "Running...";
    showTeacher("Python is reading your code! Click 'Next Step' to see it move!");
};

document.getElementById('stepBtn').onclick = async () => {
    document.getElementById('stepBtn').disabled = true;
    const code = editor.getValue();
    
    // Extract text between quotes
    const message = code.match(/"([^"]+)"/)[1];
    
    // Start Animation
    await animatePrint(message);
    
    // Show on Output
    document.getElementById('output').textContent = `>> ${message}`;
    
    // Get AI explanation
    fetchExplanation(code, message);
};

async function animatePrint(text) {
    const editorCoords = editor.charCoords({line: 0, ch: 7}, "page");
    const outputRect = document.getElementById('output').getBoundingClientRect();

    const spark = document.createElement('div');
    spark.className = 'animation-spark';
    spark.textContent = text;
    spark.style.left = `${editorCoords.left}px`;
    spark.style.top = `${editorCoords.top}px`;
    document.body.appendChild(spark);

    sounds.whoosh.play();
    
    const particles = createTrail(editorCoords.left, editorCoords.top);

    return new Promise(resolve => {
        gsap.to(spark, {
            left: outputRect.left + 20,
            top: outputRect.top + 20,
            duration: 1.5,
            ease: "power2.inOut",
            onUpdate: () => {
                const rect = spark.getBoundingClientRect();
                updateTrail(particles, rect.left, rect.top);
            },
            onComplete: () => {
                spark.remove();
                particles.forEach(p => p.remove());
                resolve();
            }
        });
    });
}

function createTrail(x, y) {
    const svg = document.getElementById('trailSvg');
    const particles = [];
    for (let i = 0; i < 6; i++) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('r', 5 - i);
        c.setAttribute('fill', '#4ade80');
        c.setAttribute('opacity', 0.8 - (i * 0.1));
        svg.appendChild(c);
        particles.push(c);
    }
    return particles;
}

function updateTrail(particles, x, y) {
    particles.forEach((p, i) => {
        gsap.to(p, { attr: { cx: x, cy: y }, delay: i * 0.05, duration: 0.1 });
    });
}

async function fetchExplanation(code, output) {
    try {
        const res = await fetch('http://localhost:3000/generate-tutorial-explanation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code, output: output })
        });
        const data = await res.json();
        showTeacher(data.candidates[0].content.parts[0].text);
    } catch (e) {
        showTeacher("Wow! You used the print command to send a message to the screen!");
    }
}

function showTeacher(msg) {
    const bubble = document.getElementById('teacherBubble');
    document.getElementById('teacherText').textContent = msg;
    bubble.classList.add('show');
    sounds.notif.play();
}

document.getElementById('resetBtn').onclick = () => location.reload();