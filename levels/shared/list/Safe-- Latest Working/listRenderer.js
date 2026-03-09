/* ===================================
   List Renderer - Static Table Generation
   Phase 2 - Milestone 1
   =================================== */

/**
 * Renders a Python list as a static table (no animations)
 * @param {string} varName - Variable name (e.g., "colors")
 * @param {Array} items - Array of string values
 * @param {HTMLElement} container - Container element (memoryBank)
 * @param {Array} aliases - Other variable names pointing to same list (for shallow copy)
 * @returns {HTMLElement} The created table element
 */
export function renderListTable(varName, items, container, aliases = []) {
    const listContainer = document.createElement('div');
    listContainer.className = 'list-container';
    listContainer.dataset.varName = varName;
    listContainer.dataset.isExpanded = 'true';
    listContainer.dataset.indexMode = 'positive'; // 'positive' or 'negative'
    
    // ⭐ MILESTONE 2: Start hidden for animation
    listContainer.style.opacity = '0';
    listContainer.style.transform = 'scale(0.9)';
    
    // Create header
    const header = createListHeader(varName, items.length, aliases);
    listContainer.appendChild(header);
    
    // Create table
    const table = createListTableStructure(items);
    listContainer.appendChild(table);
    
    // ⭐ MILESTONE 2: Set table wrapper hidden initially
    const tableWrapper = listContainer.querySelector('.list-table-wrapper');
    tableWrapper.style.opacity = '0';
    
    // Append to container
    container.appendChild(listContainer);
    
    // Setup toggle button handlers
    setupHeaderButtons(listContainer, varName, items.length, aliases);
    
    return listContainer;
}

/**
 * Creates the header section with name, count, and controls
 */
function createListHeader(varName, itemCount, aliases) {
    const header = document.createElement('div');
    header.className = 'list-header';
    
    // ⭐ M2.5: Start header hidden (will animate in)
    header.style.opacity = '0';
    
    // Left side: Variable name(s)
    const nameSection = document.createElement('div');
    nameSection.className = 'list-name-section';
    
    const mainName = document.createElement('span');
    mainName.className = 'list-main-name';
    mainName.textContent = ''; // ⭐ M2.5: Start empty for typewriter
    nameSection.appendChild(mainName);
    
    // Show aliases if any
    if (aliases.length > 0) {
        const aliasIndicator = document.createElement('span');
        aliasIndicator.className = 'list-alias-indicator';
        aliasIndicator.textContent = ` (${aliases.join(', ')}↗)`;
        aliasIndicator.title = 'These variables point to the same list';
        nameSection.appendChild(aliasIndicator);
    }
    
    // Middle: Item count
    const countSection = document.createElement('div');
    countSection.className = 'list-count-section';
    countSection.textContent = `N is ${itemCount}`;
    countSection.style.opacity = '0'; // ⭐ M2.5: Start hidden
    
    // Right side: Control buttons
    const controls = document.createElement('div');
    controls.className = 'list-controls';
    controls.style.opacity = '0'; // ⭐ M2.5: Start hidden
    
    // Toggle +/- index button
    const indexToggle = document.createElement('button');
    indexToggle.className = 'list-index-toggle';
    indexToggle.textContent = '+';
    indexToggle.title = 'Toggle positive/negative indices';
    controls.appendChild(indexToggle);
    
    // Minimize/expand button
    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'list-minimize-btn';
    minimizeBtn.textContent = '⊟';
    minimizeBtn.title = 'Minimize to compact view';
    controls.appendChild(minimizeBtn);
    
    header.appendChild(nameSection);
    header.appendChild(countSection);
    header.appendChild(controls);
    
    return header;
}

/**
 * Creates the table structure with Index/Content columns
 */
function createListTableStructure(items) {
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'list-table-wrapper';
    
    const table = document.createElement('table');
    table.className = 'list-table';
    
    // Column headers
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const indexHeader = document.createElement('th');
    indexHeader.className = 'list-header-index';
    indexHeader.textContent = ''; // ⭐ M2.5: Start empty for typewriter
    
    const contentHeader = document.createElement('th');
    contentHeader.className = 'list-header-content';
    contentHeader.textContent = ''; // ⭐ M2.5: Start empty for typewriter
    
    headerRow.appendChild(indexHeader);
    headerRow.appendChild(contentHeader);
    thead.appendChild(headerRow);
    thead.style.opacity = '0'; // ⭐ M2.5: Start hidden
    table.appendChild(thead);
    
    // Data rows
    const tbody = document.createElement('tbody');
    tbody.className = 'list-table-body';
    
    items.forEach((item, index) => {
        const row = createListRow(index, item, 'positive');
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    
    return tableWrapper;
}

/**
 * Creates a single table row
 */
function createListRow(index, value, indexMode) {
    const row = document.createElement('tr');
    row.className = 'list-row';
    row.dataset.originalIndex = index;
    
    // ⭐ MILESTONE 2: Start hidden for animation
    row.style.opacity = '0';
    row.style.transform = 'translateY(20px) scale(0.95)';
    
    // Index cell
    const indexCell = document.createElement('td');
    indexCell.className = 'list-index-cell';
    indexCell.textContent = indexMode === 'positive' ? index : '?'; // Will be set by toggle
    
    // Content cell
    const contentCell = document.createElement('td');
    contentCell.className = 'list-content-cell';
    
    // Format value based on type
    const valueSpan = document.createElement('span');
    valueSpan.className = 'list-value';
    
    // Add quotes for strings (detect if original was quoted)
    const displayValue = formatValueForDisplay(value);
    valueSpan.textContent = displayValue;
    
    contentCell.appendChild(valueSpan);
    
    row.appendChild(indexCell);
    row.appendChild(contentCell);
    
    return row;
}

/**
 * Formats a value for display (adds quotes to strings, etc.)
 */
function formatValueForDisplay(value) {
    const strValue = String(value);
    
    // If it looks like a number or boolean, show without quotes
    if (!isNaN(strValue) || strValue === 'true' || strValue === 'false' || strValue === 'True' || strValue === 'False') {
        return strValue;
    }
    
    // If it's None/null
    if (strValue === 'None' || strValue === 'null' || strValue === 'undefined') {
        return 'None';
    }
    
    // Otherwise, add quotes for strings
    return `"${strValue}"`;
}

/**
 * Sets up event handlers for header buttons
 */
function setupHeaderButtons(listContainer, varName, itemCount, aliases) {
    const indexToggle = listContainer.querySelector('.list-index-toggle');
    const minimizeBtn = listContainer.querySelector('.list-minimize-btn');
    const tableWrapper = listContainer.querySelector('.list-table-wrapper');
    const header = listContainer.querySelector('.list-header');
    
    // Index toggle handler (M5: With Animation)
    indexToggle.addEventListener('click', async () => {
        const currentMode = listContainer.dataset.indexMode;
        const newMode = currentMode === 'positive' ? 'negative' : 'positive';
        
        // Update button text
        indexToggle.textContent = newMode === 'positive' ? '+' : '−';
        listContainer.dataset.indexMode = newMode;
        
        // ⭐ M5: Animate the toggle
        // Import the animation function
        const { animateIndexToggle } = await import('./listAnimations.js');
        
        // Disable button during animation
        indexToggle.disabled = true;
        
        await new Promise(resolve => {
            animateIndexToggle(listContainer, newMode, itemCount, () => {
                indexToggle.disabled = false;
                resolve();
            });
        });
    });
    
    // Minimize/expand handler (Phase 2 Milestone 7 - placeholder for now)
    minimizeBtn.addEventListener('click', () => {
        const isExpanded = listContainer.dataset.isExpanded === 'true';
        
        if (isExpanded) {
            // Minimize: Hide table, show compact view
            tableWrapper.style.display = 'none';
            minimizeBtn.textContent = '⊞';
            minimizeBtn.title = 'Expand to full view';
            
            // Transform header to compact mode
            header.classList.add('compact');
            const nameSection = header.querySelector('.list-name-section');
            nameSection.innerHTML = `${varName} <span class="compact-info">[List: ${itemCount}]</span>`;
            
            listContainer.dataset.isExpanded = 'false';
        } else {
            // Expand: Show table, restore header
            tableWrapper.style.display = 'block';
            minimizeBtn.textContent = '⊟';
            minimizeBtn.title = 'Minimize to compact view';
            
            header.classList.remove('compact');
            
            // Restore header content
            const nameSection = header.querySelector('.list-name-section');
            nameSection.innerHTML = '';
            const mainName = document.createElement('span');
            mainName.className = 'list-main-name';
            mainName.textContent = varName;
            nameSection.appendChild(mainName);
            
            if (aliases.length > 0) {
                const aliasIndicator = document.createElement('span');
                aliasIndicator.className = 'list-alias-indicator';
                aliasIndicator.textContent = ` (${aliases.join(', ')}↗)`;
                nameSection.appendChild(aliasIndicator);
            }
            
            listContainer.dataset.isExpanded = 'true';
        }
    });
}

/**
 * Updates index display based on mode (positive/negative)
 */
function updateIndices(listContainer, mode, itemCount) {
    const rows = listContainer.querySelectorAll('.list-row');
    
    rows.forEach((row) => {
        const originalIndex = parseInt(row.dataset.originalIndex);
        const indexCell = row.querySelector('.list-index-cell');
        
        if (mode === 'positive') {
            indexCell.textContent = originalIndex;
        } else {
            // Negative indices: last element is -1, second-to-last is -2, etc.
            const negativeIndex = -(itemCount - originalIndex);
            indexCell.textContent = negativeIndex;
        }
    });
}

/**
 * Updates an existing list table with new items (for future modifications)
 * @param {HTMLElement} listContainer - The list container element
 * @param {Array} newItems - New array of items
 */
export function updateListTable(listContainer, newItems) {
    // TODO: Milestone 9 - Implement for append/pop/sort operations
    console.log('Update list table:', newItems);
}