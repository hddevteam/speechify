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
            this.updateContent();
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
            } else {
                // We're on the correct page, just update content and buttons
                this.currentLang = lang;
                this.updateContent();
                this.updateLanguageButtons();
            }
        },

        updateLanguageButtons() {
            const langButtons = document.querySelectorAll('.lang-btn, .lang-toggle');
            langButtons.forEach(btn => {
                const buttonLang = btn.dataset.lang;
                if (buttonLang === this.currentLang) {
                    btn.classList.add('active');
                    // Apply active styling
                    btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    btn.style.color = 'white';
                    btn.style.transform = 'scale(1.05)';
                } else {
                    btn.classList.remove('active');
                    // Reset styling
                    btn.style.background = 'transparent';
                    btn.style.color = '#666';
                    btn.style.transform = 'scale(1)';
                }
            });
        },
        
        updateContent() {
            const content = this.getContent(this.currentLang);
            this.applyContent(content);
        },
        
        getContent(lang) {
            const content = {
                'en': {
                    title: 'Speechify - VS Code Text-to-Speech Extension',
                    tagline: 'Transform your text into high-quality speech with Azure Speech Services',
                    description: 'Speechify brings powerful text-to-speech capabilities directly to VS Code. Convert selected text or entire documents into natural-sounding audio with 200+ voices in 60+ languages.',
                    installBtn: 'Install from Marketplace',
                    learnMoreBtn: 'Learn More',
                    featuresTitle: 'Powerful Features',
                    features: {
                        voices: {
                            title: 'Azure Speech Services',
                            description: 'Access 200+ high-quality voices in 60+ languages with advanced neural speech synthesis.'
                        },
                        customization: {
                            title: 'Voice Customization',
                            description: 'Choose speaking styles, adjust speed, and select roleplay characters for enhanced speech output.'
                        },
                        integration: {
                            title: 'VS Code Integration',
                            description: 'Seamlessly convert selected text or entire documents with simple keyboard shortcuts.'
                        },
                        multilingual: {
                            title: 'Multi-language Support',
                            description: 'Full interface localization in English and Chinese with extensible i18n architecture.'
                        },
                        realtime: {
                            title: 'Real-time Processing',
                            description: 'Live progress feedback and intelligent chunking for large document processing.'
                        },
                        management: {
                            title: 'Smart Audio Management',
                            description: 'Automatic file naming, format selection, and organized audio output handling.'
                        }
                    },
                    demoTitle: 'See Speechify in Action',
                    installTitle: 'Quick Installation',
                    installSteps: {
                        marketplace: {
                            title: 'Install from VS Code Marketplace',
                            description: 'Search for "Speechify" in VS Code Extensions or click the install button above.'
                        },
                        configure: {
                            title: 'Configure Azure Speech Services',
                            description: 'Set up your Azure Speech Services subscription key and region in VS Code settings.'
                        },
                        use: {
                            title: 'Start Converting Text',
                            description: 'Select text and use Ctrl+Shift+P → "Speechify: Convert to Speech" to begin.'
                        }
                    },
                    footerLinks: {
                        github: 'GitHub Repository',
                        marketplace: 'VS Code Marketplace',
                        documentation: 'Documentation',
                        support: 'Support',
                        license: 'MIT License'
                    },
                    copyright: '© 2024 Speechify Extension. All rights reserved.'
                },
                'zh-cn': {
                    title: 'Speechify - VS Code 文本转语音扩展',
                    tagline: '使用 Azure 语音服务将您的文本转换为高质量语音',
                    description: 'Speechify 为 VS Code 带来强大的文本转语音功能。将选定文本或整个文档转换为自然流畅的音频，支持60多种语言的200多个语音。',
                    installBtn: '从市场安装',
                    learnMoreBtn: '了解更多',
                    featuresTitle: '强大功能',
                    features: {
                        voices: {
                            title: 'Azure 语音服务',
                            description: '访问60多种语言的200多个高质量语音，支持先进的神经语音合成技术。'
                        },
                        customization: {
                            title: '语音定制',
                            description: '选择说话风格、调整语速，并为增强语音输出选择角色扮演字符。'
                        },
                        integration: {
                            title: 'VS Code 集成',
                            description: '通过简单的键盘快捷键无缝转换选定文本或整个文档。'
                        },
                        multilingual: {
                            title: '多语言支持',
                            description: '英文和中文界面完全本地化，具有可扩展的国际化架构。'
                        },
                        realtime: {
                            title: '实时处理',
                            description: '实时进度反馈和大文档处理的智能分块功能。'
                        },
                        management: {
                            title: '智能音频管理',
                            description: '自动文件命名、格式选择和有序的音频输出处理。'
                        }
                    },
                    demoTitle: '观看 Speechify 演示',
                    installTitle: '快速安装',
                    installSteps: {
                        marketplace: {
                            title: '从 VS Code 市场安装',
                            description: '在 VS Code 扩展中搜索 "Speechify" 或点击上方安装按钮。'
                        },
                        configure: {
                            title: '配置 Azure 语音服务',
                            description: '在 VS Code 设置中设置您的 Azure 语音服务订阅密钥和区域。'
                        },
                        use: {
                            title: '开始转换文本',
                            description: '选择文本并使用 Ctrl+Shift+P → "Speechify: Convert to Speech" 开始转换。'
                        }
                    },
                    footerLinks: {
                        github: 'GitHub 仓库',
                        marketplace: 'VS Code 市场',
                        documentation: '文档',
                        support: '支持',
                        license: 'MIT 许可证'
                    },
                    copyright: '© 2024 Speechify 扩展。保留所有权利。'
                }
            };
            
            return content[lang] || content['en'];
        },
        
        applyContent(content) {
            // Update page title
            document.title = content.title;
            
            // Update hero section
            const heroTitle = document.querySelector('.hero h1');
            const heroTagline = document.querySelector('.hero .tagline');
            const heroDescription = document.querySelector('.hero .description');
            const installBtn = document.querySelector('.btn-primary');
            const learnMoreBtn = document.querySelector('.btn-secondary');
            
            if (heroTitle) heroTitle.textContent = content.title.replace('Speechify - ', '');
            if (heroTagline) heroTagline.textContent = content.tagline;
            if (heroDescription) heroDescription.textContent = content.description;
            if (installBtn) installBtn.textContent = content.installBtn;
            if (learnMoreBtn) learnMoreBtn.textContent = content.learnMoreBtn;
            
            // Update features section
            const featuresTitle = document.querySelector('.features h2');
            if (featuresTitle) featuresTitle.textContent = content.featuresTitle;
            
            // Update feature cards
            Object.keys(content.features).forEach((key, index) => {
                const card = document.querySelectorAll('.feature-card')[index];
                if (card) {
                    const title = card.querySelector('h3');
                    const desc = card.querySelector('p');
                    if (title) title.textContent = content.features[key].title;
                    if (desc) desc.textContent = content.features[key].description;
                }
            });
            
            // Update demo section
            const demoTitle = document.querySelector('.demo h2');
            if (demoTitle) demoTitle.textContent = content.demoTitle;
            
            // Update installation section
            const installTitle = document.querySelector('.installation h2');
            if (installTitle) installTitle.textContent = content.installTitle;
            
            // Update installation steps
            Object.keys(content.installSteps).forEach((key, index) => {
                const step = document.querySelectorAll('.install-step')[index];
                if (step) {
                    const title = step.querySelector('h3');
                    const desc = step.querySelector('p');
                    if (title) title.textContent = content.installSteps[key].title;
                    if (desc) desc.textContent = content.installSteps[key].description;
                }
            });
            
            // Update footer
            const footerLinks = document.querySelectorAll('.footer-link');
            const linkKeys = Object.keys(content.footerLinks);
            footerLinks.forEach((link, index) => {
                if (linkKeys[index]) {
                    link.textContent = content.footerLinks[linkKeys[index]];
                }
            });
            
            const copyright = document.querySelector('.footer-bottom p');
            if (copyright) copyright.textContent = content.copyright;
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
                background: rgba(239, 68, 68, 0.9);
                color: white;
                padding: 1rem;
                border-radius: 8px;
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
