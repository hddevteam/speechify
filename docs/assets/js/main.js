// Speechify Extension Landing Page JavaScript
// Modern functionality for language switching, animations, and interactions

(function() {
    'use strict';

    // Language Management
    const LanguageManager = {
        currentLang: 'en',
        
        init() {
            this.detectLanguage();
            this.setupLanguageSwitcher();
            this.updateLanguageButtons();
        },
        
        detectLanguage() {
            // First, detect current page
            const currentPage = window.location.pathname;
            if (currentPage.includes('zh-cn.html')) {
                this.currentLang = 'zh-cn';
                return;
            }
            
            // Check URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const urlLang = urlParams.get('lang');
            
            if (urlLang && this.isValidLanguage(urlLang)) {
                this.currentLang = urlLang;
                return;
            }
            
            // Check localStorage
            const savedLang = localStorage.getItem('speechify-lang');
            if (savedLang && this.isValidLanguage(savedLang)) {
                this.currentLang = savedLang;
                return;
            }
            
            // Detect browser language
            const browserLang = navigator.language || navigator.userLanguage;
            if (browserLang.startsWith('zh')) {
                this.currentLang = 'zh-cn';
            } else {
                this.currentLang = 'en';
            }
        },
        
        isValidLanguage(lang) {
            return ['en', 'zh-cn'].includes(lang);
        },
        
        setupLanguageSwitcher() {
            const langButtons = document.querySelectorAll('.lang-btn, .lang-toggle');
            langButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const lang = btn.dataset.lang;
                    if (lang) {
                        this.switchLanguage(lang);
                    }
                });
            });
            
            // Update active state based on current page
            this.updateLanguageButtons();
        },
        
        switchLanguage(lang) {
            if (!this.isValidLanguage(lang)) return;
            
            // Save preference
            localStorage.setItem('speechify-lang', lang);
            
            // For GitHub Pages, we need to navigate to different pages
            const currentPage = window.location.pathname;
            const isCurrentlyZhPage = currentPage.includes('zh-cn.html');
            
            if (lang === 'zh-cn' && !isCurrentlyZhPage) {
                // Switch to Chinese page
                window.location.href = './zh-cn.html';
            } else if (lang === 'en' && isCurrentlyZhPage) {
                // Switch to English page
                window.location.href = './index.html';
            }
            // Remove dynamic content update since we use separate HTML files
        },

        updateLanguageButtons() {
            const langButtons = document.querySelectorAll('.lang-btn, .lang-toggle');
            langButtons.forEach(btn => {
                const buttonLang = btn.dataset.lang;
                if (buttonLang === this.currentLang) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    };

    // Animation Manager
    const AnimationManager = {
        init() {
            this.setupScrollAnimations();
            this.setupInteractiveElements();
        },
        
        setupScrollAnimations() {
            const observerOptions = {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            };
            
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('fade-in-up');
                    }
                });
            }, observerOptions);
            
            // Observe elements for animation
            const animatableElements = document.querySelectorAll('.feature-card, .install-step, .demo-video');
            animatableElements.forEach(el => observer.observe(el));
        },
        
        setupInteractiveElements() {
            // Smooth scrolling for anchor links
            document.querySelectorAll('a[href^="#"]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const target = document.querySelector(link.getAttribute('href'));
                    if (target) {
                        target.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                });
            });
            
            // Button hover effects
            document.querySelectorAll('.btn').forEach(btn => {
                btn.addEventListener('mouseenter', () => {
                    btn.style.transform = 'translateY(-2px)';
                });
                
                btn.addEventListener('mouseleave', () => {
                    btn.style.transform = 'translateY(0)';
                });
            });
        }
    };

    // Theme Manager
    const ThemeManager = {
        init() {
            this.detectTheme();
            this.setupThemeWatcher();
        },
        
        detectTheme() {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.body.classList.toggle('dark-theme', isDark);
        },
        
        setupThemeWatcher() {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                document.body.classList.toggle('dark-theme', e.matches);
            });
        }
    };

    // Utility Functions
    const Utils = {
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },
        
        throttle(func, limit) {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        }
    };

    // Performance optimization for scroll events
    const optimizedScrollHandler = Utils.throttle(() => {
        // Add any scroll-based functionality here
    }, 100);
    
    window.addEventListener('scroll', optimizedScrollHandler);

    // Audio Demo Manager for multilingual playback
    const AudioDemoManager = {
        currentAudio: null,
        currentButton: null,
        audioCache: new Map(),
        isInitialized: false,

        init() {
            if (this.isInitialized) return;
            
            // Look for new audio play buttons
            const playButtons = document.querySelectorAll('.audio-play-btn');
            playButtons.forEach(button => {
                button.addEventListener('click', (e) => this.handlePlay(e));
            });
            
            // Also support legacy buttons
            const legacyButtons = document.querySelectorAll('.play-btn');
            legacyButtons.forEach(button => {
                button.addEventListener('click', (e) => this.handlePlay(e));
            });
            
            this.isInitialized = true;
            console.log('AudioDemoManager initialized with', playButtons.length + legacyButtons.length, 'buttons');
        },

        async handlePlay(event) {
            const button = event.currentTarget;
            const lang = button.dataset.audio || button.dataset.lang; // Support both data-audio and data-lang
            const label = this.getLanguageLabel(lang);
            
            // Stop current audio if playing
            if (this.currentAudio && !this.currentAudio.paused) {
                this.stopCurrentAudio();
            }
            
            // If clicking the same button, just stop
            if (this.currentButton === button) {
                this.currentButton = null;
                return;
            }
            
            try {
                await this.playAudio(lang, label, button);
            } catch (error) {
                console.error('Error playing audio:', error);
                this.showError(`Failed to play ${label} audio. Please try again.`);
            }
        },

        getLanguageLabel(lang) {
            const labels = {
                'en': 'English',
                'zh': '中文',
                'es': 'Español', 
                'fr': 'Français',
                'ja': '日本語'
            };
            return labels[lang] || lang.toUpperCase();
        },

        async playAudio(lang, label, button) {
            this.updateStatus(label, false);
            
            try {
                // Get or create audio element
                let audio = this.audioCache.get(lang);
                if (!audio) {
                    audio = new Audio(`./assets/audio/demo-${lang}.mp3`);
                    audio.preload = 'metadata';
                    this.audioCache.set(lang, audio);
                    
                    // Add event listeners
                    audio.addEventListener('ended', () => this.onAudioEnd());
                    audio.addEventListener('error', (e) => this.onAudioError(e, label));
                }
                
                // Play audio
                await audio.play();
                
                // Update UI
                this.currentAudio = audio;
                this.currentButton = button;
                this.setButtonPlaying(button, true);
                this.updateStatus(label, true);
                
            } catch (error) {
                console.error(`Failed to play ${label} audio:`, error);
                this.showError(`Could not play ${label} audio. Please check your browser settings.`);
                throw error;
            }
        },

        stopCurrentAudio() {
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
            }
            
            if (this.currentButton) {
                this.setButtonPlaying(this.currentButton, false);
            }
            
            this.currentAudio = null;
            this.currentButton = null;
            this.updateStatus('', false);
        },

        onAudioEnd() {
            if (this.currentButton) {
                this.setButtonPlaying(this.currentButton, false);
            }
            this.currentAudio = null;
            this.currentButton = null;
            this.updateStatus('', false);
        },

        onAudioError(error, label) {
            console.error(`Audio error for ${label}:`, error);
            this.showError(`Failed to load ${label} audio file.`);
            this.stopCurrentAudio();
        },

        setButtonPlaying(button, playing) {
            const icon = button.querySelector('i');
            if (playing) {
                button.classList.add('playing');
                if (icon) icon.className = 'fas fa-pause';
            } else {
                button.classList.remove('playing');
                if (icon) icon.className = 'fas fa-play';
            }
        },

        updateStatus(language, isPlaying) {
            // Update new status display
            const statusElement = document.querySelector('.currently-playing');
            const langSpan = document.querySelector('.playing-lang');
            
            if (statusElement && langSpan) {
                if (isPlaying && language) {
                    langSpan.textContent = language;
                    statusElement.classList.remove('hidden');
                } else {
                    statusElement.classList.add('hidden');
                }
            }

            // Also update legacy status elements
            const legacyStatusElements = document.querySelectorAll('.status-text');
            legacyStatusElements.forEach(element => {
                if (isPlaying && language) {
                    element.textContent = `Now playing: ${language}`;
                } else {
                    element.textContent = 'Click to hear Speechify in action!';
                }
            });
        },

        showError(message) {
            // Create temporary error message
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(29, 53, 87, 0.95);
                color: white;
                padding: 1rem;
                border-left: 4px solid var(--accent-gold);
                z-index: 1000;
                font-size: 0.9rem;
                max-width: 300px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            `;
            errorDiv.textContent = message;
            document.body.appendChild(errorDiv);

            // Remove error message after 5 seconds
            setTimeout(() => {
                if (errorDiv.parentNode) {
                    errorDiv.parentNode.removeChild(errorDiv);
                }
            }, 5000);
        }
    };

    // Initialize everything when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        LanguageManager.init();
        AnimationManager.init();
        ThemeManager.init();
        AudioDemoManager.init();
        
        // Add loading complete class for CSS transitions
        document.body.classList.add('loaded');
    });

    // Handle page visibility changes for performance
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Pause non-essential animations when page is not visible
            document.body.classList.add('paused');
            // Stop audio when page becomes hidden
            if (AudioDemoManager.currentAudio) {
                AudioDemoManager.stopCurrentAudio();
            }
        } else {
            document.body.classList.remove('paused');
        }
    });

    // Export for external use if needed
    window.SpeechifyLanding = {
        LanguageManager,
        AnimationManager,
        ThemeManager,
        AudioDemoManager,
        Utils
    };

})();
