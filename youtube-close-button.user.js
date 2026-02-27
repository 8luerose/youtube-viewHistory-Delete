// ==UserScript==
// @name         YouTube 1-Click Delete Button
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  YouTube 시청 기록/쇼츠에서 영상을 1클릭으로 삭제하는 휴지통 버튼 추가
// @author       You
// @match        *://www.youtube.com/*
// @match        *://youtube.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    // ========================================
    // 설정
    // ========================================
    const CONFIG = {
        // 삭제 메뉴 텍스트 (다국어 지원)
        deleteTexts: [
            '시청 기록에서 삭제',
            'Remove from Watch history',
            'Remove from watch history',
            'watch history에서 삭제',
            'Verlauf entfernen',
            'Supprimer de',
            'Borrar del historial'
        ],
        // 클릭 후 대기 시간 (ms)
        menuDelay: 50,
        // 디바운싱 시간 (ms)
        debounceDelay: 100,
        // 디버그 모드
        debug: false
    };

    // ========================================
    // 스타일 주입
    // ========================================
    GM_addStyle(`
        /* 휴지통 버튼 스타일 */
        .yt-quick-delete-btn {
            position: absolute;
            top: 4px;
            right: 4px;
            width: 28px;
            height: 28px;
            background: rgba(0, 0, 0, 0.7);
            border: none;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;
            z-index: 100;
            padding: 0;
        }

        .yt-quick-delete-btn:hover {
            background: rgba(255, 0, 0, 0.8);
            transform: scale(1.1);
        }

        .yt-quick-delete-btn:active {
            transform: scale(0.95);
        }

        .yt-quick-delete-btn svg {
            width: 16px;
            height: 16px;
            fill: white;
        }

        /* 시청 기록 페이지 - 리스트 형태 */
        ytd-video-renderer:hover .yt-quick-delete-btn,
        ytd-video-renderer .yt-quick-delete-btn:focus {
            opacity: 1;
        }

        /* 홈/구독 페이지 - 그리드 형태 */
        ytd-rich-item-renderer:hover .yt-quick-delete-btn,
        ytd-rich-item-renderer .yt-quick-delete-btn:focus {
            opacity: 1;
        }

        /* 그리드 미디어 컨테이너 */
        ytd-rich-grid-media:hover .yt-quick-delete-btn,
        ytd-rich-grid-media .yt-quick-delete-btn:focus {
            opacity: 1;
        }

        /* 검색 결과 */
        .ytd-item-section-renderer:hover .yt-quick-delete-btn {
            opacity: 1;
        }

        /* 쇼츠 아이템 */
        ytd-reel-item-renderer:hover .yt-quick-delete-btn,
        ytd-reel-item-renderer .yt-quick-delete-btn:focus {
            opacity: 1;
        }

        /* 삭제 중 애니메이션 */
        .yt-quick-delete-deleting {
            animation: pulse 0.5s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 1; }
        }

        /* 삭제 완료 시 페이드아웃 */
        .yt-quick-delete-removed {
            animation: fadeOut 0.3s ease forwards;
        }

        @keyframes fadeOut {
            to {
                opacity: 0;
                transform: scale(0.95);
            }
        }
    `);

    // ========================================
    // 유틸리티 함수
    // ========================================
    const log = (...args) => CONFIG.debug && console.log('[YT-QuickDelete]', ...args);

    // 디바운싱 함수
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 휴지통 SVG 아이콘 생성
    function createTrashIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.innerHTML = `
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        `;
        return svg;
    }

    // 휴지통 버튼 생성
    function createDeleteButton(videoElement) {
        const btn = document.createElement('button');
        btn.className = 'yt-quick-delete-btn';
        btn.type = 'button';
        btn.title = '시청 기록에서 삭제';
        btn.setAttribute('aria-label', '시청 기록에서 삭제');
        btn.appendChild(createTrashIcon());

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            await handleDelete(videoElement, btn);
        });

        return btn;
    }

    // ========================================
    // 핵심 로직: 삭제 처리
    // ========================================
    async function handleDelete(videoElement, deleteBtn) {
        log('삭제 시작');

        // 버튼 상태 변경
        deleteBtn.classList.add('yt-quick-delete-deleting');
        deleteBtn.disabled = true;

        try {
            // 1. 점 3개 메뉴 버튼 찾기
            const menuButton = findMenuButton(videoElement);
            if (!menuButton) {
                log('메뉴 버튼을 찾을 수 없음');
                throw new Error('Menu button not found');
            }

            log('메뉴 버튼 발견, 클릭 실행');
            
            // 2. 메뉴 버튼 클릭
            menuButton.click();

            // 3. 메뉴 팝업 대기 후 삭제 항목 클릭
            await waitForMenuAndClickDelete(videoElement);

            // 4. 성공 시 DOM에서 제거 (애니메이션 포함)
            videoElement.classList.add('yt-quick-delete-removed');
            setTimeout(() => {
                videoElement.remove();
                log('DOM에서 제거 완료');
            }, 300);

        } catch (error) {
            log('삭제 실패:', error.message);
            // 실패 시 버튼 상태 복구
            deleteBtn.classList.remove('yt-quick-delete-deleting');
            deleteBtn.disabled = false;
            
            // 사용자에게 피드백 (선택적)
            deleteBtn.style.background = 'rgba(255, 165, 0, 0.8)';
            setTimeout(() => {
                deleteBtn.style.background = '';
            }, 1000);
        }
    }

    // 점 3개 메뉴 버튼 찾기
    function findMenuButton(videoElement) {
        // 여러 가능한 선택자 시도
        const selectors = [
            // 시청 기록 페이지
            'ytd-menu-renderer yt-icon-button button',
            'ytd-menu-renderer button[aria-label]',
            '#menu button',
            'button[aria-label="More actions"]',
            'button[aria-label="작업 더보기"]',
            'button[aria-label="동작 더 보기"]',
            // 그리드 아이템
            'ytd-rich-grid-media ytd-menu-renderer yt-icon-button button',
            'ytd-rich-grid-media button#button',
            // 일반적인 패턴
            'ytd-menu-renderer button.yt-icon-button',
            'yt-icon-button.ytd-menu-renderer'
        ];

        for (const selector of selectors) {
            const btn = videoElement.querySelector(selector);
            if (btn) {
                // 실제 버튼 요소 찾기 (yt-icon-button 내부의 button)
                const actualBtn = btn.tagName === 'BUTTON' ? btn : btn.querySelector('button') || btn;
                log(`메뉴 버튼 선택자 발견: ${selector}`);
                return actualBtn;
            }
        }

        // 폴백: aria-label로 찾기
        const allButtons = videoElement.querySelectorAll('button');
        for (const btn of allButtons) {
            const label = btn.getAttribute('aria-label') || '';
            if (label.includes('More actions') || label.includes('작업') || label.includes('동작') || label.includes('메뉴')) {
                log('aria-label로 메뉴 버튼 발견');
                return btn;
            }
        }

        return null;
    }

    // 메뉴 팝업이 나타날 때까지 대기하고 삭제 항목 클릭
    async function waitForMenuAndClickDelete(videoElement) {
        const maxAttempts = 10;
        const delay = CONFIG.menuDelay;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await sleep(delay);

            // 메뉴 팝업 찾기
            const menuPopup = document.querySelector('ytd-menu-popup-renderer, tp-yt-paper-listbox, .ytd-menu-popup-renderer');
            
            if (menuPopup) {
                log(`메뉴 팝업 발견 (시도 ${attempt + 1})`);
                
                // 삭제 메뉴 항목 찾기
                const deleteItem = findDeleteMenuItem(menuPopup);
                
                if (deleteItem) {
                    log('삭제 메뉴 항목 발견, 클릭 실행');
                    deleteItem.click();
                    return;
                }
            }
        }

        throw new Error('Delete menu item not found after maximum attempts');
    }

    // 삭제 메뉴 항목 찾기
    function findDeleteMenuItem(menuPopup) {
        // 메뉴 항목들 찾기
        const menuItems = menuPopup.querySelectorAll(
            'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, tp-yt-paper-item, [role="menuitem"]'
        );

        log(`메뉴 항목 ${menuItems.length}개 발견`);

        for (const item of menuItems) {
            // 텍스트로 확인
            const text = item.textContent || item.innerText || '';
            const title = item.getAttribute('title') || '';
            
            log('메뉴 항목 텍스트:', text.trim());

            for (const deleteText of CONFIG.deleteTexts) {
                if (text.includes(deleteText) || title.includes(deleteText)) {
                    log(`삭제 항목 매칭: "${deleteText}"`);
                    return item;
                }
            }
        }

        // 폴백: 텍스트로 직접 검색
        for (const deleteText of CONFIG.deleteTexts) {
            const xpath = `//*[contains(text(), '${deleteText}')]`;
            const result = document.evaluate(xpath, menuPopup, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (result.singleNodeValue) {
                log(`XPath로 삭제 항목 발견: "${deleteText}"`);
                return result.singleNodeValue;
            }
        }

        return null;
    }

    // ========================================
    // DOM 조작: 버튼 주입
    // ========================================
    function injectDeleteButtons() {
        // 대상 요소 선택자들
        const targets = [
            // 시청 기록 페이지 - 리스트 형태
            {
                selector: 'ytd-video-renderer',
                container: null // 요소 자체에 position: relative 필요
            },
            // 홈/구독 페이지 - 그리드 형태
            {
                selector: 'ytd-rich-item-renderer',
                container: 'ytd-rich-grid-media, #content'
            },
            // 쇼츠
            {
                selector: 'ytd-reel-item-renderer',
                container: null
            },
            // 재생목록
            {
                selector: 'ytd-playlist-video-renderer',
                container: null
            }
        ];

        let injectedCount = 0;

        for (const target of targets) {
            const elements = document.querySelectorAll(target.selector);
            
            elements.forEach(element => {
                // 이미 버튼이 있으면 스킵
                if (element.querySelector('.yt-quick-delete-btn')) {
                    return;
                }

                // 버튼을 삽입할 컨테이너 찾기
                let container = element;
                if (target.container) {
                    container = element.querySelector(target.container) || element;
                }

                // position 설정 확인
                const computedStyle = window.getComputedStyle(container);
                if (computedStyle.position === 'static') {
                    container.style.position = 'relative';
                }

                // 썸네일 영역 찾기 (우선순위)
                const thumbnail = container.querySelector('ytd-thumbnail, #thumbnail-container, .ytd-thumbnail');
                const insertTarget = thumbnail || container;

                // 버튼 생성 및 삽입
                const deleteBtn = createDeleteButton(element);
                insertTarget.appendChild(deleteBtn);
                injectedCount++;
            });
        }

        if (injectedCount > 0) {
            log(`${injectedCount}개 요소에 버튼 주입 완료`);
        }
    }

    // ========================================
    // MutationObserver 설정
    // ========================================
    const debouncedInject = debounce(injectDeleteButtons, CONFIG.debounceDelay);

    function setupObserver() {
        const observer = new MutationObserver((mutations) => {
            let shouldInject = false;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // 추가된 노드 중 비디오 관련 요소가 있는지 확인
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node;
                            // 비디오 렌더러인지 또는 비디오 렌더러를 포함하는지 확인
                            if (
                                element.matches?.('ytd-video-renderer, ytd-rich-item-renderer, ytd-reel-item-renderer, ytd-playlist-video-renderer') ||
                                element.querySelector?.('ytd-video-renderer, ytd-rich-item-renderer, ytd-reel-item-renderer, ytd-playlist-video-renderer') ||
                                element.tagName?.startsWith('YTD-')
                            ) {
                                shouldInject = true;
                                break;
                            }
                        }
                    }
                }
                if (shouldInject) break;
            }

            if (shouldInject) {
                debouncedInject();
            }
        });

        // body 전체 관찰
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        log('MutationObserver 설정 완료');
        return observer;
    }

    // ========================================
    // SPA 페이지 전환 감지
    // ========================================
    function setupNavigationListener() {
        // URL 변경 감지 (YouTube SPA)
        let lastUrl = location.href;

        const checkUrlChange = () => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                log('페이지 전환 감지:', lastUrl);
                // 약간의 딜레이 후 버튼 재주입
                setTimeout(injectDeleteButtons, 500);
            }
        };

        // popstate 이벤트
        window.addEventListener('popstate', checkUrlChange);

        // yt-navigate-finish 이벤트 (YouTube 커스텀 이벤트)
        document.addEventListener('yt-navigate-finish', () => {
            log('yt-navigate-finish 이벤트');
            setTimeout(injectDeleteButtons, 500);
        });

        // 주기적 체크 (백업)
        setInterval(checkUrlChange, 1000);
    }

    // ========================================
    // 초기화
    // ========================================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function init() {
        log('초기화 시작');

        // DOM 로딩 대기
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }

        // 추가 대기 (YouTube 동적 로딩)
        await sleep(1000);

        // 초기 버튼 주입
        injectDeleteButtons();

        // MutationObserver 설정
        setupObserver();

        // 페이지 전환 감지 설정
        setupNavigationListener();

        log('초기화 완료');
    }

    // 실행
    init();

})();
