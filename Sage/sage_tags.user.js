// ==UserScript==
// @name         Sage Question Browser
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Amazon-themed UI for browsing Sage questions with filtering and cross-site support
// @author       Ryan Satterfield at Amazon
// @homepage     https://github.com/RynAgain/Slack_Triage
// @supportURL   https://github.com/RynAgain/Slack_Triage/issues
// @updateURL    https://raw.githubusercontent.com/RynAgain/Slack_Triage/main/Sage/sage_tags.user.js
// @downloadURL  https://raw.githubusercontent.com/RynAgain/Slack_Triage/main/Sage/sage_tags.user.js
// @match        https://*/*
// @connect      api.us-east-1.prod.sage.amazon.dev
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// ==/UserScript==

(function() {
    'use strict';
    
    // ============================================================================
    // CONSTANTS & CONFIGURATION
    // ============================================================================
    
    const CONFIG = {
        TOKEN_STORAGE_KEY: 'sage_userscript_auth_token',
        TOKEN_TIMESTAMP_KEY: 'sage_userscript_auth_token_timestamp',
        API_BASE_URL: 'https://api.us-east-1.prod.sage.amazon.dev/api',
        DEFAULT_TAG_ID: '9391',
        RESULTS_PER_PAGE: 100, // Per page for multi-page loading
        MAX_PAGES_TO_LOAD: 10, // Maximum pages to auto-load
        COLORS: {
            amazonOrange: '#FF9900',
            amazonBlue: '#146EB4',
            darkGray: '#232F3E',
            lightGray: '#EAEDED',
            white: '#FFFFFF',
            success: '#067D62',
            error: '#D13212'
        }
    };
    
    // ============================================================================
    // STATE MANAGEMENT
    // ============================================================================
    
    const state = {
        questions: [],
        filteredQuestions: [],
        currentPage: 1,
        totalPages: 1,
        filters: {},
        loading: false,
        loadingProgress: '',
        error: null,
        tagId: CONFIG.DEFAULT_TAG_ID,
        stats: null
    };
    
    // ============================================================================
    // TOKEN MANAGEMENT (Cross-site compatible)
    // ============================================================================
    
    function getAuthToken() {
        // Try GM_getValue first (cross-site storage)
        let token = GM_getValue(CONFIG.TOKEN_STORAGE_KEY, null);
        if (token) {
            console.log('[Sage] Using token from GM storage');
            return token;
        }
        
        // Try cookie (if on sage.amazon.dev)
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'token') {
                token = decodeURIComponent(value);
                console.log('[Sage] Found token in cookie, storing for cross-site use');
                GM_setValue(CONFIG.TOKEN_STORAGE_KEY, token);
                GM_setValue(CONFIG.TOKEN_TIMESTAMP_KEY, Date.now().toString());
                return token;
            }
        }
        
        // Try localStorage fallback
        token = localStorage.getItem(CONFIG.TOKEN_STORAGE_KEY);
        if (token) {
            console.log('[Sage] Using token from localStorage');
            return token;
        }
        
        return null;
    }
    
    function setAuthToken(token) {
        GM_setValue(CONFIG.TOKEN_STORAGE_KEY, token);
        GM_setValue(CONFIG.TOKEN_TIMESTAMP_KEY, Date.now().toString());
        localStorage.setItem(CONFIG.TOKEN_STORAGE_KEY, token);
        console.log('[Sage] Token stored successfully');
    }
    
    function getTokenAge() {
        const timestamp = GM_getValue(CONFIG.TOKEN_TIMESTAMP_KEY, null);
        if (!timestamp) return null;
        const age = Date.now() - parseInt(timestamp);
        return Math.floor(age / (1000 * 60 * 60)); // hours
    }
    
    // ============================================================================
    // API FUNCTIONS
    // ============================================================================
    
    function makeSageRequest(tagId, page = 1) {
        return new Promise((resolve, reject) => {
            const authToken = getAuthToken();
            
            if (!authToken) {
                reject(new Error('No authorization token found. Please visit sage.amazon.dev to authenticate.'));
                return;
            }
            
            const url = `${CONFIG.API_BASE_URL}/tags/${tagId}/questions.json?page=${page}&per_page=${CONFIG.RESULTS_PER_PAGE}&endpoint_version=v2&t=${Date.now()}`;
            
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Accept': 'application/json',
                    'Authorization': authToken,
                    'Content-Type': 'application/json'
                },
                onload: function(response) {
                    if (response.status === 200) {
                        try {
                            const data = JSON.parse(response.responseText);
                            resolve(data);
                        } catch (e) {
                            reject(new Error('Failed to parse response'));
                        }
                    } else if (response.status === 401) {
                        reject(new Error('Authentication failed. Token may be expired. Please visit sage.amazon.dev to refresh.'));
                    } else {
                        reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: function(error) {
                    reject(new Error('Network request failed'));
                }
            });
        });
    }
    
    async function loadAllQuestions(tagId, loadAllPages = false) {
        state.loading = true;
        state.error = null;
        state.questions = [];
        state.loadingProgress = 'Starting...';
        updateUI();
        
        try {
            let page = 1;
            let hasMore = true;
            let allQuestions = [];
            const maxPages = loadAllPages ? Infinity : CONFIG.MAX_PAGES_TO_LOAD;
            
            while (hasMore && page <= maxPages) {
                state.loadingProgress = loadAllPages
                    ? `Loading page ${page}... (unlimited mode)`
                    : `Loading page ${page}/${CONFIG.MAX_PAGES_TO_LOAD}...`;
                updateUI();
                
                const data = await makeSageRequest(tagId, page);
                const questions = data.questions || [];
                
                if (questions.length === 0) {
                    console.log(`[Sage] No more questions found at page ${page}`);
                    hasMore = false;
                } else {
                    allQuestions = allQuestions.concat(questions);
                    console.log(`[Sage] Loaded page ${page}: ${questions.length} questions (total: ${allQuestions.length})`);
                    page++;
                    
                    // Check if we've reached the last page
                    if (data.total_pages && page > data.total_pages) {
                        console.log(`[Sage] Reached last page (${data.total_pages})`);
                        hasMore = false;
                    }
                }
            }
            
            if (page > maxPages && !loadAllPages) {
                console.log(`[Sage] Stopped at page limit (${CONFIG.MAX_PAGES_TO_LOAD})`);
            }
            
            state.questions = allQuestions;
            state.filteredQuestions = [...allQuestions];
            state.totalPages = page - 1;
            state.loading = false;
            state.loadingProgress = '';
            
            // Calculate statistics
            calculateStatistics();
            
            updateUI();
            console.log(`[Sage] Finished loading ${allQuestions.length} questions across ${page - 1} pages`);
        } catch (error) {
            state.error = error.message;
            state.loading = false;
            state.loadingProgress = '';
            updateUI();
        }
    }
    
    function calculateStatistics() {
        if (state.questions.length === 0) {
            state.stats = null;
            return;
        }
        
        const stats = {
            totalQuestions: state.questions.length,
            withAnswers: 0,
            withAcceptedAnswer: 0,
            totalViews: 0,
            totalScore: 0,
            uniqueOwners: new Set(),
            uniqueTags: new Set(),
            byOwner: {},
            byTag: {},
            avgAnswersPerQuestion: 0,
            totalAnswers: 0
        };
        
        state.questions.forEach(q => {
            // Answers
            if (q.answers && q.answers.length > 0) {
                stats.withAnswers++;
                stats.totalAnswers += q.answers.length;
            }
            if (q.accepted_answer_id) {
                stats.withAcceptedAnswer++;
            }
            
            // Views and score
            stats.totalViews += q.view_count || 0;
            stats.totalScore += q.score || 0;
            
            // Owners
            if (q.owner?.displayname) {
                stats.uniqueOwners.add(q.owner.displayname);
                stats.byOwner[q.owner.displayname] = (stats.byOwner[q.owner.displayname] || 0) + 1;
            }
            
            // Tags
            if (q.tags && Array.isArray(q.tags)) {
                q.tags.forEach(tag => {
                    if (tag.name) {
                        stats.uniqueTags.add(tag.name);
                        stats.byTag[tag.name] = (stats.byTag[tag.name] || 0) + 1;
                    }
                });
            }
        });
        
        stats.avgAnswersPerQuestion = stats.totalAnswers / stats.totalQuestions;
        stats.avgViewsPerQuestion = stats.totalViews / stats.totalQuestions;
        stats.avgScorePerQuestion = stats.totalScore / stats.totalQuestions;
        
        // Convert sets to counts
        stats.uniqueOwnersCount = stats.uniqueOwners.size;
        stats.uniqueTagsCount = stats.uniqueTags.size;
        
        // Top contributors
        stats.topOwners = Object.entries(stats.byOwner)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        // Top tags
        stats.topTags = Object.entries(stats.byTag)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        state.stats = stats;
    }
    
    // ============================================================================
    // FILTERING SYSTEM
    // ============================================================================
    
    function getAvailableFilters() {
        if (state.questions.length === 0) return {};
        
        const filters = {};
        
        // Extract owner display names
        const owners = new Set();
        state.questions.forEach(q => {
            if (q.owner?.displayname) {
                owners.add(q.owner.displayname);
            }
        });
        if (owners.size > 0) {
            filters['owner'] = Array.from(owners).sort();
        }
        
        // Extract tag names
        const tags = new Set();
        state.questions.forEach(q => {
            if (q.tags && Array.isArray(q.tags)) {
                q.tags.forEach(tag => {
                    if (tag.name) tags.add(tag.name);
                });
            }
        });
        if (tags.size > 0) {
            filters['tag'] = Array.from(tags).sort();
        }
        
        // Extract topics
        const topics = new Set();
        state.questions.forEach(q => {
            if (q.topic_id) {
                topics.add(q.topic_id.toString());
            }
        });
        if (topics.size > 0) {
            filters['topic_id'] = Array.from(topics).sort();
        }
        
        // Has accepted answer
        filters['has_answer'] = ['Yes', 'No'];
        
        // Has answers
        filters['has_responses'] = ['Yes', 'No'];
        
        return filters;
    }
    
    function applyFilters() {
        state.filteredQuestions = state.questions.filter(question => {
            for (const [field, value] of Object.entries(state.filters)) {
                if (!value) continue;
                
                // Handle different filter types
                if (field === 'owner') {
                    if (question.owner?.displayname !== value) return false;
                } else if (field === 'tag') {
                    const hasTag = question.tags?.some(tag => tag.name === value);
                    if (!hasTag) return false;
                } else if (field === 'topic_id') {
                    if (question.topic_id?.toString() !== value) return false;
                } else if (field === 'has_answer') {
                    const hasAnswer = question.accepted_answer_id !== null;
                    if ((value === 'Yes' && !hasAnswer) || (value === 'No' && hasAnswer)) return false;
                } else if (field === 'has_responses') {
                    const hasResponses = question.answers && question.answers.length > 0;
                    if ((value === 'Yes' && !hasResponses) || (value === 'No' && hasResponses)) return false;
                }
            }
            return true;
        });
        updateUI();
    }
    
    // ============================================================================
    // UI CREATION
    // ============================================================================
    
    function createUI() {
        // Create main container
        const container = document.createElement('div');
        container.id = 'sage-question-browser';
        container.innerHTML = `
            <style>
                #sage-question-browser {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    width: 450px;
                    max-height: 80vh;
                    background: ${CONFIG.COLORS.white};
                    border: 2px solid ${CONFIG.COLORS.darkGray};
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    font-family: 'Amazon Ember', Arial, sans-serif;
                    z-index: 999999;
                    display: flex;
                    flex-direction: column;
                }
                
                #sage-header {
                    background: ${CONFIG.COLORS.amazonBlue};
                    color: ${CONFIG.COLORS.white};
                    padding: 16px;
                    border-radius: 6px 6px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                }
                
                #sage-header h2 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 700;
                }
                
                
                #sage-content {
                    padding: 16px;
                    overflow-y: auto;
                    max-height: calc(80vh - 200px);
                }
                
                #sage-controls {
                    padding: 16px;
                    border-top: 1px solid ${CONFIG.COLORS.lightGray};
                    background: #f9f9f9;
                }
                
                .sage-input-group {
                    margin-bottom: 12px;
                }
                
                .sage-input-group label {
                    display: block;
                    font-size: 13px;
                    font-weight: 600;
                    margin-bottom: 4px;
                    color: ${CONFIG.COLORS.darkGray};
                }
                
                .sage-input-group input,
                .sage-input-group select {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    box-sizing: border-box;
                }
                
                .sage-button {
                    background: ${CONFIG.COLORS.amazonOrange};
                    color: ${CONFIG.COLORS.darkGray};
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    width: 100%;
                    transition: background 0.2s;
                }
                
                .sage-button:hover {
                    background: #ec8b00;
                }
                
                .sage-button:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                
                .sage-button-secondary {
                    background: ${CONFIG.COLORS.white};
                    color: ${CONFIG.COLORS.darkGray};
                    border: 1px solid ${CONFIG.COLORS.darkGray};
                }
                
                .sage-button-secondary:hover {
                    background: ${CONFIG.COLORS.lightGray};
                }
                
                .sage-question-card {
                    background: ${CONFIG.COLORS.white};
                    border: 1px solid ${CONFIG.COLORS.lightGray};
                    border-radius: 6px;
                    padding: 12px;
                    margin-bottom: 12px;
                    transition: box-shadow 0.2s;
                }
                
                .sage-question-card:hover {
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                
                .sage-question-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: ${CONFIG.COLORS.amazonBlue};
                    margin-bottom: 8px;
                    cursor: pointer;
                }
                
                .sage-question-title:hover {
                    text-decoration: underline;
                }
                
                .sage-question-meta {
                    font-size: 12px;
                    color: #666;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                
                .sage-meta-tag {
                    background: ${CONFIG.COLORS.lightGray};
                    padding: 2px 8px;
                    border-radius: 3px;
                    font-size: 11px;
                }
                
                .sage-loading {
                    text-align: center;
                    padding: 20px;
                    color: #666;
                }
                
                .sage-error {
                    background: #fff0f0;
                    border: 1px solid ${CONFIG.COLORS.error};
                    color: ${CONFIG.COLORS.error};
                    padding: 12px;
                    border-radius: 4px;
                    margin-bottom: 12px;
                    font-size: 13px;
                }
                
                .sage-token-info {
                    font-size: 11px;
                    color: #666;
                    margin-top: 8px;
                    padding: 8px;
                    background: #f0f0f0;
                    border-radius: 4px;
                }
                
                .sage-pagination {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid ${CONFIG.COLORS.lightGray};
                }
                
                .sage-pagination button {
                    padding: 6px 12px;
                    font-size: 12px;
                }
                
                .sage-filters {
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid ${CONFIG.COLORS.lightGray};
                }
                
                .sage-filters-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                    cursor: pointer;
                    user-select: none;
                }
                
                .sage-filters-header:hover {
                    opacity: 0.7;
                }
                
                .sage-filters-content {
                    max-height: 300px;
                    overflow-y: auto;
                    transition: max-height 0.3s ease;
                }
                
                .sage-filters-content.collapsed {
                    max-height: 0;
                    overflow: hidden;
                }
                
                .sage-toggle-icon {
                    font-size: 16px;
                    font-weight: bold;
                }
                
                .sage-filter-row {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 8px;
                }
                
                .sage-minimized #sage-content,
                .sage-minimized #sage-controls {
                    display: none;
                }
                
                .sage-minimized {
                    width: 250px;
                }
                
                #sage-stats-btn,
                #sage-info-btn,
                #sage-minimize {
                    background: transparent;
                    border: 1px solid ${CONFIG.COLORS.white};
                    color: ${CONFIG.COLORS.white};
                    font-size: 18px;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 4px;
                    margin-left: 4px;
                    font-weight: normal;
                    min-width: 32px;
                    height: 32px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    line-height: 1;
                }
                
                #sage-stats-btn:hover,
                #sage-info-btn:hover,
                #sage-minimize:hover {
                    background: rgba(255,255,255,0.2);
                }
                
                #sage-minimize {
                    font-size: 24px;
                    border: none;
                }
                
                .sage-modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 9999999;
                    justify-content: center;
                    align-items: center;
                }
                
                .sage-modal.show {
                    display: flex;
                }
                
                .sage-modal-content {
                    background: ${CONFIG.COLORS.white};
                    border-radius: 8px;
                    padding: 24px;
                    max-width: 600px;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                }
                
                .sage-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid ${CONFIG.COLORS.amazonBlue};
                }
                
                .sage-modal-header h3 {
                    margin: 0;
                    color: ${CONFIG.COLORS.amazonBlue};
                    font-size: 20px;
                }
                
                .sage-modal-close {
                    background: transparent;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #666;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                }
                
                .sage-modal-close:hover {
                    color: ${CONFIG.COLORS.error};
                }
                
                .sage-modal-section {
                    margin-bottom: 20px;
                }
                
                .sage-modal-section h4 {
                    color: ${CONFIG.COLORS.darkGray};
                    margin-top: 0;
                    margin-bottom: 8px;
                    font-size: 16px;
                }
                
                .sage-modal-section p, .sage-modal-section ol, .sage-modal-section ul {
                    color: #333;
                    line-height: 1.6;
                    margin: 8px 0;
                    font-size: 14px;
                }
                
                .sage-modal-section code {
                    background: #f0f0f0;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-family: monospace;
                    font-size: 13px;
                }
                
                .sage-modal-section strong {
                    color: ${CONFIG.COLORS.amazonBlue};
                }
            </style>
            
            <div id="sage-header">
                <h2>🔍 Sage Questions</h2>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <button id="sage-stats-btn" title="View Statistics">📊</button>
                    <button id="sage-info-btn" title="Help">ℹ️</button>
                    <button id="sage-minimize" title="Minimize">−</button>
                </div>
            </div>
            
            <div id="sage-info-modal" class="sage-modal">
                <div class="sage-modal-content">
                    <div class="sage-modal-header">
                        <h3>📖 Sage Question Browser - Help</h3>
                        <button class="sage-modal-close" id="sage-modal-close">×</button>
                    </div>
                    
                    <div class="sage-modal-section">
                        <h4>👨‍💻 Developer</h4>
                        <p><strong>Ryan Satterfield</strong> at Amazon</p>
                        <p>Version 2.0.0</p>
                    </div>
                    
                    <div class="sage-modal-section">
                        <h4>🎯 What is this?</h4>
                        <p>This userscript provides a powerful interface for browsing and filtering Sage questions across any website. It uses cross-site storage to maintain your authentication token, allowing you to access Sage data from anywhere.</p>
                    </div>
                    
                    <div class="sage-modal-section">
                        <h4>🔑 Getting Your Token (First Time Setup)</h4>
                        <ol>
                            <li>Visit <strong>sage.amazon.dev</strong> and log in</li>
                            <li>The userscript will automatically detect and store your authentication token</li>
                            <li>You'll see "Token: ✓ Active" in the controls section</li>
                            <li>The token is now available on <strong>all websites</strong> you visit</li>
                        </ol>
                        <p><strong>Note:</strong> The token is stored using Tampermonkey's cross-site storage (<code>GM_setValue</code>), so it persists across browser sessions and works on any domain.</p>
                    </div>
                    
                    <div class="sage-modal-section">
                        <h4>📋 How to Use</h4>
                        <ol>
                            <li><strong>Enter a Tag ID:</strong> Type the Sage tag ID you want to query (default: 9391)</li>
                            <li><strong>Click "Load Questions":</strong> Fetches up to 500 questions per page</li>
                            <li><strong>Use Filters:</strong> Click the "Filters" header to expand/collapse filtering options
                                <ul>
                                    <li>Filter by owner (question author)</li>
                                    <li>Filter by tag name</li>
                                    <li>Filter by topic ID</li>
                                    <li>Filter by answered status</li>
                                    <li>Filter by response status</li>
                                </ul>
                            </li>
                            <li><strong>Navigate Pages:</strong> Use Previous/Next buttons if there are multiple pages</li>
                            <li><strong>Click Questions:</strong> Click any question title to open it in a new tab</li>
                        </ol>
                    </div>
                    
                    <div class="sage-modal-section">
                        <h4>🔧 Features</h4>
                        <ul>
                            <li><strong>Cross-Site Support:</strong> Works on any website, not just sage.amazon.dev</li>
                            <li><strong>Automatic Token Capture:</strong> Detects and stores tokens automatically</li>
                            <li><strong>Dynamic Filtering:</strong> Filters adapt based on loaded questions</li>
                            <li><strong>High Volume:</strong> Loads 500 questions per page (vs default ~20)</li>
                            <li><strong>Draggable UI:</strong> Click and drag the header to reposition</li>
                            <li><strong>Minimizable:</strong> Click the − button to minimize the panel</li>
                            <li><strong>Real-time Metadata:</strong> Shows owner, date, score, views, answers, and tags</li>
                        </ul>
                    </div>
                    
                    <div class="sage-modal-section">
                        <h4>❓ Troubleshooting</h4>
                        <p><strong>Token Missing or Expired:</strong></p>
                        <ul>
                            <li>Visit sage.amazon.dev and refresh the page</li>
                            <li>The token will be automatically captured</li>
                            <li>Check the token status in the controls section</li>
                        </ul>
                        <p><strong>401 Unauthorized Error:</strong></p>
                        <ul>
                            <li>Your token has expired</li>
                            <li>Visit sage.amazon.dev to get a fresh token</li>
                        </ul>
                    </div>
                </div>
            </div>
            
            <div id="sage-stats-modal" class="sage-modal">
                <div class="sage-modal-content">
                    <div class="sage-modal-header">
                        <h3>📊 Statistics</h3>
                        <button class="sage-modal-close" id="sage-stats-modal-close">×</button>
                    </div>
                    <div id="sage-stats-content">
                        <div class="sage-loading">Load questions to see statistics</div>
                    </div>
                </div>
            </div>
            
            <div id="sage-controls">
                <div class="sage-input-group">
                    <label>Tag ID:</label>
                    <input type="text" id="sage-tag-input" value="${CONFIG.DEFAULT_TAG_ID}" placeholder="Enter tag ID">
                </div>
                
                <div class="sage-input-group" style="margin-bottom: 8px;">
                    <label style="display: flex; align-items: center; cursor: pointer; font-size: 12px;">
                        <input type="checkbox" id="sage-load-all-pages" style="width: auto; margin-right: 6px;">
                        Load ALL pages (ignore 10-page limit)
                    </label>
                </div>
                
                <button class="sage-button" id="sage-load-btn">Load Questions</button>
                
                <div class="sage-token-info" id="sage-token-info">
                    Token: <span id="sage-token-status">Checking...</span>
                </div>
                
                <div class="sage-filters" id="sage-filters-container"></div>
            </div>
            
            <div id="sage-content">
                <div class="sage-loading">Click "Load Questions" to start</div>
            </div>
        `;
        
        document.body.appendChild(container);
        
        // Add event listeners
        document.getElementById('sage-load-btn').addEventListener('click', handleLoadQuestions);
        document.getElementById('sage-minimize').addEventListener('click', toggleMinimize);
        document.getElementById('sage-info-btn').addEventListener('click', showInfoModal);
        document.getElementById('sage-stats-btn').addEventListener('click', showStatsModal);
        document.getElementById('sage-modal-close').addEventListener('click', hideInfoModal);
        document.getElementById('sage-stats-modal-close').addEventListener('click', hideStatsModal);
        document.getElementById('sage-info-modal').addEventListener('click', (e) => {
            if (e.target.id === 'sage-info-modal') hideInfoModal();
        });
        document.getElementById('sage-stats-modal').addEventListener('click', (e) => {
            if (e.target.id === 'sage-stats-modal') hideStatsModal();
        });
        
        // Make draggable
        makeDraggable(container, document.getElementById('sage-header'));
        
        // Update token status
        updateTokenStatus();
    }
    
    function updateTokenStatus() {
        const token = getAuthToken();
        const statusEl = document.getElementById('sage-token-status');
        
        if (token) {
            const age = getTokenAge();
            statusEl.innerHTML = `<span style="color: ${CONFIG.COLORS.success}">✓ Active</span> ${age ? `(${age}h old)` : ''}`;
        } else {
            statusEl.innerHTML = `<span style="color: ${CONFIG.COLORS.error}">✗ Missing</span> - Visit sage.amazon.dev`;
        }
    }
    
    function handleLoadQuestions() {
        const tagId = document.getElementById('sage-tag-input').value.trim();
        if (!tagId) {
            alert('Please enter a tag ID');
            return;
        }
        
        const loadAllPages = document.getElementById('sage-load-all-pages').checked;
        
        if (loadAllPages) {
            const confirmed = confirm(
                'You are about to load ALL pages until no results are returned.\n\n' +
                'This may take a long time and load hundreds or thousands of questions.\n\n' +
                'Continue?'
            );
            if (!confirmed) return;
        }
        
        state.tagId = tagId;
        state.filters = {}; // Reset filters
        loadAllQuestions(tagId, loadAllPages);
    }
    
    function updateUI() {
        const contentEl = document.getElementById('sage-content');
        const loadBtn = document.getElementById('sage-load-btn');
        
        loadBtn.disabled = state.loading;
        if (state.loading) {
            loadBtn.textContent = state.loadingProgress || 'Loading...';
            contentEl.innerHTML = `<div class="sage-loading">${state.loadingProgress || 'Loading questions...'}</div>`;
            return;
        }
        loadBtn.textContent = 'Load Questions';
        
        if (state.error) {
            contentEl.innerHTML = `<div class="sage-error">${state.error}</div>`;
            return;
        }
        
        if (state.filteredQuestions.length === 0 && state.questions.length === 0) {
            contentEl.innerHTML = '<div class="sage-loading">No questions loaded yet</div>';
            return;
        }
        
        // Update filters
        updateFilters();
        
        // Render questions
        let html = '';
        
        if (state.filteredQuestions.length === 0) {
            html = '<div class="sage-loading">No questions match the current filters</div>';
        } else {
            const summary = `<div style="text-align: center; padding: 12px; background: #f0f0f0; border-radius: 4px; margin-bottom: 12px; font-size: 13px;">
                <strong>${state.questions.length} total questions</strong> |
                ${state.filteredQuestions.length} shown
                ${state.totalPages > 1 ? ` | Loaded ${state.totalPages} pages` : ''}
            </div>`;
            html = summary + state.filteredQuestions.map(q => renderQuestion(q)).join('');
        }
        
        contentEl.innerHTML = html;
    }
    
    function renderQuestion(question) {
        const title = question.title || 'Untitled Question';
        const id = question.id || '';
        const url = `https://sage.amazon.dev/questions/${id}`;
        
        // Extract metadata
        const metadata = [];
        
        // Owner
        if (question.owner?.displayname) {
            metadata.push(`👤 ${question.owner.displayname}`);
        }
        
        // Creation date
        if (question.creation_date) {
            const date = new Date(question.creation_date);
            metadata.push(`📅 ${date.toLocaleDateString()}`);
        }
        
        // Score
        if (question.score !== undefined) {
            metadata.push(`⭐ ${question.score}`);
        }
        
        // View count
        if (question.view_count !== undefined) {
            metadata.push(`👁️ ${question.view_count} views`);
        }
        
        // Answers
        if (question.answers) {
            const answerCount = question.answers.length;
            const hasAccepted = question.accepted_answer_id !== null;
            metadata.push(`💬 ${answerCount} answer${answerCount !== 1 ? 's' : ''}${hasAccepted ? ' ✓' : ''}`);
        }
        
        // Tags
        if (question.tags && question.tags.length > 0) {
            const tagNames = question.tags.map(t => t.name).join(', ');
            metadata.push(`🏷️ ${tagNames}`);
        }
        
        return `
            <div class="sage-question-card">
                <div class="sage-question-title" onclick="window.open('${url}', '_blank')">
                    ${title}
                </div>
                <div class="sage-question-meta">
                    ${metadata.map(m => `<span class="sage-meta-tag">${m}</span>`).join('')}
                </div>
            </div>
        `;
    }
    
    function updateFilters() {
        const filtersContainer = document.getElementById('sage-filters-container');
        const availableFilters = getAvailableFilters();
        
        if (Object.keys(availableFilters).length === 0) {
            filtersContainer.innerHTML = '';
            return;
        }
        
        const activeCount = Object.keys(state.filters).length;
        let html = `
            <div class="sage-filters-header" id="sage-filters-toggle">
                <div style="font-size: 12px; font-weight: 600;">Filters ${activeCount > 0 ? `(${activeCount} active)` : ''}</div>
                <span class="sage-toggle-icon" id="sage-filters-icon">▼</span>
            </div>
            <div class="sage-filters-content" id="sage-filters-content">
        `;
        
        for (const [field, values] of Object.entries(availableFilters)) {
            html += `
                <div class="sage-input-group">
                    <label>${field.replace(/_/g, ' ').toUpperCase()}:</label>
                    <select class="sage-filter-select" data-field="${field}">
                        <option value="">All</option>
                        ${values.map(v => `<option value="${v}" ${state.filters[field] === v ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                </div>
            `;
        }
        
        html += '</div>';
        filtersContainer.innerHTML = html;
        
        // Add toggle listener
        document.getElementById('sage-filters-toggle').addEventListener('click', toggleFilters);
        
        // Add filter listeners
        document.querySelectorAll('.sage-filter-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const value = e.target.value;
                if (value) {
                    state.filters[field] = value;
                } else {
                    delete state.filters[field];
                }
                applyFilters();
            });
        });
    }
    
    function toggleFilters() {
        const content = document.getElementById('sage-filters-content');
        const icon = document.getElementById('sage-filters-icon');
        
        if (content && icon) {
            content.classList.toggle('collapsed');
            icon.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
        }
    }
    
    function showInfoModal() {
        document.getElementById('sage-info-modal').classList.add('show');
    }
    
    function hideInfoModal() {
        document.getElementById('sage-info-modal').classList.remove('show');
    }
    
    function showStatsModal() {
        updateStatsDisplay();
        document.getElementById('sage-stats-modal').classList.add('show');
    }
    
    function hideStatsModal() {
        document.getElementById('sage-stats-modal').classList.remove('show');
    }
    
    function updateStatsDisplay() {
        const statsContent = document.getElementById('sage-stats-content');
        
        if (!state.stats) {
            statsContent.innerHTML = '<div class="sage-loading">Load questions to see statistics</div>';
            return;
        }
        
        const s = state.stats;
        
        statsContent.innerHTML = `
            <div class="sage-modal-section">
                <h4>📈 Overview</h4>
                <p><strong>Total Questions:</strong> ${s.totalQuestions}</p>
                <p><strong>Questions with Answers:</strong> ${s.withAnswers} (${((s.withAnswers/s.totalQuestions)*100).toFixed(1)}%)</p>
                <p><strong>Questions with Accepted Answer:</strong> ${s.withAcceptedAnswer} (${((s.withAcceptedAnswer/s.totalQuestions)*100).toFixed(1)}%)</p>
                <p><strong>Total Views:</strong> ${s.totalViews.toLocaleString()}</p>
                <p><strong>Total Score:</strong> ${s.totalScore}</p>
            </div>
            
            <div class="sage-modal-section">
                <h4>📊 Averages</h4>
                <p><strong>Avg Answers per Question:</strong> ${s.avgAnswersPerQuestion.toFixed(2)}</p>
                <p><strong>Avg Views per Question:</strong> ${s.avgViewsPerQuestion.toFixed(1)}</p>
                <p><strong>Avg Score per Question:</strong> ${s.avgScorePerQuestion.toFixed(2)}</p>
            </div>
            
            <div class="sage-modal-section">
                <h4>👥 Contributors</h4>
                <p><strong>Unique Contributors:</strong> ${s.uniqueOwnersCount}</p>
                <p><strong>Top 10 Contributors:</strong></p>
                <ul>
                    ${s.topOwners.map(([name, count]) => `<li>${name}: ${count} question${count !== 1 ? 's' : ''}</li>`).join('')}
                </ul>
            </div>
            
            <div class="sage-modal-section">
                <h4>🏷️ Tags</h4>
                <p><strong>Unique Tags:</strong> ${s.uniqueTagsCount}</p>
                <p><strong>Top 10 Tags:</strong></p>
                <ul>
                    ${s.topTags.map(([name, count]) => `<li>${name}: ${count} question${count !== 1 ? 's' : ''}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    function toggleMinimize() {
        const container = document.getElementById('sage-question-browser');
        const btn = document.getElementById('sage-minimize');
        container.classList.toggle('sage-minimized');
        btn.textContent = container.classList.contains('sage-minimized') ? '+' : '−';
    }
    
    function makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        handle.onmousedown = dragMouseDown;
        
        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        
        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = 'auto';
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
    
    // ============================================================================
    // TOKEN INTERCEPTORS (for auto-capture)
    // ============================================================================
    
    (function installInterceptors() {
        const originalFetch = window.fetch;
        
        window.fetch = function(...args) {
            const [url, options] = args;
            
            if (url && typeof url === 'string' && url.includes('sage.amazon.dev')) {
                if (options?.headers) {
                    const headers = options.headers;
                    let authToken = null;
                    
                    if (headers instanceof Headers) {
                        authToken = headers.get('authorization') || headers.get('Authorization');
                    } else if (typeof headers === 'object') {
                        authToken = headers.authorization || headers.Authorization;
                    }
                    
                    if (authToken && authToken.startsWith('eyJ')) {
                        setAuthToken(authToken);
                        updateTokenStatus();
                    }
                }
            }
            
            return originalFetch.apply(this, args);
        };
        
        // Also check for token cookie periodically
        setInterval(() => {
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'token') {
                    const token = decodeURIComponent(value);
                    const existing = getAuthToken();
                    if (token !== existing) {
                        setAuthToken(token);
                        updateTokenStatus();
                    }
                    break;
                }
            }
        }, 5000);
    })();
    
    // ============================================================================
    // INITIALIZATION
    // ============================================================================
    
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createUI);
        } else {
            createUI();
        }
    }
    
    init();
    console.log('[Sage Question Browser] Initialized');
    
})();