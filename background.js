// YouTube Topic Feed Extension - Service Worker v7.7.0
// Fixed for Manifest V3 compatibility

chrome.runtime.onInstalled.addListener((details) => {
    console.log('YouTube Topic Feed Extension installed');
    
    // Initialize storage with empty topics array
    chrome.storage.local.set({ topics: [] });
    
    // Optional: Log installation reason
    if (details.reason === 'install') {
        console.log('Extension installed for the first time');
    } else if (details.reason === 'update') {
        console.log('Extension updated to version:', chrome.runtime.getManifest().version);
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('YouTube Topic Feed Extension started');
});

// Optional: Handle messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'getVersion') {
        sendResponse({ version: chrome.runtime.getManifest().version });
    }
    
    // Return true to indicate async response (good practice)
    return true;
});
