/**
 * YouTube Topic Feed Pro - Enhanced Content Script v7.8.2
 * Fixed: Video player overlay and reload issues
 */

(function() {
    'use strict';
    
    // Premium configuration
    const CONFIG = {
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        MAX_VIDEOS_PER_TOPIC: 100,
        CACHE_DURATION: 15 * 60 * 1000,
        GENERATION_THROTTLE: 3000, // Increased for stability
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
            this.retryCount = 0;
            this.currentUrl = '';
            
            this.initialize();
        }
        
        async initialize() {
            try {
                Logger.info('Initializing YouTube Topic Feed Manager v7.8.2');
                
                if (!this.isYouTubePage()) {
                    Logger.warn('Not on YouTube page, skipping initialization');
                    return;
                }
                
                // Store initial URL
                this.currentUrl = location.href;
                
                this.setupStorageListener();
                await this.loadTopics();
                this.setupPageChangeDetection();
                this.setupCleanup();
                
                Logger.info('Manager initialized successfully');
                
            } catch (error) {
                Logger.error('Failed to initialize manager', error);
            }
        }
        
        isYouTubePage() {
            return window.location.hostname.includes('youtube.com');
        }
        
        // NEW: Enhanced page type detection
        isVideoPage() {
            return window.location.pathname === '/watch' && window.location.search.includes('v=');
        }
        
        isHomePage() {
            return window.location.pathname === '/' || window.location.pathname === '/feed/subscriptions';
        }
        
        isSearchPage() {
            return window.location.pathname === '/results';
        }
        
        isChannelPage() {
            return window.location.pathname.startsWith('/@') || window.location.pathname.startsWith('/channel/') || window.location.pathname.startsWith('/c/');
        }
        
        shouldShowFeed() {
            // Only show feed on home, search, and channel pages - NOT on video pages
            return this.isHomePage() || this.isSearchPage() || this.isChannelPage();
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
                    const validTopics = this.validateTopics(newTopics);
                    
                    if (JSON.stringify(validTopics) !== JSON.stringify(this.currentTopics)) {
                        this.currentTopics = validTopics;
                        Logger.info('Topics updated from storage', { count: validTopics.length });
                        
                        // Only generate feed if we're on appropriate pages
                        if (validTopics.length > 0 && this.shouldShowFeed()) {
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
                
                if (topics.length > 0 && this.shouldShowFeed()) {
                    setTimeout(() => this.queueFeedGeneration(), 2000);
                }
                
                Logger.info('Topics loaded from storage', { 
                    count: topics.length, 
                    shouldShow: this.shouldShowFeed(),
                    pageType: this.getPageType()
                });
                
            } catch (error) {
                Logger.error('Failed to load topics', error);
                this.currentTopics = [];
            }
        }
        
        getPageType() {
            if (this.isVideoPage()) return 'video';
            if (this.isHomePage()) return 'home';
            if (this.isSearchPage()) return 'search';
            if (this.isChannelPage()) return 'channel';
            return 'other';
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
            // Enhanced checks before generation
            if (!this.shouldShowFeed()) {
                Logger.info('Skipping feed generation - not on appropriate page', {
                    currentPage: this.getPageType(),
                    url: location.href
                });
                this.clearExistingFeed();
                return;
            }
            
            const now = Date.now();
            if (now - this.lastGeneration < CONFIG.GENERATION_THROTTLE) {
                Logger.info('Generation throttled, queuing request');
                
                clearTimeout(this.generationTimeout);
                this.generationTimeout = setTimeout(() => {
                    if (this.shouldShowFeed()) { // Double-check before execution
                        this.generateFeed();
                    }
                }, CONFIG.GENERATION_THROTTLE - (now - this.lastGeneration));
                
                return;
            }
            
            await this.generateFeed();
        }
        
        async generateFeed() {
            if (this.isGenerating || !this.shouldShowFeed()) {
                Logger.warn('Feed generation skipped', { 
                    isGenerating: this.isGenerating, 
                    shouldShow: this.shouldShowFeed() 
                });
                return;
            }
            
            try {
                this.isGenerating = true;
                this.lastGeneration = Date.now();
                
                Logger.info('Starting feed generation with enhanced page detection', { 
                    topics: this.currentTopics.length,
                    pageType: this.getPageType(),
                    retryCount: this.retryCount 
                });
                
                this.clearExistingFeed();
                
                if (this.currentTopics.length === 0) {
                    Logger.info('No topics to process');
                    return;
                }
                
                this.showLoadingIndicator();
                
                const allVideos = await this.fetchAllVideosWithViews();
                
                if (allVideos.length === 0) {
                    this.showEmptyState();
                    return;
                }
                
                await this.createFeedUI(allVideos);
                
                this.retryCount = 0;
                Logger.info('Feed generation completed successfully', { 
                    videos: allVideos.length,
                    pageType: this.getPageType()
                });
                
            } catch (error) {
                Logger.error('Feed generation failed', error);
                await this.handleGenerationError(error);
            } finally {
                this.isGenerating = false;
                this.hideLoadingIndicator();
            }
        }
        
        // Enhanced page change detection with better filtering
        setupPageChangeDetection() {
            try {
                let lastUrl = location.href;
                let lastPathname = location.pathname;
                
                const observer = new MutationObserver(() => {
                    const currentUrl = location.href;
                    const currentPathname = location.pathname;
                    
                    if (currentUrl !== lastUrl || currentPathname !== lastPathname) {
                        const wasVideoPage = lastPathname === '/watch';
                        const isVideoPage = this.isVideoPage();
                        const wasOtherPage = !wasVideoPage;
                        const isOtherPage = !isVideoPage;
                        
                        Logger.info('Page navigation detected', {
                            from: lastPathname,
                            to: currentPathname,
                            wasVideo: wasVideoPage,
                            isVideo: isVideoPage
                        });
                        
                        lastUrl = currentUrl;
                        lastPathname = currentPathname;
                        
                        // Clear feed immediately when navigating TO video pages
                        if (isVideoPage) {
                            Logger.info('Navigated to video page - clearing feed');
                            this.clearExistingFeed();
                            return;
                        }
                        
                        // Generate feed when navigating FROM video pages to other pages
                        if (wasVideoPage && isOtherPage && this.currentTopics.length > 0) {
                            Logger.info('Navigated from video to feed page - generating feed');
                            setTimeout(() => {
                                if (this.shouldShowFeed()) {
                                    this.queueFeedGeneration();
                                }
                            }, 1000);
                        }
                        
                        // Handle other page transitions
                        if (wasOtherPage && isOtherPage && this.currentTopics.length > 0) {
                            setTimeout(() => {
                                if (this.shouldShowFeed()) {
                                    this.queueFeedGeneration();
                                }
                            }, 1000);
                        }
                    }
                });
                
                observer.observe(document, { subtree: true, childList: true });
                
                // Also listen to popstate for browser back/forward
                window.addEventListener('popstate', () => {
                    setTimeout(() => {
                        if (this.isVideoPage()) {
                            this.clearExistingFeed();
                        } else if (this.shouldShowFeed() && this.currentTopics.length > 0) {
                            this.queueFeedGeneration();
                        }
                    }, 500);
                });
                
            } catch (error) {
                Logger.error('Failed to setup page change detection', error);
            }
        }
        
        // Enhanced DOM insertion with better targeting
        insertFeedIntoDOM(container) {
            try {
                // More specific selectors to avoid video player areas
                const targetSelectors = [
                    '#contents.ytd-rich-grid-renderer', // Home/search grid
                    'ytd-browse[page-subtype="home"] #contents', // Home page
                    'ytd-search #contents', // Search results
                    'ytd-browse[page-subtype="channels"] #contents', // Channel page
                    '#primary #contents', // Fallback
                    '#contents' // Last resort
                ];
                
                let target = null;
                for (const selector of targetSelectors) {
                    target = document.querySelector(selector);
                    if (target && this.isValidInsertionTarget(target)) {
                        break;
                    }
                }
                
                if (!target) {
                    throw new Error('No suitable insertion point found');
                }
                
                // Additional safety check
                if (this.isVideoPage()) {
                    Logger.warn('Attempted to insert feed on video page - aborting');
                    return;
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
                
                this.addAnimationStyles();
                
                Logger.info('Feed inserted successfully', { 
                    targetSelector: target.tagName + (target.id ? '#' + target.id : ''),
                    pageType: this.getPageType()
                });
                
            } catch (error) {
                Logger.error('Failed to insert feed into DOM', error);
                throw error;
            }
        }
        
        isValidInsertionTarget(element) {
            // Avoid inserting near video player elements
            const videoPlayerSelectors = [
                'ytd-watch-flexy',
                'ytd-player',
                '#movie_player',
                '.html5-video-player'
            ];
            
            for (const selector of videoPlayerSelectors) {
                if (element.closest(selector) || element.querySelector(selector)) {
                    return false;
                }
            }
            
            return true;
        }
        
        clearExistingFeed() {
            try {
                const existing = document.getElementById('topic-feed-container-pro');
                if (existing) {
                    existing.remove();
                    Logger.info('Existing feed cleared');
                }
                
                // Also clear loading and error states
                const loader = document.getElementById('topic-feed-loader-pro');
                const error = document.getElementById('topic-feed-error-pro');
                const empty = document.getElementById('topic-feed-empty-pro');
                
                [loader, error, empty].forEach(element => {
                    if (element) element.remove();
                });
                
            } catch (error) {
                Logger.error('Failed to clear existing feed', error);
            }
        }
        
        // Rest of the methods remain the same as v7.8.1
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
                
                allVideos.sort((a, b) => b.views - a.views);
                
            } catch (error) {
                Logger.error('Failed to fetch videos with views', error);
            }
            
            return allVideos;
        }
        
        async fetchVideosForTopicWithViews(topic) {
            try {
                const cached = this.getCachedVideos(topic);
                if (cached) {
                    Logger.info(`Using cached videos for topic: ${topic}`);
                    return cached;
                }
                
                const videos = await this.fetchRealVideosWithViews(topic);
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
                
                const videoIdRegex = /"videoId":"([^"]{11})"/g;
                const matches = [...html.matchAll(videoIdRegex)];
                const uniqueIds = [...new Set(matches.map(match => match[1]))];
                
                for (const id of uniqueIds.slice(0, CONFIG.MAX_VIDEOS_PER_TOPIC)) {
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
                
                return 0;
                
            } catch (error) {
                Logger.warn(`Failed to extract view count for video ${videoId}`, error);
                return 0;
            }
        }
        
        parseViewCountText(viewText) {
            if (!viewText || typeof viewText !== 'string') return 0;
            
            const cleaned = viewText.toLowerCase()
                .replace(/views?/g, '')
                .replace(/watching/g, '')
                .trim();
            
            if (!cleaned) return 0;
            
            try {
                if (cleaned.includes('m')) {
                    const num = parseFloat(cleaned.replace(/[^\d.]/g, ''));
                    return Math.floor(num * 1000000);
                } else if (cleaned.includes('k')) {
                    const num = parseFloat(cleaned.replace(/[^\d.]/g, ''));
                    return Math.floor(num * 1000);
                } else {
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
        
        showLoadingIndicator() {
            if (!this.shouldShowFeed()) return;
            
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
            if (!this.shouldShowFeed()) return;
            
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
                if (!this.shouldShowFeed()) return;
                
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
                    if (this.shouldShowFeed()) {
                        this.generateFeed();
                    }
                }, CONFIG.RETRY_DELAY * this.retryCount);
            } else {
                Logger.error('Max retries reached, showing error state');
                this.showErrorState(error);
            }
        }
        
        showErrorState(error) {
            if (!this.shouldShowFeed()) return;
            
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
                if (this.generationTimeout) {
                    clearTimeout(this.generationTimeout);
                }
                
                this.videoCache.clear();
                
                Logger.info('Extension cleanup completed');
            } catch (error) {
                Logger.error('Cleanup failed', error);
            }
        }
        
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
    
    // Enhanced initialization
    const initializeContentScript = () => {
        try {
            if (typeof window === 'undefined' || typeof document === 'undefined') {
                throw new Error('Invalid execution context');
            }
            
            if (typeof chrome === 'undefined' || !chrome.storage) {
                throw new Error('Chrome extension APIs not available');
            }
            
            window.topicFeedManager = new YouTubeTopicFeedManager();
            
            Logger.info('Enhanced content script v7.8.2 initialized successfully');
            
        } catch (error) {
            Logger.error('Failed to initialize content script', error);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeContentScript);
    } else {
        initializeContentScript();
    }
    
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
