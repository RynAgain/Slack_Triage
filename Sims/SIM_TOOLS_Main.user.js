// ==UserScript==
// @name         SIM Tools - Ticket Status Color Coding
// @namespace    https://github.com/RynAgain
// @version      1.1
// @description  Adds light color coding to SIM tickets based on their status with customizable colors
// @author       RynAgain
// @match        https://t.corp.amazon.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/RynAgain/Slack_Triage/main/Sims/SIM_TOOLS_Main.user.js
// @downloadURL  https://raw.githubusercontent.com/RynAgain/Slack_Triage/main/Sims/SIM_TOOLS_Main.user.js
// @supportURL   https://github.com/RynAgain/Slack_Triage/issues
// ==/UserScript==

(function() {
    'use strict';

    // Default status color mapping - light pastel colors for better readability
    const DEFAULT_STATUS_COLORS = {
        'Assigned': '#e3f2fd',      // Light blue
        'Open': '#fff3e0',          // Light orange
        'Pending': '#fff9c4',       // Light yellow
        'Resolved': '#e8f5e9',      // Light green
        'Closed': '#f5f5f5',        // Light gray
        'In Progress': '#e1f5fe',   // Light cyan
        'Work In Progress': '#e1f5fe', // Light cyan
        'Blocked': '#ffebee',       // Light red
        'On Hold': '#fce4ec',       // Light pink
        'Cancelled': '#efebe9',     // Light brown
        'Deferred': '#ede7f6',      // Light purple
        'Waiting': '#fff8e1',       // Light amber
        'Researching': '#e8eaf6'    // Light indigo
    };

    // Load user's custom colors from storage, or use defaults
    let STATUS_COLORS = {};

    /**
     * Load status colors from storage
     */
    function loadStatusColors() {
        const saved = GM_getValue('statusColors', null);
        if (saved) {
            try {
                STATUS_COLORS = JSON.parse(saved);
            } catch (e) {
                console.error('SIM Tools: Error loading saved colors, using defaults', e);
                STATUS_COLORS = { ...DEFAULT_STATUS_COLORS };
            }
        } else {
            STATUS_COLORS = { ...DEFAULT_STATUS_COLORS };
        }
    }

    /**
     * Save status colors to storage
     */
    function saveStatusColors() {
        GM_setValue('statusColors', JSON.stringify(STATUS_COLORS));
    }

    /**
     * Generate CSS for all status colors
     */
    function generateStatusCSS() {
        let css = '';
        Object.entries(STATUS_COLORS).forEach(([status, color]) => {
            css += `
                tr.awsui_row_wih1l_1q04c_359[data-sim-status="${status}"] {
                    background-color: ${color} !important;
                }
            `;
        });
        return css;
    }

    /**
     * Update the dynamic status styles
     */
    function updateStatusStyles() {
        // Remove existing dynamic styles
        const existingStyle = document.getElementById('sim-tools-dynamic-styles');
        if (existingStyle) {
            existingStyle.remove();
        }

        // Create new style element with updated colors
        const styleEl = document.createElement('style');
        styleEl.id = 'sim-tools-dynamic-styles';
        styleEl.textContent = generateStatusCSS();
        document.head.appendChild(styleEl);
    }

    // Base CSS (non-dynamic styles)
    const baseStyles = `
        /* Ensure cells inherit the row background */
        tr.awsui_row_wih1l_1q04c_359[data-sim-status] td {
            background-color: inherit !important;
        }

        /* Hover effect - slightly darker shade */
        tr.awsui_row_wih1l_1q04c_359[data-sim-status]:hover {
            filter: brightness(0.95);
        }

        /* Legend styles */
        #sim-status-legend {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: all 0.2s ease;
            overflow: hidden;
            min-width: 200px;
        }
        #sim-status-legend .legend-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: #f8f9fa;
            border-bottom: 1px solid #eee;
            cursor: pointer;
            user-select: none;
        }
        #sim-status-legend .legend-header:hover {
            background: #f0f1f2;
        }
        #sim-status-legend .legend-title {
            font-weight: 600;
            font-size: 13px;
            color: #333;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        #sim-status-legend .legend-toggle-icon {
            font-size: 10px;
            transition: transform 0.2s ease;
            color: #666;
        }
        #sim-status-legend.collapsed .legend-toggle-icon {
            transform: rotate(-90deg);
        }
        #sim-status-legend .legend-content {
            max-height: 350px;
            overflow-y: auto;
        }
        #sim-status-legend.collapsed .legend-content {
            display: none;
        }
        #sim-status-legend .legend-items {
            padding: 8px 12px;
        }
        #sim-status-legend .legend-item {
            display: flex;
            align-items: center;
            padding: 5px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        #sim-status-legend .legend-item:last-child {
            border-bottom: none;
        }
        #sim-status-legend .legend-color {
            width: 24px;
            height: 18px;
            border-radius: 3px;
            margin-right: 10px;
            border: 1px solid rgba(0,0,0,0.1);
            flex-shrink: 0;
            cursor: pointer;
            position: relative;
        }
        #sim-status-legend .legend-color:hover {
            border-color: #666;
        }
        #sim-status-legend .legend-color input[type="color"] {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            cursor: pointer;
        }
        #sim-status-legend .legend-label {
            color: #444;
            flex-grow: 1;
        }
        #sim-status-legend .legend-delete {
            color: #999;
            cursor: pointer;
            padding: 2px 6px;
            font-size: 14px;
            border-radius: 3px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        #sim-status-legend .legend-item:hover .legend-delete {
            opacity: 1;
        }
        #sim-status-legend .legend-delete:hover {
            background: #ffebee;
            color: #c62828;
        }
        #sim-status-legend .legend-actions {
            padding: 8px 12px;
            border-top: 1px solid #eee;
            background: #fafafa;
        }
        #sim-status-legend .legend-add-form {
            display: flex;
            gap: 6px;
            margin-bottom: 8px;
        }
        #sim-status-legend .legend-add-form input[type="text"] {
            flex-grow: 1;
            padding: 6px 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 12px;
        }
        #sim-status-legend .legend-add-form input[type="text"]:focus {
            outline: none;
            border-color: #2196f3;
        }
        #sim-status-legend .legend-add-form input[type="color"] {
            width: 32px;
            height: 28px;
            padding: 0;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
        }
        #sim-status-legend .legend-add-form button {
            padding: 6px 12px;
            background: #2196f3;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        #sim-status-legend .legend-add-form button:hover {
            background: #1976d2;
        }
        #sim-status-legend .legend-reset {
            width: 100%;
            padding: 6px;
            background: #f5f5f5;
            color: #666;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
        }
        #sim-status-legend .legend-reset:hover {
            background: #eee;
            color: #333;
        }
        #sim-status-legend .legend-content::-webkit-scrollbar {
            width: 6px;
        }
        #sim-status-legend .legend-content::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
        }
        #sim-status-legend .legend-content::-webkit-scrollbar-thumb {
            background: #ccc;
            border-radius: 3px;
        }
        #sim-status-legend .legend-content::-webkit-scrollbar-thumb:hover {
            background: #aaa;
        }
    `;

    // Add base styles to the page
    GM_addStyle(baseStyles);

    /**
     * Apply color coding to ticket rows based on their status
     */
    function applyStatusColors() {
        // Find all ticket rows in the table
        const rows = document.querySelectorAll('tr.awsui_row_wih1l_1q04c_359');

        rows.forEach(row => {
            // Find the status cell - it contains a div with class "sim-table--status"
            const statusCell = row.querySelector('.sim-table--status');

            if (statusCell) {
                const status = statusCell.textContent.trim();

                // Set a data attribute for CSS targeting
                row.setAttribute('data-sim-status', status);

                // If this is a new status we haven't seen, add it with a default color
                if (status && !STATUS_COLORS.hasOwnProperty(status)) {
                    // Generate a random pastel color for new statuses
                    const hue = Math.floor(Math.random() * 360);
                    STATUS_COLORS[status] = `hsl(${hue}, 70%, 90%)`;
                    saveStatusColors();
                    updateStatusStyles();
                    updateLegendItems();
                }
            }
        });
    }

    /**
     * Update just the legend items (not the whole legend)
     */
    function updateLegendItems() {
        const itemsContainer = document.querySelector('#sim-status-legend .legend-items');
        if (!itemsContainer) return;

        itemsContainer.innerHTML = Object.entries(STATUS_COLORS).map(([status, color]) => `
            <div class="legend-item" data-status="${status}">
                <span class="legend-color" style="background-color: ${color}" title="Click to change color">
                    <input type="color" value="${color}" data-status="${status}">
                </span>
                <span class="legend-label">${status}</span>
                <span class="legend-delete" title="Remove status">×</span>
            </div>
        `).join('');

        // Re-attach event listeners
        attachLegendItemListeners();
    }

    /**
     * Attach event listeners to legend items
     */
    function attachLegendItemListeners() {
        const legend = document.getElementById('sim-status-legend');
        if (!legend) return;

        // Color picker change handlers
        legend.querySelectorAll('.legend-color input[type="color"]').forEach(input => {
            input.addEventListener('change', (e) => {
                const status = e.target.dataset.status;
                const newColor = e.target.value;
                STATUS_COLORS[status] = newColor;
                saveStatusColors();
                updateStatusStyles();
                e.target.parentElement.style.backgroundColor = newColor;
            });

            // Prevent click from bubbling to parent
            input.addEventListener('click', (e) => e.stopPropagation());
        });

        // Delete button handlers
        legend.querySelectorAll('.legend-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const item = e.target.closest('.legend-item');
                const status = item.dataset.status;

                if (confirm(`Remove color for "${status}"? Tickets with this status will no longer be highlighted.`)) {
                    delete STATUS_COLORS[status];
                    saveStatusColors();
                    updateStatusStyles();
                    item.remove();
                }
            });
        });
    }

    /**
     * Create a legend showing the color coding with edit capabilities
     */
    function createLegend() {
        // Remove existing legend if present
        const existingLegend = document.getElementById('sim-status-legend');
        if (existingLegend) {
            existingLegend.remove();
        }

        const legend = document.createElement('div');
        legend.id = 'sim-status-legend';
        legend.innerHTML = `
            <div class="legend-header">
                <span class="legend-title">
                    <span>🎨</span>
                    <span>Status Colors</span>
                </span>
                <span class="legend-toggle-icon">▼</span>
            </div>
            <div class="legend-content">
                <div class="legend-items">
                    ${Object.entries(STATUS_COLORS).map(([status, color]) => `
                        <div class="legend-item" data-status="${status}">
                            <span class="legend-color" style="background-color: ${color}" title="Click to change color">
                                <input type="color" value="${color}" data-status="${status}">
                            </span>
                            <span class="legend-label">${status}</span>
                            <span class="legend-delete" title="Remove status">×</span>
                        </div>
                    `).join('')}
                </div>
                <div class="legend-actions">
                    <div class="legend-add-form">
                        <input type="text" placeholder="New status name" id="sim-new-status-name">
                        <input type="color" value="#e0e0e0" id="sim-new-status-color" title="Pick color">
                        <button id="sim-add-status-btn">Add</button>
                    </div>
                    <button class="legend-reset" id="sim-reset-colors-btn">Reset to Defaults</button>
                </div>
            </div>
        `;

        document.body.appendChild(legend);

        // Toggle functionality for the header
        legend.querySelector('.legend-header').addEventListener('click', () => {
            legend.classList.toggle('collapsed');
        });

        // Attach item listeners
        attachLegendItemListeners();

        // Add new status handler
        const addBtn = document.getElementById('sim-add-status-btn');
        const nameInput = document.getElementById('sim-new-status-name');
        const colorInput = document.getElementById('sim-new-status-color');

        addBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            const color = colorInput.value;

            if (!name) {
                alert('Please enter a status name');
                return;
            }

            if (STATUS_COLORS.hasOwnProperty(name)) {
                alert('This status already exists. Edit its color directly in the list.');
                return;
            }

            STATUS_COLORS[name] = color;
            saveStatusColors();
            updateStatusStyles();
            updateLegendItems();

            // Clear input
            nameInput.value = '';
            colorInput.value = '#e0e0e0';
        });

        // Allow Enter key to add status
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addBtn.click();
            }
        });

        // Reset to defaults handler
        document.getElementById('sim-reset-colors-btn').addEventListener('click', () => {
            if (confirm('Reset all status colors to defaults? This will remove any custom statuses you added.')) {
                STATUS_COLORS = { ...DEFAULT_STATUS_COLORS };
                saveStatusColors();
                updateStatusStyles();
                updateLegendItems();
            }
        });

        // Start collapsed by default to be less intrusive
        legend.classList.add('collapsed');
    }

    /**
     * Initialize the script with a MutationObserver to handle dynamic content
     */
    function init() {
        console.log('SIM Tools: Initializing status color coding...');

        // Load saved colors
        loadStatusColors();

        // Apply dynamic styles
        updateStatusStyles();

        // Initial application
        applyStatusColors();
        createLegend();

        // Set up MutationObserver to handle dynamically loaded content
        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;

            mutations.forEach((mutation) => {
                // Check if new nodes were added that might be ticket rows
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if the added node is a table row or contains table rows
                            if (node.matches && (node.matches('tr.awsui_row_wih1l_1q04c_359') ||
                                node.querySelector && node.querySelector('tr.awsui_row_wih1l_1q04c_359'))) {
                                shouldUpdate = true;
                            }
                        }
                    });
                }
            });

            if (shouldUpdate) {
                // Debounce the update to avoid excessive calls
                clearTimeout(window.simToolsUpdateTimeout);
                window.simToolsUpdateTimeout = setTimeout(() => {
                    applyStatusColors();
                }, 100);
            }
        });

        // Start observing the document body for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('SIM Tools: Status color coding initialized successfully');
    }

    // Wait for the page to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM is already ready, but wait a bit for dynamic content to load
        setTimeout(init, 1000);
    }

    // Also re-apply when the page visibility changes (user returns to tab)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            setTimeout(applyStatusColors, 500);
        }
    });

})();
