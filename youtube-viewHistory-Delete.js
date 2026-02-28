// ==UserScript==
// @name         YouTube 1-Click Delete Button
// @namespace    http://tampermonkey.net/
// @version      4.0.0
// @match        *://www.youtube.com/feed/history*
// @match        *://youtube.com/feed/history*
// @grant        GM_addStyle
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
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
		menuDelay: 30,
		// 디바운싱 시간 (ms)
		debounceDelay: 50,
		// 디버그 모드
		debug: true,
		// 영상 1개당 예상 시간 (ms)
		msPerVideo: 400
	};


	// ========================================
	// 스타일 주입
	// ========================================
	GM_addStyle(`
        /* 휴지통 버튼 스타일 */
        .yt-quick-delete-btn {
            position: absolute;
            bottom: 4px;
            left: 4px;
            width: 28px;
            height: 28px;
            background: rgba(0, 0, 0, 0.75);
            border: none;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.9;
            transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;
            z-index: 9999;
            padding: 0;
        }

        .yt-quick-delete-btn:hover {
            background: rgba(255, 0, 0, 0.9);
            transform: scale(1.15);
        }

        .yt-quick-delete-btn:active {
            transform: scale(0.95);
        }

        .yt-quick-delete-btn svg {
            width: 18px;
            height: 18px;
            fill: white;
            pointer-events: none;
        }

        /* 삭제 중 애니메이션 */
        .yt-quick-delete-deleting {
            animation: pulse 0.5s ease-in-out infinite;
            pointer-events: none;
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 0.9; }
        }

        /* 삭제 완료 시 페이드아웃 */
        .yt-quick-delete-removed {
            animation: fadeOut 0.3s ease forwards !important;
        }

        @keyframes fadeOut {
            to {
                opacity: 0;
                transform: scale(0.9);
            }
        }

        /* yt-lockup-view-model (2026 일반 비디오) */
        yt-lockup-view-model {
            position: relative !important;
        }

        /* ytm-shorts-lockup-view-model (2026 Shorts) */
        ytm-shorts-lockup-view-model,
        ytm-shorts-lockup-view-model-v2 {
            position: relative !important;
        }

        /* 쇼츠 섹션 "해당 줄 지우기" 버튼 (헤더용) */
        .yt-shelf-delete-btn {
            background: transparent;
            border: none;
            padding: 0 8px;
            font-size: 14px;
            font-weight: 500;
            color: #0f0f0f;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-left: 8px;
            transition: color 0.2s ease;
            font-family: 'Roboto', 'Arial', sans-serif;
            vertical-align: middle;
            letter-spacing: normal;
        }

        .yt-shelf-delete-btn:hover {
            color: #cc0000;
        }

        .yt-shelf-delete-btn svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }

        .yt-shelf-delete-btn.deleting {
            opacity: 0.5;
            pointer-events: none;
        }

        /* 쇼츠 섹션 삭제 애니메이션 */
        .yt-shelf-removed {
            animation: shelfFadeOut 0.4s ease forwards !important;
        }

        @keyframes shelfFadeOut {
            to {
                opacity: 0;
                max-height: 0;
                margin: 0;
                padding: 0;
                overflow: hidden;
            }
        }

        /* 타이머 패널 */
        .yt-delete-timer {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            font-family: 'Roboto', 'Arial', sans-serif;
            font-size: 14px;
            z-index: 99999;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            min-width: 180px;
        }

        .yt-delete-timer-title {
            font-weight: 500;
            margin-bottom: 8px;
            color: #ff4444;
        }

        .yt-delete-timer-progress {
            width: 100%;
            height: 6px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 3px;
            margin: 10px 0;
            overflow: hidden;
        }

        .yt-delete-timer-bar {
            height: 100%;
            background: #ff4444;
            border-radius: 3px;
            transition: width 1s linear;
        }

        .yt-delete-timer-time {
            font-size: 24px;
            font-weight: bold;
            text-align: center;
            margin: 8px 0;
            font-variant-numeric: tabular-nums;
        }

        .yt-delete-timer-count {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            text-align: center;
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

	// ========================================
	// 타이머 GUI
	// ========================================
	let timerElement = null;
	let timerStartTime = 0;
	const MIN_TIMER_DISPLAY_MS = 1000; // 1초 표시


	function showTimer(totalVideos) {
		// 기존 타이머 제거
		hideTimer(true);

		timerStartTime = Date.now();

		// 타이머 요소 생성
		timerElement = document.createElement('div');
		timerElement.className = 'yt-delete-timer';

		// 타이틀
		const title = document.createElement('div');
		title.className = 'yt-delete-timer-title';
		title.textContent = '🗑️ 삭제 중...';
		timerElement.appendChild(title);

		// 영상 개수 표시
		const countDisplay = document.createElement('div');
		countDisplay.className = 'yt-delete-timer-time';
		countDisplay.textContent = `영상 ${totalVideos}개`;
		timerElement.appendChild(countDisplay);

		// 진행 바 (고정)
		const progress = document.createElement('div');
		progress.className = 'yt-delete-timer-progress';

		const bar = document.createElement('div');
		bar.className = 'yt-delete-timer-bar';
		bar.id = 'yt-timer-bar';
		bar.style.width = '100%';
		progress.appendChild(bar);
		timerElement.appendChild(progress);

		// 안내 문구
		const hint = document.createElement('div');
		hint.className = 'yt-delete-timer-count';
		hint.textContent = '다른 줄 클릭하지 마세요';
		timerElement.appendChild(hint);

		document.body.appendChild(timerElement);

		// 진행 바 애니메이션 (5초간)
		setTimeout(() => {
			bar.style.width = '0%';
		}, 50);
	}

	// 사용하지 않음 (단순화됨)
	function updateTimer() { }
	function updateTimerProgress(currentVideo) { }

	function hideTimer(force = false) {
		if (!timerElement) return;

		if (force) {
			timerElement.remove();
			timerElement = null;
		}
	}

	function hideTimerAndPlaySound() {
		if (!timerElement) {
			playCompleteSound();
			return;
		}

		const elapsed = Date.now() - timerStartTime;
		const remaining = Math.max(0, MIN_TIMER_DISPLAY_MS - elapsed);

		setTimeout(() => {
			if (timerElement) {
				timerElement.remove();
				timerElement = null;
			}
			playCompleteSound();
		}, remaining);
	}

	function playCompleteSound() {
		// 완료 알림음 (상쾌한 상승음)
		try {
			const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

			// 노트 재생 함수
			const playNote = (freq, startTime, duration) => {
				const osc = audioCtx.createOscillator();
				const gain = audioCtx.createGain();
				osc.connect(gain);
				gain.connect(audioCtx.destination);

				osc.frequency.value = freq;
				osc.type = 'sine';

				// 부드럽게 페이드 인/아웃
				gain.gain.setValueAtTime(0, startTime);
				gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
				gain.gain.linearRampToValueAtTime(0, startTime + duration);

				osc.start(startTime);
				osc.stop(startTime + duration);
			};

			const now = audioCtx.currentTime;
			// C5 → E5 → G5 (도미솔) 완료음
			playNote(523, now, 0.15);        // 도
			playNote(659, now + 0.12, 0.15);  // 미
			playNote(784, now + 0.24, 0.25);  // 솔

		} catch (e) {
			log('소리 재생 실패:', e.message);
		}
	}

	// 휴지통 SVG 아이콘 생성 (TrustedHTML 우회)
	function createTrashIcon() {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');

		// innerHTML 대신 DOM API 사용 (CSP 우회)
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z');
		svg.appendChild(path);

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



	// 쇼츠 섹션 "해당 줄 지우기" 버튼 생성 (헤더용)
	function createShelfDeleteButton(shelfElement) {
		const btn = document.createElement('button');
		btn.className = 'yt-shelf-delete-btn';
		btn.type = 'button';
		btn.title = '해당 줄 지우기';
		btn.setAttribute('aria-label', '해당 줄 지우기');

		const icon = createTrashIcon();
		const text = document.createElement('span');
		text.textContent = '해당 줄 지우기';

		btn.appendChild(icon);
		btn.appendChild(text);

		btn.addEventListener('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();

			await handleShelfDelete(shelfElement, btn);
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
			// 1. "추가 작업" 메뉴 버튼 찾기
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
			}, 150);

		} catch (error) {
			log('삭제 실패:', error.message);
			// 실패 시 버튼 상태 복구
			deleteBtn.classList.remove('yt-quick-delete-deleting');
			deleteBtn.disabled = false;

			// 사용자에게 피드백
			deleteBtn.style.background = 'rgba(255, 165, 0, 0.9)';
			setTimeout(() => {
				deleteBtn.style.background = '';
			}, 1000);
		}
	}

	// "추가 작업" 메뉴 버튼 찾기 (2026 버전)
	function findMenuButton(videoElement) {
		// 2026년 YouTube 구조
		const selectors = [
			// 새로운 버튼 클래스 (2026)
			'button.yt-spec-button-shape-next--icon-button',
			'button.yt-spec-button-shape-next[aria-label*="작업"]',
			'button.yt-spec-button-shape-next[aria-label*="More"]',
			// aria-label로 찾기
			'button[aria-label="추가 작업"]',
			'button[aria-label="More actions"]',
			// 일반적인 패턴
			'ytd-menu-renderer button',
			'#menu button'
		];

		for (const selector of selectors) {
			const btns = videoElement.querySelectorAll(selector);
			for (const btn of btns) {
				const label = btn.getAttribute('aria-label') || '';
				if (label.includes('작업') || label.includes('More') || label.includes('action')) {
					log(`메뉴 버튼 발견: ${selector}, label: ${label}`);
					return btn;
				}
			}
		}

		// 폴백: 모든 버튼 중 "작업" 또는 "More" 포함 찾기
		const allButtons = videoElement.querySelectorAll('button');
		for (const btn of allButtons) {
			const label = btn.getAttribute('aria-label') || '';
			if (label.includes('작업') || label.includes('More actions')) {
				log('폴백으로 메뉴 버튼 발견:', label);
				return btn;
			}
		}

		return null;
	}

	// 메뉴 팝업이 나타날 때까지 대기하고 삭제 항목 클릭
	async function waitForMenuAndClickDelete(videoElement) {
		const maxAttempts = 20;
		const delay = CONFIG.menuDelay;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			await sleep(delay);

			// 메뉴 팝업 찾기 (여러 가능한 선택자)
			const menuSelectors = [
				'ytd-popup-container',
				'tp-yt-iron-dropdown',
				'ytd-menu-popup-renderer',
				'tp-yt-paper-listbox',
				'[role="menu"]',
				'yt-list-view-model',
				'.ytd-menu-popup-renderer'
			];

			let menuPopup = null;
			for (const selector of menuSelectors) {
				menuPopup = document.querySelector(selector);
				if (menuPopup) break;
			}

			if (menuPopup) {
				log(`메뉴 팝업 발견 (시도 ${attempt + 1}): ${menuPopup.tagName}`);

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
	// 삭제 메뉴 항목 찾기
	function findDeleteMenuItem(menuPopup) {
		// 메뉴 항목들 찾기
		const itemSelectors = [
			'yt-list-item-view-model',
			'ytd-menu-service-item-renderer',
			'ytd-menu-navigation-item-renderer',
			'tp-yt-paper-item',
			'[role="menuitem"]',
			'button.ytButtonOrAnchorHost',
			'button',
			'a'
		];

		// menuPopup뿐만 아니라 전체 문서에서도 검색
		let menuItems = [];
		for (const selector of itemSelectors) {
			// menuPopup 내부에서 검색
			const items = menuPopup.querySelectorAll(selector);
			if (items.length > 0) {
				menuItems = Array.from(items);
				break;
			}
			// 전체 문서에서도 검색 (드롭다운이 menuPopup 외부에 있을 수 있음)
			const docItems = document.querySelectorAll(selector);
			if (docItems.length > 0) {
				menuItems = Array.from(docItems);
				break;
			}
		}

		log(`메뉴 항목 ${menuItems.length}개 발견`);

		for (const item of menuItems) {
			// 텍스트로 확인
			const text = (item.textContent || item.innerText || '').trim();
			const title = item.getAttribute('title') || '';
			const label = item.getAttribute('aria-label') || '';

			log('메뉴 항목 텍스트:', text.substring(0, 50));

			for (const deleteText of CONFIG.deleteTexts) {
				if (text.includes(deleteText) || title.includes(deleteText) || label.includes(deleteText)) {
					log(`삭제 항목 매칭: "${deleteText}"`);
					return item;
				}
			}
		}

		// 폴백: XPath로 텍스트 검색 (button 요소만 찾도록 개선)
		for (const deleteText of CONFIG.deleteTexts) {
			try {
				// button 또는 yt-list-item-view-model 요소만 찾기
				const xpath = `//yt-list-item-view-model[contains(., '${deleteText}')] | //button[contains(., '${deleteText}')]`;
				const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
				if (result.singleNodeValue && result.singleNodeValue.tagName !== 'SCRIPT') {
					log(`XPath로 삭제 항목 발견: "${deleteText}"`);
					return result.singleNodeValue;
				}
			} catch (e) {
				// XPath 에러 무시
			}
		}

		return null;
	}

	// ========================================
	// DOM 조작: 버튼 주입 (2026 버전)
	// ========================================
	function injectDeleteButtons() {
		// 2026년 YouTube DOM 구조
		const targets = [
			// 일반 비디오 (yt-lockup-view-model)
			{
				selector: 'yt-lockup-view-model.ytd-item-section-renderer',
				name: '일반 비디오',
				isShorts: false
			},
			// Shorts (ytm-shorts-lockup-view-model) - 썸네일 링크에 버튼 추가
			{
				selector: 'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2',
				name: 'Shorts',
				isShorts: true,
				thumbnailSelector: 'a.shortsLockupViewModelHostEndpoint'
			},
			// 기존 구조 (폴백)
			{
				selector: 'ytd-video-renderer',
				name: '기존 비디오',
				isShorts: false
			},
			{
				selector: 'ytd-rich-item-renderer',
				name: '그리드 아이템',
				isShorts: false
			},
			{
				selector: 'ytd-reel-item-renderer',
				name: '기존 Shorts',
				isShorts: false
			}
		];

		let injectedCount = 0;

		for (const target of targets) {
			const elements = document.querySelectorAll(target.selector);

			if (elements.length > 0) {
				log(`${target.name}: ${elements.length}개 발견`);
			}

			elements.forEach(element => {
				// 이미 버튼이 있으면 스킵
				if (element.querySelector('.yt-quick-delete-btn')) {
					return;
				}

				// 쇼츠의 경우 썸네일 링크에 버튼 추가
				if (target.isShorts && target.thumbnailSelector) {
					const thumbnailLink = element.querySelector(target.thumbnailSelector);
					if (thumbnailLink) {
						// position 설정 (이미 relative일 수 있음)
						const computedStyle = window.getComputedStyle(thumbnailLink);
						if (computedStyle.position === 'static') {
							thumbnailLink.style.position = 'relative';
						}

						// 버튼 생성 및 삽입 (썸네일 링크에)
						const deleteBtn = createDeleteButton(element);
						thumbnailLink.appendChild(deleteBtn);
						injectedCount++;
					}
				} else {
					// 일반 비디오: 부모 요소에 버튼 추가
					const computedStyle = window.getComputedStyle(element);
					if (computedStyle.position === 'static') {
						element.style.position = 'relative';
					}

					const deleteBtn = createDeleteButton(element);
					element.appendChild(deleteBtn);
					injectedCount++;
				}
			});
		}

		if (injectedCount > 0) {
			log(`${injectedCount}개 요소에 버튼 주입 완료`);
		}

		return injectedCount;
	}

	// ========================================
	// 쇼츠 섹션 "해당 줄 지우기" 버튼 주입 (헤더에 직접 추가)
	// ========================================
	function injectShelfDeleteButtons() {
		const shelfSelectors = [
			'ytd-reel-shelf-renderer',
			'ytd-rich-shelf-renderer'
		];

		let injectedCount = 0;

		for (const selector of shelfSelectors) {
			const shelves = document.querySelectorAll(selector);

			if (shelves.length > 0) {
				log(`쇼츠 섹션: ${shelves.length}개 발견`);
			}

			shelves.forEach(shelf => {
				// 이미 버튼이 있으면 스킵
				if (shelf.querySelector('.yt-shelf-delete-btn')) {
					return;
				}

				// 헤더의 타이틀 영역 찾기 (#title 또는 h2)
				const titleArea = shelf.querySelector('#title') || shelf.querySelector('h2');
				if (titleArea) {
					const deleteBtn = createShelfDeleteButton(shelf);
					titleArea.appendChild(deleteBtn);
					injectedCount++;
					log('쇼츠 섹션 헤더에 버튼 추가');
				}
			});
		}

		if (injectedCount > 0) {
			log(`쇼츠 섹션 ${injectedCount}개에 버튼 추가 완료`);
		}

		return injectedCount;
	}




	// 단일 영상 삭제 (버튼 없이 직접)
	async function deleteSingleVideo(videoElement) {
		try {
			// 1. "추가 작업" 메뉴 버튼 찾기
			const menuButton = findMenuButton(videoElement);
			if (!menuButton) {
				throw new Error('Menu button not found');
			}

			// 2. 메뉴 버튼 클릭
			menuButton.click();

			// 3. 메뉴 팝업 대기 후 삭제 항목 클릭
			await waitForMenuAndClickDelete(videoElement);

			// 4. DOM에서 제거
			videoElement.classList.add('yt-quick-delete-removed');
			setTimeout(() => {
				videoElement.remove();
			}, 150);

		} catch (error) {
			throw error;
		}
	}

	// 쇼츠 섹션에서 오른쪽 화살표 끝까지 클릭
	async function loadAllShorts(shelfElement) {
		const maxAttempts = 50;
		let attempts = 0;

		// 쇼츠 개수 세는 함수
		const countShorts = () => {
			const selectors = ['ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2', 'ytd-reel-item-renderer'];
			for (const sel of selectors) {
				const count = shelfElement.querySelectorAll(sel).length;
				if (count > 0) return count;
			}
			return 0;
		};

		// 화살표가 실제로 보이는지 확인
		const isArrowVisible = (btn) => {
			if (!btn) return false;
			const style = window.getComputedStyle(btn);
			const rect = btn.getBoundingClientRect();
			return style.display !== 'none' &&
				style.visibility !== 'hidden' &&
				style.opacity !== '0' &&
				rect.width > 0 &&
				rect.height > 0;
		};

		while (attempts < maxAttempts) {
			// 화살표 찾기
			const arrowButton = shelfElement.querySelector('#right-arrow-button') ||
				shelfElement.querySelector('button[aria-label*="다음"]') ||
				shelfElement.querySelector('button[aria-label*="Next"]') ||
				shelfElement.querySelector('ytd-button-renderer #right-arrow button') ||
				shelfElement.querySelector('.yt-spec-button-shape-next--icon-button[aria-label*="다음"]');

			// 화살표가 없거나 보이지 않으면 종료
			if (!arrowButton || !isArrowVisible(arrowButton)) {
				log('화살표 안 보임 - 로드 완료');
				break;
			}

			// 화살표 클릭
			const currentCount = countShorts();
			log(`화살표 클릭 ${attempts + 1}번째 (쇼츠: ${currentCount}개)`);
			arrowButton.click();
			attempts++;

			// 로딩 대기
			await sleep(300);
		}

		const finalCount = countShorts();
		log(`로드 완료: ${attempts}번 클릭, 쇼츠 ${finalCount}개`);
	}

	// 쇼츠 섹션 실제 삭제 처리 (각 영상 순차 삭제)
	async function handleShelfDelete(shelfElement, menuItem) {
		log('쇼츠 섹션 삭제 시작');

		// 메뉴 항목 상태 변경
		if (menuItem) {
			menuItem.classList.add('deleting');
		}

		try {
			// 1. 모든 쇼츠 로드 (화살표 끝까지 클릭)
			log('모든 쇼츠 로드 중...');
			await loadAllShorts(shelfElement);

			// 2. 섹션 내 모든 쇼츠 영상 찾기
			const shortsSelectors = [
				'ytm-shorts-lockup-view-model',
				'ytm-shorts-lockup-view-model-v2',
				'ytd-reel-item-renderer'
			];

			let shortsElements = [];
			for (const selector of shortsSelectors) {
				const elements = shelfElement.querySelectorAll(selector);
				if (elements.length > 0) {
					shortsElements = Array.from(elements);
					break;
				}
			}

			if (shortsElements.length === 0) {
				log('삭제할 쇼츠 영상이 없음');
				return;
			}

			log(`${shortsElements.length}개 쇼츠 영상 삭제 시작`);

			// 3. 타이머 표시
			showTimer(shortsElements.length);

			// 4. 각 쇼츠 영상 순차적으로 삭제
			for (let i = 0; i < shortsElements.length; i++) {
				const shortElement = shortsElements[i];
				log(`쇼츠 ${i + 1}/${shortsElements.length} 삭제 중...`);

				try {
					await deleteSingleVideo(shortElement);
				} catch (error) {
					log(`쇼츠 ${i + 1} 삭제 실패:`, error.message);
				}
			}

			// 타이머 숨기고 완료 소리 (2초 후)
			hideTimerAndPlaySound();
			// 모든 쇼츠 삭제 완료 후 섹션 DOM 제거
			shelfElement.classList.add('yt-shelf-removed');
			setTimeout(() => {
				shelfElement.remove();
				log('쇼츠 섹션 DOM에서 제거 완료');
			}, 50);

		} catch (error) {
			log('쇼츠 섹션 삭제 실패:', error.message);
			hideTimer(true);
			if (menuItem) {
				menuItem.classList.remove('deleting');
			}
		}
	}
	// ========================================
	// MutationObserver 설정
	// ========================================
	const debouncedInject = debounce(() => {
		// 기록 페이지에서만 실행
		if (!isHistoryPage()) return;
		injectDeleteButtons();
		injectShelfDeleteButtons();
	}, CONFIG.debounceDelay);

	function setupObserver() {
		const observer = new MutationObserver((mutations) => {
			let shouldInject = false;

			for (const mutation of mutations) {
				if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
					for (const node of mutation.addedNodes) {
						if (node.nodeType === Node.ELEMENT_NODE) {
							const element = node;
							// 2026년 구조 + 기존 구조 모두 확인
							const isVideoElement =
								element.matches?.('yt-lockup-view-model, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-video-renderer, ytd-rich-item-renderer, ytd-reel-item-renderer, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer') ||
								element.querySelector?.('yt-lockup-view-model, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-video-renderer, ytd-rich-item-renderer, ytd-reel-item-renderer, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer') ||
								element.tagName?.startsWith('YTD-') ||
								element.tagName?.startsWith('YTM-') ||
								element.tagName?.startsWith('YT-');

							if (isVideoElement) {
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
		if (document.body) {
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			log('MutationObserver 설정 완료');
		}

		return observer;
	}

	// ========================================
	// SPA 페이지 전환 감지
	// ========================================
	function setupNavigationListener() {
		// yt-navigate-finish 이벤트 (YouTube 커스텀 이벤트)
		document.addEventListener('yt-navigate-finish', () => {
			// 기록 페이지에서만 실행
			if (!isHistoryPage()) return;
			log('yt-navigate-finish 이벤트');
			setTimeout(() => {
				injectDeleteButtons();
				injectShelfDeleteButtons();
			}, 500);
		});

		// URL 변경 감지 (백업)
		let lastUrl = location.href;
		const checkUrlChange = () => {
			if (location.href !== lastUrl) {
				lastUrl = location.href;
				// 기록 페이지에서만 실행
				if (!isHistoryPage()) return;
				log('URL 변경 감지:', lastUrl);
				setTimeout(() => {
					injectDeleteButtons();
					injectShelfDeleteButtons();
				}, 500);
			}
		};

		window.addEventListener('popstate', checkUrlChange);
		setInterval(checkUrlChange, 1000);
	}

	// ========================================
	// 초기화
	// ========================================
	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	// 기록 페이지인지 확인
	function isHistoryPage() {
		return location.pathname.includes('/feed/history');
	}

	async function init() {
		// 기록 페이지가 아니면 실행하지 않음
		if (!isHistoryPage()) {
			log('기록 페이지가 아니므로 스킵');
			return;
		}

		log('초기화 시작');

		// DOM 로딩 대기
		if (document.readyState === 'loading') {
			await new Promise(resolve => {
				document.addEventListener('DOMContentLoaded', resolve);
			});
		}

		// YouTube 동적 로딩 대기
		await sleep(800);

		// 초기 버튼 주입
		const count = injectDeleteButtons();
		log(`초기 주입: ${count}개`);

		// 쇼츠 섹션 버튼 주입
		const shelfCount = injectShelfDeleteButtons();
		log(`쇼츠 섹션 주입: ${shelfCount}개`);

		// MutationObserver 설정
		setupObserver();

		// 페이지 전환 감지 설정
		setupNavigationListener();

		log('초기화 완료');
	}

	// 실행
	init();

})();
