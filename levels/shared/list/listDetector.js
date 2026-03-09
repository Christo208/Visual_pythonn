/* ===================================
   List Detector - Pyodide List Detection
   Phase 2 - Milestone 1
   =================================== */

/**
 * Detects if a Pyodide value is a Python list
 * @param {*} pyodideValue - Value from pyodide.globals.toJs()
 * @returns {boolean} True if it's a list
 */
export function isListVariable(pyodideValue) {
    // Case 1: Already converted to JavaScript Array
    if (Array.isArray(pyodideValue)) {
        return true;
    }
    
    // Case 2: PyProxy object (Pyodide wrapper)
    if (pyodideValue && typeof pyodideValue === 'object') {
        // Check if it has Python list methods
        if (pyodideValue.toJs && typeof pyodideValue.toJs === 'function') {
            try {
                const converted = pyodideValue.toJs();
                return Array.isArray(converted);
            } catch (e) {
                return false;
            }
        }
        
        // Check for list-like properties
        if ('length' in pyodideValue && '__getitem__' in pyodideValue) {
            return true;
        }
    }
    
    // Case 3: String representation check (fallback)
    const strValue = String(pyodideValue);
    if (strValue.startsWith('[') && strValue.endsWith(']')) {
        return true;
    }
    
    return false;
}

/**
 * Converts Pyodide list to clean JavaScript array
 * @param {*} pyodideValue - Pyodide list value
 * @returns {Array} JavaScript array of string values
 */
export function parseListContents(pyodideValue) {
    let items = [];
    
    // Try to convert to JavaScript array
    if (Array.isArray(pyodideValue)) {
        items = pyodideValue;
    } else if (pyodideValue && pyodideValue.toJs && typeof pyodideValue.toJs === 'function') {
        try {
            items = pyodideValue.toJs();
        } catch (e) {
            console.error('Failed to convert PyProxy to JS:', e);
            return [];
        }
    } else {
        // Fallback: Parse string representation
        const strValue = String(pyodideValue);
        if (strValue.startsWith('[') && strValue.endsWith(']')) {
            try {
                // Remove outer brackets and split by comma
                const inner = strValue.slice(1, -1).trim();
                if (inner === '') return []; // Empty list
                
                // Basic parsing (will need refinement for complex types)
                items = inner.split(',').map(item => item.trim().replace(/['"]/g, ''));
            } catch (e) {
                console.error('Failed to parse list string:', e);
                return [];
            }
        }
    }
    
    // Convert all items to strings for display
    return items.map(item => {
        if (typeof item === 'string') {
            return item;
        } else if (typeof item === 'number' || typeof item === 'boolean') {
            return String(item);
        } else if (item === null || item === undefined) {
            return 'None';
        } else {
            return String(item);
        }
    });
}

/**
 * Gets the display type of a list item (for future tier support)
 * @param {*} item - List item
 * @returns {string} Type identifier: 'string', 'number', 'boolean', 'list', 'tuple', 'dict', 'unknown'
 */
export function getItemType(item) {
    if (typeof item === 'string') return 'string';
    if (typeof item === 'number') return 'number';
    if (typeof item === 'boolean') return 'boolean';
    if (Array.isArray(item)) return 'list';
    if (item === null || item === undefined) return 'none';
    
    // Check for Python-specific types
    const strRep = String(item);
    if (strRep.startsWith('(') && strRep.endsWith(')')) return 'tuple';
    if (strRep.startsWith('{') && strRep.endsWith('}')) return 'dict';
    
    return 'unknown';
}

/**
 * Determines complexity tier of a list (for future phasing)
 * @param {Array} items - Parsed list items
 * @returns {string} 'EMPTY', 'SIMPLE', 'NESTED', 'COMPLEX', 'UNSUPPORTED'
 */
export function detectListComplexity(items) {
    if (!items || items.length === 0) return 'EMPTY';
    
    const types = items.map(getItemType);
    const primitiveTypes = ['string', 'number', 'boolean', 'none'];
    
    // All primitives = SIMPLE
    if (types.every(t => primitiveTypes.includes(t))) {
        return 'SIMPLE';
    }
    
    // Contains nested lists but no other complex types = NESTED
    if (types.some(t => t === 'list') && !types.some(t => ['tuple', 'dict', 'unknown'].includes(t))) {
        return 'NESTED';
    }
    
    // Contains complex types = COMPLEX
    if (types.some(t => ['tuple', 'dict'].includes(t))) {
        return 'COMPLEX';
    }
    
    return 'UNSUPPORTED';
}
