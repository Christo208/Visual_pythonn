let pyodide;
let tutorialEditor;
let currentLevelId;

async function initPyodide() {
    try {
        pyodide = await loadPyodide();
        document.getElementById('tutorialOutput').innerHTML = "Ready!";
    } catch (err) {
        document.getElementById('tutorialOutput').innerHTML = "Engine Error.";
    }
}

// Step B: The Spark Animation
function playFlyAnimation(text) {
    return new Promise((resolve) => {
        const spark = document.createElement('div');
        spark.className = 'animation-spark';
        spark.innerText = text || "..."; 
        document.body.appendChild(spark);

        const startRect = document.querySelector('.CodeMirror').getBoundingClientRect();
        const endRect = document.getElementById('tutorialOutput').getBoundingClientRect();

        gsap.set(spark, { 
            left: startRect.left + 50, 
            top: startRect.top+9,
            opacity: 1
        });

        gsap.to(spark, {
            duration: 3.0,
            left: endRect.left + 40,
            top: endRect.top + 40,
            opacity: 1,
            scale: 1,
            ease: "power2.inOut",
            onComplete: () => {
                spark.remove();
                resolve(); 
            }
        });
    });
}

// Step C: The Sequential Run (B then C) - FIXED
async function startTutorialRun() {
    if (!pyodide) return;
    
    const code = tutorialEditor.getValue();
    const outputDiv = document.getElementById('tutorialOutput');
    const bubble = document.getElementById('teacherNote');
    
    bubble.classList.add('hidden');
    outputDiv.innerHTML = "Processing...";

    try {
        // 1. Run Python
        await pyodide.runPythonAsync(`import sys, io\nsys.stdout = io.StringIO()`);
        await pyodide.runPythonAsync(code);
        const stdout = pyodide.runPython("sys.stdout.getvalue()").trim();

        // 2. Animation (The Spark)
        await playFlyAnimation(stdout || "...");

        // 3. Show Result
        outputDiv.innerHTML = `<span class="chalk-text">${stdout}</span>`;
        
        // 4. Gemini Call - FIXED
        const response = await fetch('http://localhost:3000/generate-tutorial-explanation', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                code: code, 
                output: stdout
            })
        });
        
        // FIXED: Check if response is OK before parsing
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        
        // FIXED: Extract text from Gemini's response structure correctly
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            const fullText = data.candidates[0].content.parts[0].text;
            
            // Clean up and display the text
            document.getElementById('teacherText').innerText = fullText.replace(/[\[\]"]/g, "").trim();
            
            // FIXED: Only remove 'hidden' class AFTER successful response
            bubble.classList.remove('hidden');
        } else {
            console.error("Unexpected response structure:", data);
            document.getElementById('teacherText').innerText = "Explanation received but format was unexpected.";
            bubble.classList.remove('hidden');
        }

    } catch (err) {
        console.error("Tutorial Error:", err);
        outputDiv.innerHTML = `<span style="color:red;">Communication Error: ${err.message}</span>`;
    }
}

// Editor setup and locking logic
function applyLocks(instance) {
    const line = instance.getLine(0);
    const start = line.indexOf('"') + 1;
    const end = line.lastIndexOf('"');
    instance.getAllMarks().forEach(mark => mark.clear());
    instance.markText({line: 0, ch: 0}, {line: 0, ch: start}, {readOnly: true, atomic: true, css: "opacity: 0.6;"});
    instance.markText({line: 0, ch: end}, {line: 0, ch: line.length}, {readOnly: true, atomic: true, css: "opacity: 0.6;"});
}

function loadLevel() {
    const params = new URLSearchParams(window.location.search);
    currentLevelId = params.get('level') || '1';
    const data = LEVELS[currentLevelId];
    if (!data) return;

    document.getElementById('levelTitle').innerText = `📚 Program ${currentLevelId}: ${data.title}`;
    const textarea = document.getElementById('tutorialCodeEditor');
    if (!tutorialEditor) {
        tutorialEditor = CodeMirror.fromTextArea(textarea, {
            mode: "python", theme: "monokai", lineNumbers: false,
            extraKeys: { "Enter": () => {} }
        });
    }
    tutorialEditor.setValue(data.template);
    applyLocks(tutorialEditor);
}

window.onload = () => { initPyodide(); loadLevel(); };
document.getElementById('tutorialRunBtn').onclick = startTutorialRun;
document.getElementById('tutorialResetBtn').onclick = () => {
    const data = LEVELS[currentLevelId];
    tutorialEditor.setValue(data.template);
    applyLocks(tutorialEditor);
    document.getElementById('tutorialOutput').innerHTML = "Ready!";
    document.getElementById('teacherNote').classList.add('hidden');
};

// ... [Previous code remains the same until the end] ...

// Video Player Logic
const videoModal = document.getElementById('videoModal');
const videoBtn = document.getElementById('tutorialVideoBtn');
const closeBtn = document.getElementById('closeVideoBtn');
const tutorialVideo = document.getElementById('tutorialVideo');

// Open Video
videoBtn.onclick = () => {
    videoModal.style.display = 'flex';
    tutorialVideo.play();
};

// Close Video and Pause Playback
const stopVideo = () => {
    videoModal.style.display = 'none';
    tutorialVideo.pause();
    tutorialVideo.currentTime = 0; // Reset video to start
};

closeBtn.onclick = stopVideo;

// Close if user clicks outside the video box
window.addEventListener('click', (event) => {
    if (event.target == videoModal) {
        stopVideo();
    }
});

// Keep your existing window.onload logic
const originalOnload = window.onload;
window.onload = () => {
    if (originalOnload) originalOnload();
    // Additional initialization if needed
};



let chatHistory = []; // The memory for the conversation

function initChatbot() {
    const chatTrigger = document.getElementById('chat-trigger');
    const chatWindow = document.getElementById('chat-window');
    const closeChat = document.getElementById('close-chat');
    const sendBtn = document.getElementById('send-chat');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');

    if (chatTrigger) chatTrigger.onclick = () => chatWindow.classList.toggle('hidden');
    if (closeChat) closeChat.onclick = () => chatWindow.classList.add('hidden');

    async function handleSend() {
        const query = chatInput.value.trim();
        if (!query) return;

        appendMessage('user-msg', query);
        chatInput.value = '';

        try {
            const response = await fetch('http://localhost:3000/chat-with-assistant', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    query: query,
                    code: tutorialEditor.getValue(), 
                    output: document.getElementById('tutorialOutput').innerText,
                    history: chatHistory 
                })
            });

            if (!response.ok) throw new Error(`Server Error: ${response.status}`);

            const data = await response.json();
            const botResponse = data.reply; // Matches the server's { reply: ... }

            // Update history for memory
            chatHistory.push({ role: "user", parts: [{ text: query }] });
            chatHistory.push({ role: "model", parts: [{ text: botResponse }] });

            appendMessage('bot-msg', botResponse);

        } catch (err) {
            console.error("Chat Error:", err);
            appendMessage('bot-msg', "Connection lost. Is the server running?");
        }
    }

    function appendMessage(type, text) {
        const msg = document.createElement('div');
        msg.className = type;
        msg.innerText = text;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    if (sendBtn) sendBtn.onclick = handleSend;
    if (chatInput) {
        chatInput.onkeydown = (e) => { if (e.key === 'Enter') handleSend(); };
    }
}

// Clean initialization
window.onload = () => { 
    initPyodide(); 
    loadLevel(); 
    initChatbot(); 
};
