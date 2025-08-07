/**
 * YouTube Topic Feed Pro - Premium Chrome Content Script v7.8.1
 * Enhanced with View Count Sorting - Ultra-optimized for speed
 */

(function() {
    'use strict';
    
    // Premium configuration
    const CONFIG = {
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        MAX_VIDEOS_PER_TOPIC: 100,
        CACHE_DURATION: 15 * 60 * 1000, // 15 minutes
        GENERATION_THROTTLE: 2000,
        VIDEO_LOAD_TIMEOUT: 10000
    };
    
    // Premium logging system
    const Logger = {
        info: (message, data = null) => console.log(`[Content] ${message}`, data || ''),
        error: (message, error = null) => console.error(`[Content ERROR] ${message}`, error || ''),
        warn: (message, data = null) => console.warn(`[Content WARNING] ${message}`, data || '')
    };
    
    // Premium feed manager class
    class YouTubeTopicFeedManager {
        constructor() {
            this.currentTopics = [];
            this.isGenerating = false;
            this.lastGeneration = 0;
            this.videoCache = new Map();
            this.generationQueue = [];
            this.retryCount = 0;
            
            this.initialize();
        }
        
        async initialize() {
            try {
                Logger.info('Initializing YouTube Topic Feed Manager with View Count Sorting');
                
                // Check if we're on YouTube
                if (!this.isYouTubePage()) {
                    Logger.warn('Not on YouTube page, skipping initialization');
                    return;
                }
                
                // Setup storage listener with error handling
                this.setupStorageListener();
                
                // Load initial topics
                await this.loadTopics();
                
                // Setup page change detection
                this.setupPageChangeDetection();
                
                // Setup cleanup on page unload
                this.setupCleanup();
                
                Logger.info('Manager initialized successfully');
                
            } catch (error) {
                Logger.error('Failed to initialize manager', error);
                this.handleCriticalError(error);
            }
        }
        
        isYouTubePage() {
            return window.location.hostname.includes('youtube.com');
        }
        
        setupStorageListener() {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.onChanged.addListener((changes) => {
                        this.handleStorageChange(changes);
                    });
                }
            } catch (error) {
                Logger.error('Failed to setup storage listener', error);
            }
        }
        
        async handleStorageChange(changes) {
            try {
                if (changes.topics) {
                    const newTopics = changes.topics.newValue || [];
                    
                    // Validate topics
                    const validTopics = this.validateTopics(newTopics);
                    
                    if (JSON.stringify(validTopics) !== JSON.stringify(this.currentTopics)) {
                        this.currentTopics = validTopics;
                        Logger.info('Topics updated from storage', { count: validTopics.length });
                        
                        if (validTopics.length > 0) {
                            await this.queueFeedGeneration();
                        } else {
                            this.clearExistingFeed();
                        }
                    }
                }
            } catch (error) {
                Logger.error('Failed to handle storage change', error);
            }
        }
        
        async loadTopics() {
            try {
                const data = await this.safeStorageGet(['topics']);
                const topics = this.validateTopics(data.topics || []);
                
                this.currentTopics = topics;
                
                if (topics.length > 0) {
                    // Delay initial generation to let page load
                    setTimeout(() => this.queueFeedGeneration(), 2000);
                }
                
                Logger.info('Topics loaded from storage', { count: topics.length });
                
            } catch (error) {
                Logger.error('Failed to load topics', error);
                this.currentTopics = [];
            }
        }
        
        validateTopics(topics) {
            if (!Array.isArray(topics)) return [];
            
            return topics.filter(topic => 
                topic && 
                typeof topic === 'string' && 
                topic.trim().length >= 2 && 
                topic.trim().length <= 50
            );
        }
        
        async queueFeedGeneration() {
            // Throttle generation requests
            const now = Date.now();
            if (now - this.lastGeneration < CONFIG.GENERATION_THROTTLE) {
                Logger.info('Generation throttled, queuing request');
                
                clearTimeout(this.generationTimeout);
                this.generationTimeout = setTimeout(() => {
                    this.generateFeed();
                }, CONFIG.GENERATION_THROTTLE - (now - this.lastGeneration));
                
                return;
            }
            
            await this.generateFeed();
        }
        
        async generateFeed() {
            if (this.isGenerating) {
                Logger.warn('Feed generation already in progress');
                return;
            }
            
            try {
                this.isGenerating = true;
                this.lastGeneration = Date.now();
                
                Logger.info('Starting feed generation with view count sorting', { 
                    topics: this.currentTopics.length,
                    retryCount: this.retryCount 
                });
                
                // Clear existing feed
                this.clearExistingFeed();
                
                if (this.currentTopics.length === 0) {
                    Logger.info('No topics to process');
                    return;
                }
                
                // Show loading indicator
                this.showLoadingIndicator();
                
                // Fetch videos for all topics with view counts
                const allVideos = await this.fetchAllVideosWithViews();
                
                if (allVideos.length === 0) {
                    this.showEmptyState();
                    return;
                }
                
                // Sort by view count (already done in fetchAllVideosWithViews)
                Logger.info('Videos sorted by view count', { 
                    totalVideos: allVideos.length,
                    topVideo: allVideos[0]?.views || 'N/A'
                });
                
                // Create and inject feed
                await this.createFeedUI(allVideos);
                
                this.retryCount = 0; // Reset retry count on success
                Logger.info('Feed generation completed successfully', { 
                    videos: allVideos.length 
                });
                
            } catch (error) {
                Logger.error('Feed generation failed', error);
                await this.handleGenerationError(error);
            } finally {
                this.isGenerating = false;
                this.hideLoadingIndicator();
            }
        }
        
        async fetchAllVideosWithViews() {
            const allVideos = [];
            const fetchPromises = [];
            
            for (const topic of this.currentTopics) {
                fetchPromises.push(this.fetchVideosForTopicWithViews(topic));
            }
            
            try {
                const results = await Promise.allSettled(fetchPromises);
                
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        allVideos.push(...result.value);
                    } else {
                        Logger.warn(`Failed to fetch videos for topic ${this.currentTopics[index]}`, result.reason);
                    }
                });
                
                // Sort all videos by view count descending
                allVideos.sort((a, b) => b.views - a.views);
                
            } catch (error) {
                Logger.error('Failed to fetch videos with views', error);
            }
            
            return allVideos;
        }
        
        async fetchVideosForTopicWithViews(topic) {
            try {
                // Check cache first
                const cached = this.getCachedVideos(topic);
                if (cached) {
                    Logger.info(`Using cached videos for topic: ${topic}`);
                    return cached;
                }
                
                // Fetch fresh videos with view counts
                const videos = await this.fetchRealVideosWithViews(topic);
                
                // Cache the results
                this.cacheVideos(topic, videos);
                
                Logger.info(`Fetched ${videos.length} videos with view counts for topic: ${topic}`);
                return videos;
                
            } catch (error) {
                Logger.error(`Failed to fetch videos for topic ${topic}`, error);
                return [];
            }
        }
        
        async fetchRealVideosWithViews(topic) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Video fetch timeout'));
                }, CONFIG.VIDEO_LOAD_TIMEOUT);
                
                this.performVideoFetchWithViews(topic)
                    .then(videos => {
                        clearTimeout(timeout);
                        resolve(videos);
                    })
                    .catch(error => {
                        clearTimeout(timeout);
                        reject(error);
                    });
            });
        }
        
        async performVideoFetchWithViews(topic) {
            try {
                const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic)}`;
                
                const response = await fetch(searchUrl, {
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const html = await response.text();
                return this.parseVideoDataWithViews(html, topic);
                
            } catch (error) {
                Logger.error(`Network request failed for topic ${topic}`, error);
                throw error;
            }
        }
        
        parseVideoDataWithViews(html, topic) {
            try {
                const videos = [];
                
                // Method 1: Try to parse from ytInitialData (most reliable)
                const ytDataMatch = html.match(/var ytInitialData = (\{.*?\});/s);
                if (ytDataMatch) {
                    try {
                        const ytData = JSON.parse(ytDataMatch[1]);
                        const videosFromYtData = this.extractVideosFromYtInitialData(ytData, topic);
                        if (videosFromYtData.length > 0) {
                            Logger.info(`Parsed ${videosFromYtData.length} videos from ytInitialData for: ${topic}`);
                            return videosFromYtData.sort((a, b) => b.views - a.views);
                        }
                    } catch (e) {
                        Logger.warn('Failed to parse ytInitialData, falling back to regex', e);
                    }
                }
                
                // Method 2: Fallback to regex parsing with view count extraction
                const videoIdRegex = /"videoId":"([^"]{11})"/g;
                const matches = [...html.matchAll(videoIdRegex)];
                const uniqueIds = [...new Set(matches.map(match => match[1]))];
                
                for (const id of uniqueIds.slice(0, CONFIG.MAX_VIDEOS_PER_TOPIC)) {
                    // Skip Shorts
                    if (this.isYouTubeShort(html, id)) {
                        continue;
                    }
                    
                    const viewCount = this.extractViewCount(html, id);
                    const title = this.extractVideoTitle(html, id) || `Video from ${topic}`;
                    const channel = this.extractChannelName(html, id) || 'YouTube Channel';
                    
                    videos.push({
                        id: id,
                        topic: topic,
                        title: title,
                        channel: channel,
                        views: viewCount,
                        timestamp: Date.now()
                    });
                }
                
                // Sort by view count descending
                videos.sort((a, b) => b.views - a.views);
                
                Logger.info(`Parsed ${videos.length} videos with view counts for topic: ${topic}`);
                return videos;
                
            } catch (error) {
                Logger.error(`Failed to parse video data with views for topic ${topic}`, error);
                return [];
            }
        }
        
        extractVideosFromYtInitialData(ytData, topic) {
            const videos = [];
            
            try {
                const contents = ytData?.contents?.twoColumnSearchResultsRenderer
                    ?.primaryContents?.sectionListRenderer?.contents || [];
                
                for (const section of contents) {
                    const items = section.itemSectionRenderer?.contents || [];
                    
                    for (const item of items) {
                        const renderer = item.videoRenderer;
                        if (!renderer) continue;
                        
                        const id = renderer.videoId;
                        if (!id) continue;
                        
                        // Skip Shorts
                        if (renderer.thumbnailOverlays?.some(overlay => 
                            overlay.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS')) {
                            continue;
                        }
                        
                        const title = renderer.title?.runs?.[0]?.text || 
                                     renderer.title?.simpleText || 
                                     `Video from ${topic}`;
                        
                        const channel = renderer.ownerText?.runs?.[0]?.text || 
                                       renderer.shortBylineText?.runs?.[0]?.text || 
                                       'YouTube Channel';
                        
                        const viewCount = this.parseViewCountText(
                            renderer.viewCountText?.simpleText || 
                            renderer.shortViewCountText?.simpleText || 
                            '0 views'
                        );
                        
                        videos.push({
                            id: id,
                            topic: topic,
                            title: title,
                            channel: channel,
                            views: viewCount,
                            timestamp: Date.now()
                        });
                    }
                }
                
            } catch (error) {
                Logger.error('Error extracting from ytInitialData', error);
            }
            
            return videos;
        }
        
        extractViewCount(html, videoId) {
            try {
                // Multiple patterns to catch different view count formats
                const patterns = [
                    new RegExp(`"videoId":"${videoId}"[^}]*?"viewCountText":\\{"simpleText":"([^"]+)"`),
                    new RegExp(`"videoId":"${videoId}"[^}]*?"shortViewCountText":\\{"simpleText":"([^"]+)"`),
                    new RegExp(`"videoId":"${videoId}"[^}]*?"viewCount":"([0-9,]+)"`),
                ];
                
                for (const pattern of patterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        return this.parseViewCountText(match[1]);
                    }
                }
                
                return 0; // Default if no view count found
                
            } catch (error) {
                Logger.warn(`Failed to extract view count for video ${videoId}`, error);
                return 0;
            }
        }
        
        parseViewCountText(viewText) {
            if (!viewText || typeof viewText !== 'string') return 0;
            
            // Remove "views" and clean the string
            const cleaned = viewText.toLowerCase()
                .replace(/views?/g, '')
                .replace(/watching/g, '') // For live streams
                .trim();
            
            if (!cleaned) return 0;
            
            try {
                // Handle abbreviated numbers (1.2M, 50K, etc.)
                if (cleaned.includes('m')) {
                    const num = parseFloat(cleaned.replace(/[^\d.]/g, ''));
                    return Math.floor(num * 1000000);
                } else if (cleaned.includes('k')) {
                    const num = parseFloat(cleaned.replace(/[^\d.]/g, ''));
                    return Math.floor(num * 1000);
                } else {
                    // Handle regular numbers with commas
                    const num = cleaned.replace(/[^\d]/g, '');
                    return parseInt(num) || 0;
                }
            } catch (error) {
                Logger.warn(`Failed to parse view count text: ${viewText}`, error);
                return 0;
            }
        }
        
        isYouTubeShort(html, videoId) {
            const shortsPatterns = [
                new RegExp(`"videoId":"${videoId}"[^}]*"isShort":true`),
                new RegExp(`"videoId":"${videoId}"[^}]*"shorts"`),
                new RegExp(`"videoId":"${videoId}"[^}]*"verticalVideo":true`),
                new RegExp(`/shorts/${videoId}`)
            ];
            
            return shortsPatterns.some(pattern => pattern.test(html));
        }
        
        extractVideoTitle(html, videoId) {
            try {
                const titleRegex = new RegExp(`"videoId":"${videoId}"[^}]*?"title":\\{"runs":\\[\\{"text":"([^"]+)"`);
                const match = html.match(titleRegex);
                return match ? this.decodeHtmlEntities(match[1]) : null;
            } catch {
                return null;
            }
        }
        
        extractChannelName(html, videoId) {
            try {
                const channelRegex = new RegExp(`"videoId":"${videoId}"[^}]*?"ownerText":\\{"runs":\\[\\{"text":"([^"]+)"`);
                const match = html.match(channelRegex);
                return match ? this.decodeHtmlEntities(match[1]) : null;
            } catch {
                return null;
            }
        }
        
        decodeHtmlEntities(str) {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = str;
            return textarea.value;
        }
        
        async createFeedUI(videos) {
            try {
                const container = this.createFeedContainer();
                const header = this.createFeedHeader(videos);
                const videoGrid = this.createVideoGrid(videos);
                
                container.appendChild(header);
                container.appendChild(videoGrid);
                
                this.insertFeedIntoDOM(container);
                
                Logger.info('Feed UI created successfully with view count sorting');
                
            } catch (error) {
                Logger.error('Failed to create feed UI', error);
                throw error;
            }
        }
        
        createFeedContainer() {
            const container = document.createElement('div');
            container.id = 'topic-feed-container-pro';
            container.className = 'ytd-rich-grid-renderer';
            container.style.cssText = `
                margin: 24px 0;
                opacity: 0;
                transform: translateY(20px);
                transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            `;
            return container;
        }
        
        createFeedHeader(videos) {
            const header = document.createElement('div');
            header.className = 'ytd-rich-section-renderer';
            
            const topicsList = this.currentTopics.join(', ');
            const totalVideos = videos.length;
            const topViews = videos[0]?.views || 0;
            const topViewsFormatted = this.formatViewCount(topViews);
            
            header.innerHTML = `
                <div class="rich-grid-renderer-header" style="padding: 0 24px 16px; border-bottom: 1px solid var(--yt-spec-outline);">
                    <h2 style="font-size: 20px; font-weight: 400; margin: 0; color: var(--yt-spec-text-primary);">
                        📺 Your Topics: ${this.escapeHtml(topicsList)} (${totalVideos} videos, sorted by popularity)
                    </h2>
                    ${topViews > 0 ? `<p style="font-size: 14px; color: var(--yt-spec-text-secondary); margin: 4px 0 0 0;">Top video: ${topViewsFormatted} views</p>` : ''}
                </div>
            `;
            
            return header;
        }
        
        formatViewCount(count) {
            if (count >= 1000000) {
                return (count / 1000000).toFixed(1) + 'M';
            } else if (count >= 1000) {
                return (count / 1000).toFixed(1) + 'K';
            } else {
                return count.toLocaleString();
            }
        }
        
        createVideoGrid(videos) {
            const grid = document.createElement('div');
            grid.className = 'ytd-rich-grid-renderer';
            grid.style.cssText = `
                display: flex;
                flex-wrap: wrap;
                margin: 0 12px;
            `;
            
            videos.forEach((video, index) => {
                const card = this.createVideoCard(video, index);
                grid.appendChild(card);
            });
            
            return grid;
        }
        
        createVideoCard(video, index) {
            const card = document.createElement('div');
            card.className = 'ytd-rich-item-renderer';
            card.style.cssText = `
                flex: 0 0 25%;
                max-width: 25%;
                padding: 0 12px 40px;
                box-sizing: border-box;
                opacity: 0;
                transform: translateY(20px);
                animation: cardFadeIn 0.6s ease forwards;
                animation-delay: ${index * 0.05}s;
            `;
            
            const safeTitle = this.escapeHtml(video.title);
            const safeChannel = this.escapeHtml(video.channel);
            const viewsFormatted = this.formatViewCount(video.views);
            
            card.innerHTML = `
                <div class="ytd-rich-grid-media" style="cursor: pointer;" onclick="window.open('https://www.youtube.com/watch?v=${video.id}', '_blank')">
                    <div class="ytd-thumbnail" style="position: relative; width: 100%;">
                        <img src="https://i.ytimg.com/vi/${video.id}/hqdefault.jpg" 
                             style="width: 100%; height: auto; aspect-ratio: 16/9; object-fit: cover; border-radius: 12px; transition: border-radius 0.2s ease;"
                             onmouseover="this.style.borderRadius='4px'"
                             onmouseout="this.style.borderRadius='12px'"
                             onerror="this.onerror=null; this.src='https://via.placeholder.com/320x180/333/fff?text=Video';"
                             loading="lazy">
                        ${video.views > 0 ? `<div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.8); color: white; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-weight: 500;">${viewsFormatted} views</div>` : ''}
                    </div>
                    <div class="details" style="padding-top: 12px;">
                        <h3 style="font-size: 14px; line-height: 20px; font-weight: 500; color: var(--yt-spec-text-primary); margin: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                            ${safeTitle}
                        </h3>
                        <div style="font-size: 12px; color: var(--yt-spec-text-secondary); margin-top: 4px;">
                            ${safeChannel}
                        </div>
                    </div>
                </div>
            `;
            
            return card;
        }
        
        insertFeedIntoDOM(container) {
            try {
                const targetSelectors = [
                    '#contents.ytd-rich-grid-renderer',
                    '#primary #contents',
                    '#primary',
                    'ytd-app #content',
                    '#content'
                ];
                
                let target = null;
                for (const selector of targetSelectors) {
                    target = document.querySelector(selector);
                    if (target) break;
                }
                
                if (!target) {
                    throw new Error('No suitable insertion point found');
                }
                
                if (target.firstChild) {
                    target.insertBefore(container, target.firstChild);
                } else {
                    target.appendChild(container);
                }
                
                // Trigger animation
                requestAnimationFrame(() => {
                    container.style.opacity = '1';
                    container.style.transform = 'translateY(0)';
                });
                
                // Add animation styles
                this.addAnimationStyles();
                
            } catch (error) {
                Logger.error('Failed to insert feed into DOM', error);
                throw error;
            }
        }
        
        addAnimationStyles() {
            if (document.getElementById('topic-feed-animations')) return;
            
            const style = document.createElement('style');
            style.id = 'topic-feed-animations';
            style.textContent = `
                @keyframes cardFadeIn {
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        clearExistingFeed() {
            try {
                const existing = document.getElementById('topic-feed-container-pro');
                if (existing) {
                    existing.remove();
                    Logger.info('Existing feed cleared');
                }
            } catch (error) {
                Logger.error('Failed to clear existing feed', error);
            }
        }
        
        showLoadingIndicator() {
            this.clearExistingFeed();
            
            const loader = document.createElement('div');
            loader.id = 'topic-feed-loader-pro';
            loader.style.cssText = `
                text-align: center;
                padding: 40px;
                color: var(--yt-spec-text-secondary);
                font-size: 16px;
                margin: 24px 0;
            `;
            
            loader.innerHTML = `
                <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.3); border-top-color: var(--yt-spec-text-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px;"></div>
                <div>🎯 Generating your feed sorted by popularity...</div>
            `;
            
            this.insertElementIntoDOM(loader);
        }
        
        hideLoadingIndicator() {
            const loader = document.getElementById('topic-feed-loader-pro');
            if (loader) loader.remove();
        }
        
        showEmptyState() {
            const emptyState = document.createElement('div');
            emptyState.id = 'topic-feed-empty-pro';
            emptyState.style.cssText = `
                text-align: center;
                padding: 60px 20px;
                color: var(--yt-spec-text-secondary);
                font-size: 16px;
                margin: 24px 0;
            `;
            
            emptyState.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                <h3 style="color: var(--yt-spec-text-primary); margin-bottom: 8px;">No videos found</h3>
                <p>Try different topics or check your connection.</p>
            `;
            
            this.insertElementIntoDOM(emptyState);
        }
        
        insertElementIntoDOM(element) {
            try {
                const target = document.querySelector('#contents') || document.querySelector('#primary') || document.body;
                target.insertBefore(element, target.firstChild);
            } catch (error) {
                Logger.error('Failed to insert element into DOM', error);
            }
        }
        
        async handleGenerationError(error) {
            if (this.retryCount < CONFIG.MAX_RETRIES) {
                this.retryCount++;
                Logger.warn(`Retrying feed generation (attempt ${this.retryCount}/${CONFIG.MAX_RETRIES})`);
                
                setTimeout(() => {
                    this.generateFeed();
                }, CONFIG.RETRY_DELAY * this.retryCount);
            } else {
                Logger.error('Max retries reached, showing error state');
                this.showErrorState(error);
            }
        }
        
        showErrorState(error) {
            const errorState = document.createElement('div');
            errorState.id = 'topic-feed-error-pro';
            errorState.style.cssText = `
                text-align: center;
                padding: 40px 20px;
                color: #ef4444;
                font-size: 16px;
                margin: 24px 0;
                border: 1px solid rgba(239, 68, 68, 0.2);
                border-radius: 8px;
                background: rgba(239, 68, 68, 0.05);
            `;
            
            errorState.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <h3 style="margin-bottom: 8px;">Feed Generation Failed</h3>
                <p style="margin-bottom: 16px;">${this.escapeHtml(error.message || 'Please try again later.')}</p>
                <button onclick="location.reload()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Refresh Page
                </button>
            `;
            
            this.insertElementIntoDOM(errorState);
        }
        
        handleCriticalError(error) {
            Logger.error('Critical error in extension', error);
            
            // Try to show minimal error message
            try {
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #ef4444;
                    color: white;
                    padding: 16px;
                    border-radius: 8px;
                    z-index: 10000;
                    font-size: 14px;
                    max-width: 300px;
                `;
                errorDiv.textContent = 'YouTube Topic Feed extension encountered an error. Please refresh the page.';
                document.body.appendChild(errorDiv);
                
                setTimeout(() => errorDiv.remove(), 10000);
            } catch (displayError) {
                Logger.error('Failed to display critical error', displayError);
            }
        }
        
        setupPageChangeDetection() {
            try {
                // Monitor URL changes for SPA navigation
                let lastUrl = location.href;
                new MutationObserver(() => {
                    const url = location.href;
                    if (url !== lastUrl) {
                        lastUrl = url;
                        Logger.info('Page navigation detected');
                        
                        if (this.currentTopics.length > 0) {
                            setTimeout(() => this.queueFeedGeneration(), 1000);
                        }
                    }
                }).observe(document, { subtree: true, childList: true });
                
            } catch (error) {
                Logger.error('Failed to setup page change detection', error);
            }
        }
        
        setupCleanup() {
            try {
                window.addEventListener('beforeunload', () => {
                    this.cleanup();
                });
            } catch (error) {
                Logger.error('Failed to setup cleanup', error);
            }
        }
        
        cleanup() {
            try {
                // Clear timeouts
                if (this.generationTimeout) {
                    clearTimeout(this.generationTimeout);
                }
                
                // Clear cache
                this.videoCache.clear();
                
                Logger.info('Extension cleanup completed');
            } catch (error) {
                Logger.error('Cleanup failed', error);
            }
        }
        
        // Cache management
        getCachedVideos(topic) {
            const cached = this.videoCache.get(topic);
            if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_DURATION) {
                return cached.videos;
            }
            return null;
        }
        
        cacheVideos(topic, videos) {
            this.videoCache.set(topic, {
                videos,
                timestamp: Date.now()
            });
        }
        
        // Utility methods
        async safeStorageGet(keys) {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    return await chrome.storage.local.get(keys);
                }
                return {};
            } catch (error) {
                Logger.error('Storage get failed', error);
                return {};
            }
        }
        
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }
    
    // Premium initialization with comprehensive error handling
    const initializeContentScript = () => {
        try {
            // Ensure we're in the right context
            if (typeof window === 'undefined' || typeof document === 'undefined') {
                throw new Error('Invalid execution context');
            }
            
            // Check for required APIs
            if (typeof chrome === 'undefined' || !chrome.storage) {
                throw new Error('Chrome extension APIs not available');
            }
            
            // Initialize feed manager
            window.topicFeedManager = new YouTubeTopicFeedManager();
            
            Logger.info('Content script with view count sorting initialized successfully');
            
        } catch (error) {
            Logger.error('Failed to initialize content script', error);
        }
    };
    
    // Premium document ready handler
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeContentScript);
    } else {
        initializeContentScript();
    }
    
    // Add global error handler
    window.addEventListener('error', (e) => {
        Logger.error('Global content script error', {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno
        });
    });
    
    window.addEventListener('unhandledrejection', (e) => {
        Logger.error('Unhandled promise rejection in content script', e.reason);
    });
    
})();
