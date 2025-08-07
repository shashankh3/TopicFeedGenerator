/**
 * YouTube Topic Feed Pro - Enhanced Popup Controller v7.8.3
 * Added: Text file import functionality
 */

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        MAX_TOPICS: 20,
        MIN_TOPIC_LENGTH: 2,
        MAX_TOPIC_LENGTH: 50,
        MAX_FILE_SIZE: 100 * 1024 // 100KB
    };
    
    // Elements
    const elements = {
        topicInput: document.getElementById('topicInput'),
        addButton: document.getElementById('addButton'),
        fileInput: document.getElementById('fileInput'),
        message: document.getElementById('message'),
        topicsContainer: document.getElementById('topics'),
        stats: document.getElementById('stats')
    };
    
    let topics = [];
    
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
    
    function validateTopic(topic) {
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
        
        if (topics.length >= CONFIG.MAX_TOPICS) {
            return { isValid: false, error: `Maximum ${CONFIG.MAX_TOPICS} topics allowed` };
        }
        
        // Check for duplicates (case-insensitive)
        if (topics.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
            return { isValid: false, error: 'Topic already exists' };
        }
        
        return { isValid: true, topic: trimmed };
    }
    
    // Storage Functions
    async function loadTopics() {
        try {
            const data = await chrome.storage.local.get(['topics']);
            topics = Array.isArray(data.topics) ? data.topics : [];
            renderTopics();
            updateStats();
        } catch (error) {
            console.error('Failed to load topics:', error);
            showMessage('Failed to load topics', 'error');
        }
    }
    
    async function saveTopics() {
        try {
            await chrome.storage.local.set({ topics });
            console.log('Topics saved successfully');
        } catch (error) {
            console.error('Failed to save topics:', error);
            showMessage('Failed to save topics', 'error');
        }
    }
    
    // UI Functions
    function renderTopics() {
        elements.topicsContainer.innerHTML = '';
        
        if (topics.length === 0) {
            elements.topicsContainer.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
                    <div style="font-weight: 600; margin-bottom: 8px;">No topics added yet</div>
                    <div>Add topics manually or import from a text file</div>
                </div>
            `;
            return;
        }
        
        topics.forEach((topic, index) => {
            const card = document.createElement('div');
            card.className = 'topic-card';
            
            card.innerHTML = `
                <div class="topic-name">${escapeHtml(topic)}</div>
                <button class="remove" title="Remove topic" data-index="${index}">×</button>
            `;
            
            const removeButton = card.querySelector('.remove');
            removeButton.addEventListener('click', () => {
                removeTopic(parseInt(removeButton.dataset.index));
            });
            
            elements.topicsContainer.appendChild(card);
        });
    }
    
    function updateStats() {
        const count = topics.length;
        elements.stats.textContent = `${count} Topic${count === 1 ? '' : 's'}`;
    }
    
    // Topic Management
    async function addTopic(topicText) {
        const validation = validateTopic(topicText);
        
        if (!validation.isValid) {
            showMessage(validation.error, 'error');
            return false;
        }
        
        topics.push(validation.topic);
        await saveTopics();
        renderTopics();
        updateStats();
        showMessage(`Added: ${validation.topic}`, 'success');
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
    }
    
    // File Import Functions
    function parseTopicsFromText(text) {
        const lines = text.split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        const validTopics = [];
        const errors = [];
        
        lines.forEach((line, lineNumber) => {
            const validation = validateTopic(line);
            if (validation.isValid) {
                validTopics.push(validation.topic);
            } else if (validation.error !== 'Topic already exists') {
                errors.push(`Line ${lineNumber + 1}: ${validation.error}`);
            }
        });
        
        return { validTopics, errors };
    }
    
    async function handleFileImport(file) {
        // Validate file
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
            
            // Add valid topics
            let addedCount = 0;
            for (const topic of validTopics) {
                if (topics.length < CONFIG.MAX_TOPICS) {
                    topics.push(topic);
                    addedCount++;
                } else {
                    break;
                }
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
            } else {
                showMessage('No new topics were added from the file', 'error');
            }
            
        } catch (error) {
            console.error('File import error:', error);
            showMessage('Failed to read file', 'error');
        } finally {
            // Reset file input
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
        // Manual topic input
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
        const canAddMore = topics.length < CONFIG.MAX_TOPICS;
        elements.addButton.disabled = !hasInput || !canAddMore;
    }
    
    // Initialize
    function initialize() {
        setupEventListeners();
        loadTopics();
        updateAddButtonState();
    }
    
    // Start the application
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})();
