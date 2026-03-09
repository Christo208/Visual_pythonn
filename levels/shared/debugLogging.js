/* ===================================
   Debug Logging for Pop Animation
   Provides detailed logging for troubleshooting
   =================================== */

/**
 * Logs pop animation debug information
 * @param {string} phase - Animation phase name
 * @param {Object} data - Debug data
 */
export function logPopDebug(phase, data) {
    const timestamp = new Date().toLocaleTimeString();
    console.group(`🎬 [${timestamp}] Pop Animation - ${phase}`);

    Object.entries(data).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
            console.log(`${key}:`, JSON.stringify(value, null, 2));
        } else {
            console.log(`${key}:`, value);
        }
    });

    console.groupEnd();
}

/**
 * Logs coordinate information
 * @param {string} label - Coordinate label
 * @param {Object} coords - {x, y} coordinates
 */
export function logCoordinates(label, coords) {
    console.log(`📍 ${label}: (${Math.round(coords.x)}, ${Math.round(coords.y)})`);
}

/**
 * Logs timeline event
 * @param {number} time - Time in seconds
 * @param {string} event - Event description
 */
export function logTimelineEvent(time, event) {
    console.log(`⏱️  t=${time.toFixed(1)}s: ${event}`);
}

/**
 * Logs error with context
 * @param {string} context - Where the error occurred
 * @param {Error} error - The error object
 */
export function logPopError(context, error) {
    console.error(`❌ Pop Animation Error [${context}]:`, error.message);
    if (error.stack) {
        console.error('Stack:', error.stack);
    }
}

/**
 * Creates a visual debug marker on screen
 * @param {Object} coords - {x, y} position
 * @param {string} label - Label text
 * @param {string} color - Marker color
 */
export function createDebugMarker(coords, label, color = 'red') {
    const marker = document.createElement('div');
    marker.className = 'debug-marker';
    marker.textContent = label;

    Object.assign(marker.style, {
        position: 'fixed',
        left: `${coords.x}px`,
        top: `${coords.y}px`,
        width: '10px',
        height: '10px',
        backgroundColor: color,
        borderRadius: '50%',
        zIndex: '99999',
        fontSize: '10px',
        color: 'white',
        padding: '2px 4px',
        whiteSpace: 'nowrap'
    });

    document.body.appendChild(marker);

    // Auto-remove after 3 seconds
    setTimeout(() => marker.remove(), 3000);
}

/**
 * Enable/disable debug mode
 */
let debugMode = false;

export function setDebugMode(enabled) {
    debugMode = enabled;
    console.log(`🔧 Pop Debug Mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

export function isDebugMode() {
    return debugMode;
}

/**
 * Teacher bubble feedback for debugging
 * @param {string} message - Debug message for teacher
 */
export function debugTeacherMessage(message) {
    const teacherBubble = document.getElementById('teacherBubble');
    const teacherText = document.getElementById('teacherText');

    if (teacherBubble && teacherText && debugMode) {
        teacherText.textContent = `🐛 DEBUG: ${message}`;
        teacherBubble.style.display = 'flex';

        setTimeout(() => {
            teacherBubble.style.display = 'none';
        }, 5000);
    }
}
