/**
 * YouTube Topic Feed Pro - Enhanced Popup Controller v7.8.6
 * Added: Negative filtering system for topics and channels
 */

(function() {
    'use strict';
    
    // Enhanced configuration
    const CONFIG = {
        MAX_TOPICS: Number.MAX_SAFE_INTEGER,
        MAX_NEGATIVE_TOPICS: Number.MAX_SAFE_INTEGER,
        MIN_TOPIC_LENGTH: 2,
        MAX_TOPIC_LENGTH: 50,
        MAX_FILE_SIZE: 100 * 1024,
        PERFORMANCE_THRESHOLD: 100,
        VIRTUALIZATION_THRESHOLD: 200
    };
    
    // Premium logging system
    const Logger = {
        info: (message, data = null) => console.log(`[Popup] ${message}`, data || ''),
        error: (message, error = null) => console.error(`[Popup ERROR] ${message}`, error || ''),
        warn: (message, data = null) => console.warn(`[Popup WARNING] ${message}`, data || '')
    };
    
    // Elements
    const elements = {
        // Positive topics
        topicInput: document.getElementById('topicInput'),
        addButton: document.getElementById('addButton'),
        fileInput: document.getElementById('fileInput'),
        topicsContainer: document.getElementById('topics'),
        
        // Negative topics
        negativeTopicInput: document.getElementById('negativeTopicInput'),
        addNegativeButton: document.getElementById('addNegativeButton'),
        negativeTopicsContainer: document.getElementById('negativeTopics'),
        
        // Common elements
        message: document.getElementById('message'),
        stats: document.getElementById('stats')
    };
    
    let topics = [];
    let negativeTopics = [];
    let isPerformanceMode = false;
    
    // Utility Functions
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function showMessage(text, type = 'success') {
        elements.message.textContent = text;
        elements.message.className = `message ${type}`;
        setTimeout(() => {
            elements.message.classList.add('hidden');
        }, 4000);
    }
    
    function validateTopic(topic, isNegative = false) {
        if (!topic || typeof topic !== 'string') {
            return { isValid: false, error: 'Topic cannot be empty' };
        }
        
        const trimmed = topic.trim();
        if (trimmed.length < CONFIG.MIN_TOPIC_LENGTH) {
            return { isValid: false, error: `Topic must be at least ${CONFIG.MIN_TOPIC_LENGTH} characters` };
        }
        
        if (trimmed.length > CONFIG.MAX_TOPIC_LENGTH) {
            return { isValid: false, error: `Topic must be less than ${CONFIG.MAX_TOPIC_LENGTH} characters` };
        }
        
        // Check for duplicates in the appropriate list
        const targetList = isNegative ? negativeTopics : topics;
        if (targetList.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
            return { isValid: false, error: 'Topic already exists' };
        }
        
        return { isValid: true, topic: trimmed };
    }
    
    // Storage Functions
    async function loadTopics() {
        try {
            const data = await chrome.storage.local.get(['topics', 'negativeTopics']);
            topics = Array.isArray(data.topics) ? data.topics : [];
            negativeTopics = Array.isArray(data.negativeTopics) ? data.negativeTopics : [];
            
            Logger.info(`Loaded ${topics.length} positive topics and ${negativeTopics.length} negative topics`);
            
            // Enable performance mode for large lists
            isPerformanceMode = (topics.length + negativeTopics.length) >= CONFIG.PERFORMANCE_THRESHOLD;
            
            renderTopics();
            renderNegativeTopics();
            updateStats();
        } catch (error) {
            console.error('Failed to load topics:', error);
            showMessage('Failed to load topics', 'error');
        }
    }
    
    async function saveTopics() {
        try {
            await chrome.storage.local.set({ 
                topics: topics,
                negativeTopics: negativeTopics 
            });
            Logger.info(`Saved ${topics.length} positive and ${negativeTopics.length} negative topics`);
        } catch (error) {
            console.error('Failed to save topics:', error);
            showMessage('Failed to save topics', 'error');
        }
    }
    
    // UI Functions for Positive Topics
    function renderTopics() {
        elements.topicsContainer.innerHTML = '';
        
        if (topics.length === 0) {
            elements.topicsContainer.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 32px; margin-bottom: 12px;">📝</div>
                    <div style="font-weight: 600; margin-bottom: 8px;">No topics added yet</div>
                    <div>Add topics you want to see</div>
                </div>
            `;
            return;
        }
        
        renderTopicList(topics, elements.topicsContainer, false);
    }
    
    // UI Functions for Negative Topics
    function renderNegativeTopics() {
        elements.negativeTopicsContainer.innerHTML = '';
        
        if (negativeTopics.length === 0) {
            elements.negativeTopicsContainer.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 32px; margin-bottom: 12px;">🚫</div>
                    <div style="font-weight: 600; margin-bottom: 8px;">No filters added yet</div>
                    <div>Block unwanted channels or topics</div>
                </div>
            `;
            return;
        }
        
        renderTopicList(negativeTopics, elements.negativeTopicsContainer, true);
    }
    
    function renderTopicList(topicList, container, isNegative) {
        const fragment = document.createDocumentFragment();
        
        topicList.forEach((topic, index) => {
            const card = createTopicCard(topic, index, isNegative);
            fragment.appendChild(card);
        });
        
        container.appendChild(fragment);
        Logger.info(`Rendered ${topicList.length} ${isNegative ? 'negative' : 'positive'} topic cards`);
    }
    
    function createTopicCard(topic, index, isNegative) {
        const card = document.createElement('div');
        card.className = `topic-card ${isNegative ? 'negative' : ''}`;
        
        if (isPerformanceMode) {
            card.classList.add('performance-mode');
        }
        
        card.innerHTML = `
            <div class="topic-name">${escapeHtml(topic)}</div>
            <button class="remove" title="Remove ${isNegative ? 'filter' : 'topic'}" 
                    data-index="${index}" data-negative="${isNegative}">×</button>
        `;
        
        const removeButton = card.querySelector('.remove');
        removeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(removeButton.dataset.index);
            const isNeg = removeButton.dataset.negative === 'true';
            
            if (isNeg) {
                removeNegativeTopic(index);
            } else {
                removeTopic(index);
            }
        });
        
        return card;
    }
    
    function updateStats() {
        const positiveCount = topics.length;
        const negativeCount = negativeTopics.length;
        let statsText = `${positiveCount} Topics`;
        
        if (negativeCount > 0) {
            statsText += ` • ${negativeCount} Blocked`;
        }
        
        // Add performance indicators for large lists
        const totalCount = positiveCount + negativeCount;
        if (totalCount >= CONFIG.VIRTUALIZATION_THRESHOLD) {
            statsText += ' (Virtual)';
        } else if (totalCount >= CONFIG.PERFORMANCE_THRESHOLD) {
            statsText += ' (Fast)';
        }
        
        elements.stats.textContent = statsText;
        
        // Update performance mode
        const wasPerformanceMode = isPerformanceMode;
        isPerformanceMode = totalCount >= CONFIG.PERFORMANCE_THRESHOLD;
        
        if (wasPerformanceMode !== isPerformanceMode) {
            Logger.info(`Performance mode ${isPerformanceMode ? 'enabled' : 'disabled'} at ${totalCount} total topics`);
        }
    }
    
    // Topic Management - Positive Topics
    async function addTopic(topicText) {
        const validation = validateTopic(topicText, false);
        
        if (!validation.isValid) {
            showMessage(validation.error, 'error');
            return false;
        }
        
        topics.push(validation.topic);
        await saveTopics();
        renderTopics();
        updateStats();
        showMessage(`Added: ${validation.topic}`, 'success');
        
        Logger.info(`Positive topic added. Total count: ${topics.length}`);
        return true;
    }
    
    async function removeTopic(index) {
        if (index < 0 || index >= topics.length) return;
        
        const removedTopic = topics[index];
        topics.splice(index, 1);
        await saveTopics();
        renderTopics();
        updateStats();
        showMessage(`Removed: ${removedTopic}`, 'success');
        
        Logger.info(`Positive topic removed. Total count: ${topics.length}`);
    }
    
    // Topic Management - Negative Topics
    async function addNegativeTopic(topicText) {
        const validation = validateTopic(topicText, true);
        
        if (!validation.isValid) {
            showMessage(validation.error, 'error');
            return false;
        }
        
        negativeTopics.push(validation.topic);
        await saveTopics();
        renderNegativeTopics();
        updateStats();
        showMessage(`Blocked: ${validation.topic}`, 'success');
        
        Logger.info(`Negative topic added. Total count: ${negativeTopics.length}`);
        return true;
    }
    
    async function removeNegativeTopic(index) {
        if (index < 0 || index >= negativeTopics.length) return;
        
        const removedTopic = negativeTopics[index];
        negativeTopics.splice(index, 1);
        await saveTopics();
        renderNegativeTopics();
        updateStats();
        showMessage(`Unblocked: ${removedTopic}`, 'success');
        
        Logger.info(`Negative topic removed. Total count: ${negativeTopics.length}`);
    }
    
    // File Import Functions (for positive topics)
    function parseTopicsFromText(text) {
        const lines = text.split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        const validTopics = [];
        const errors = [];
        
        lines.forEach((line, lineNumber) => {
            const validation = validateTopic(line, false);
            if (validation.isValid) {
                validTopics.push(validation.topic);
            } else if (validation.error !== 'Topic already exists') {
                errors.push(`Line ${lineNumber + 1}: ${validation.error}`);
            }
        });
        
        return { validTopics, errors };
    }
    
    async function handleFileImport(file) {
        if (!file) return;
        
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            showMessage(`File too large. Maximum size: ${CONFIG.MAX_FILE_SIZE / 1024}KB`, 'error');
            return;
        }
        
        if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
            showMessage('Please upload a valid .txt file', 'error');
            return;
        }
        
        try {
            const text = await readFileAsText(file);
            const { validTopics, errors } = parseTopicsFromText(text);
            
            if (validTopics.length === 0 && errors.length === 0) {
                showMessage('No valid topics found in file', 'error');
                return;
            }
            
            let addedCount = 0;
            for (const topic of validTopics) {
                topics.push(topic);
                addedCount++;
            }
            
            if (addedCount > 0) {
                await saveTopics();
                renderTopics();
                updateStats();
                
                let message = `Successfully imported ${addedCount} topic${addedCount === 1 ? '' : 's'}`;
                if (errors.length > 0) {
                    message += ` (${errors.length} line${errors.length === 1 ? '' : 's'} skipped)`;
                }
                showMessage(message, 'success');
                
                Logger.info(`Bulk import completed. Added ${addedCount} topics. Total: ${topics.length}`);
            } else {
                showMessage('No new topics were added from the file', 'error');
            }
            
        } catch (error) {
            console.error('File import error:', error);
            showMessage('Failed to read file', 'error');
        } finally {
            elements.fileInput.value = '';
        }
    }
    
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
    
    // Event Listeners
    function setupEventListeners() {
        // Positive topics
        elements.addButton.addEventListener('click', async () => {
            const topicText = elements.topicInput.value.trim();
            if (await addTopic(topicText)) {
                elements.topicInput.value = '';
                updateAddButtonState();
            }
        });
        
        elements.topicInput.addEventListener('input', updateAddButtonState);
        
        elements.topicInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter' && !elements.addButton.disabled) {
                const topicText = elements.topicInput.value.trim();
                if (await addTopic(topicText)) {
                    elements.topicInput.value = '';
                    updateAddButtonState();
                }
            }
        });
        
        // Negative topics
        elements.addNegativeButton.addEventListener('click', async () => {
            const topicText = elements.negativeTopicInput.value.trim();
            if (await addNegativeTopic(topicText)) {
                elements.negativeTopicInput.value = '';
                updateNegativeAddButtonState();
            }
        });
        
        elements.negativeTopicInput.addEventListener('input', updateNegativeAddButtonState);
        
        elements.negativeTopicInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter' && !elements.addNegativeButton.disabled) {
                const topicText = elements.negativeTopicInput.value.trim();
                if (await addNegativeTopic(topicText)) {
                    elements.negativeTopicInput.value = '';
                    updateNegativeAddButtonState();
                }
            }
        });
        
        // File import
        elements.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFileImport(file);
            }
        });
    }
    
    function updateAddButtonState() {
        const hasInput = elements.topicInput.value.trim().length > 0;
        elements.addButton.disabled = !hasInput;
    }
    
    function updateNegativeAddButtonState() {
        const hasInput = elements.negativeTopicInput.value.trim().length > 0;
        elements.addNegativeButton.disabled = !hasInput;
    }
    
    // Initialize
    function initialize() {
        setupEventListeners();
        loadTopics();
        updateAddButtonState();
        updateNegativeAddButtonState();
        
        Logger.info('Popup initialized with negative filtering support');
    }
    
    // Start the application
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})();
