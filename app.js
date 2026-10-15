/**
 * ==========================================================================
 * 부산 주요 수퍼마켓/대형마트 매장 지도 대시보드 - 핵심 로직
 * Pure Vanilla JavaScript (Zero Framework, Zero Build)
 * ==========================================================================
 */

(function () {
  'use strict';

  // 1. 상수 및 초기 설정
  const BUSAN_CENTER = [35.1796, 129.0756]; // 부산시청 중심 좌표
  const DEFAULT_ZOOM = 11;

  // 브랜드 대표 컬러 및 메타데이터 정의
  const BRAND_META = {
    'all': { label: '전체', color: '#1e293b' },
    '이마트': { label: '이마트', color: '#f59e0b' },
    '트레이더스': { label: '트레이더스', color: '#10b981' },
    '이마트 에브리데이': { label: '에브리데이', color: '#f59e0b' },
    '홈플러스': { label: '홈플러스', color: '#dc2626' },
    '홈플러스 익스프레스': { label: '홈플익스프레스', color: '#ef4444' },
    '롯데마트': { label: '롯데마트', color: '#e11d48' },
    '메가마트': { label: '메가마트', color: '#2563eb' },
    '농협 하나로마트': { label: '하나로마트', color: '#059669' },
    '서원유통 탑마트': { label: '탑마트', color: '#ea580c' },
    '기타 마트': { label: '기타 마트', color: '#8b5cf6' }
  };

  // 2. 애플리케이션 상태 (Single State Store)
  const state = {
    allStores: [],
    filteredStores: [],
    selectedBrand: 'all',
    selectedGu: 'all',
    searchQuery: '',
    selectedStoreId: null,
    markersMap: new Map() // store.id -> L.marker
  };

  // 지도 및 클러스터 레이어 객체
  let map = null;
  let markerClusterGroup = null;
  let userLocationMarker = null;

  // DOM 엘리먼트 캐싱
  const dom = {
    headerTotalCount: document.getElementById('header-total-count'),
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    brandChipsContainer: document.getElementById('brand-chips-container'),
    guSelect: document.getElementById('gu-select'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    resultCount: document.getElementById('result-count'),
    currentFilterDesc: document.getElementById('current-filter-desc'),
    storeListContainer: document.getElementById('store-list-container'),
    btnResetMap: document.getElementById('btn-reset-map'),
    btnMyLocation: document.getElementById('btn-my-location'),
    btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
    sidebarPanel: document.getElementById('sidebar-panel'),
    toastNotice: document.getElementById('toast-notice'),
    toastMessage: document.getElementById('toast-message')
  };

  // ==========================================================================
  // 3. 지도 초기화 (Leaflet & OpenStreetMap)
  // ==========================================================================
  function initMap() {
    // Leaflet 맵 생성 (부산 중심)
    map = L.map('map', {
      center: BUSAN_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false // 커스텀 배치를 위해 기본 컨트롤 비활성화 후 재배치
    });

    // 줌 컨트롤을 우측 하단으로 재배치
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // 무료 OpenStreetMap 타일 레이어 등록
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
    }).addTo(map);

    // 마커 클러스터 그룹 초기화
    markerClusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      animate: true
    });

    map.addLayer(markerClusterGroup);
  }

  // ==========================================================================
  // 4. 커스텀 마커 & 팝업 생성
  // ==========================================================================
  function createCustomMarkerIcon(store) {
    const color = store.brandColor || '#2563eb';
    return L.divIcon({
      className: 'custom-pin-wrapper',
      html: `
        <div class="custom-pin-marker" style="background-color: ${color};">
          <div class="custom-pin-inner">🛒</div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -30]
    });
  }

  function createPopupContent(store) {
    const branchLabel = store.branch ? `<small>${escapeHtml(store.branch)}</small>` : '';
    const color = store.brandColor || '#2563eb';
    
    // 외부 길찾기 링크 (인코딩)
    const encodedDest = encodeURIComponent(`${store.name} ${store.branch}`.trim());
    const kakaoMapUrl = `https://map.kakao.com/link/to/${encodedDest},${store.lat},${store.lng}`;
    const naverMapUrl = `https://map.naver.com/v5/search/${encodedDest}`;

    return `
      <div class="popup-container">
        <div class="popup-header" style="background-color: ${color};">
          <span class="popup-brand-badge">${escapeHtml(store.brand)}</span>
          <span class="popup-gu-text">${escapeHtml(store.gu)} ${escapeHtml(store.dong)}</span>
        </div>
        <div class="popup-body">
          <div class="popup-title">
            ${escapeHtml(store.name)} ${branchLabel}
          </div>
          
          <div class="popup-info-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <div>
              <strong>도로명:</strong> ${escapeHtml(store.roadAddress || store.lotAddress)}
            </div>
          </div>

          ${store.lotAddress ? `
          <div class="popup-info-row" style="font-size: 0.76rem; color: #94a3b8;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>
            <div><strong>지번:</strong> ${escapeHtml(store.lotAddress)}</div>
          </div>` : ''}

          <div class="popup-actions">
            <button type="button" class="popup-btn popup-btn-copy" 
                    onclick="window.__copyAddress('${escapeForJs(store.roadAddress || store.lotAddress)}')">
              주소 복사
            </button>
            <a href="${kakaoMapUrl}" target="_blank" rel="noopener noreferrer" class="popup-btn popup-btn-nav">
              카카오맵 길찾기
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 5. 마커 렌더링 및 클러스터 반영
  // ==========================================================================
  function updateMapMarkers() {
    markerClusterGroup.clearLayers();
    state.markersMap.clear();

    const markersToAdd = [];

    state.filteredStores.forEach(store => {
      if (!store.lat || !store.lng) return;

      const marker = L.marker([store.lat, store.lng], {
        icon: createCustomMarkerIcon(store),
        title: `${store.name} ${store.branch || ''}`.trim()
      });

      marker.bindPopup(createPopupContent(store));

      // 마커 클릭 시 사이드바 연동
      marker.on('click', () => {
        selectStore(store.id, false); // 지도는 이미 클릭되었으므로 panTo 생략
      });

      state.markersMap.set(store.id, marker);
      markersToAdd.push(marker);
    });

    markerClusterGroup.addLayers(markersToAdd);

    // 필터링 결과가 있을 경우 지도를 해당 매장들이 모두 보이도록 영역 조정
    if (markersToAdd.length > 0 && (state.selectedBrand !== 'all' || state.selectedGu !== 'all' || state.searchQuery)) {
      const bounds = L.latLngBounds(markersToAdd.map(m => m.getLatLng()));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }

  // ==========================================================================
  // 6. 매장 목록 렌더링 (사이드바)
  // ==========================================================================
  function renderStoreList() {
    const container = dom.storeListContainer;

    if (state.filteredStores.length === 0) {
      container.innerHTML = `
        <div class="no-results-view">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="8" y1="12" x2="16" y2="12"></line>
          </svg>
          <p><strong>조건에 일치하는 매장이 없습니다.</strong></p>
          <span style="font-size: 0.8rem;">검색어나 필터 조건을 변경해 보세요.</span>
        </div>
      `;
      return;
    }

    const htmlCards = state.filteredStores.map(store => {
      const isSelected = store.id === state.selectedStoreId;
      const branchHtml = store.branch ? `<span class="branch-name">${escapeHtml(store.branch)}</span>` : '';
      const address = escapeHtml(store.roadAddress || store.lotAddress);

      return `
        <article class="store-card ${isSelected ? 'selected' : ''}" 
                 data-id="${escapeHtml(store.id)}" 
                 id="card-${escapeHtml(store.id)}"
                 tabindex="0"
                 role="button"
                 aria-label="${escapeHtml(store.name)} ${escapeHtml(store.branch)} 카드">
          <div class="card-top-row">
            <span class="card-brand-badge" style="background-color: ${store.brandColor};">
              ${escapeHtml(store.brand)}
            </span>
            <span class="card-gu-badge">${escapeHtml(store.gu)} ${escapeHtml(store.dong || '')}</span>
          </div>

          <div class="card-title">
            ${escapeHtml(store.name)} ${branchHtml}
          </div>

          <div class="card-address">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span>${address}</span>
          </div>

          <div class="card-footer-actions">
            <button type="button" class="btn-mini-action btn-copy-card" 
                    data-address="${escapeForJs(store.roadAddress || store.lotAddress)}">
              주소 복사
            </button>
            <button type="button" class="btn-mini-action btn-locate-card" 
                    data-id="${escapeHtml(store.id)}">
              지도 위치 보기
            </button>
          </div>
        </article>
      `;
    }).join('');

    container.innerHTML = htmlCards;
  }

  // ==========================================================================
  // 7. 필터 및 검색 처리 (Core Filtering Logic)
  // ==========================================================================
  function applyFilters() {
    const brand = state.selectedBrand;
    const gu = state.selectedGu;
    const query = state.searchQuery.toLowerCase().trim();

    state.filteredStores = state.allStores.filter(store => {
      // 1) 브랜드 필터
      if (brand !== 'all') {
        if (brand === '이마트' && !(store.brand === '이마트' || store.brand === '트레이더스' || store.brand === '이마트 에브리데이')) return false;
        else if (brand === '홈플러스' && !(store.brand === '홈플러스' || store.brand === '홈플러스 익스프레스')) return false;
        else if (brand !== '이마트' && brand !== '홈플러스' && store.brand !== brand) return false;
      }

      // 2) 구/군 필터
      if (gu !== 'all' && store.gu !== gu) {
        return false;
      }

      // 3) 검색어 필터 (상호명, 지점명, 도로명주소, 지번주소, 동이름)
      if (query) {
        const targetString = `${store.name} ${store.branch} ${store.roadAddress} ${store.lotAddress} ${store.gu} ${store.dong}`.toLowerCase();
        if (!targetString.includes(query)) {
          return false;
        }
      }

      return true;
    });

    // 통계 및 요약 텍스트 업데이트
    dom.resultCount.textContent = state.filteredStores.length;
    
    let filterText = [];
    if (brand !== 'all') filterText.push(brand);
    if (gu !== 'all') filterText.push(gu);
    if (query) filterText.push(`"${query}"`);
    dom.currentFilterDesc.textContent = filterText.length > 0 ? filterText.join(' · ') : '전체 매장';

    // UI 및 지도 마커 갱신
    renderStoreList();
    updateMapMarkers();
  }

  // ==========================================================================
  // 8. 매장 선택 인터랙션 (카드 클릭 or 마커 클릭)
  // ==========================================================================
  function selectStore(storeId, shouldPan = true) {
    state.selectedStoreId = storeId;
    const store = state.allStores.find(s => s.id === storeId);
    if (!store) return;

    // 1) 카드 하이라이트 & 스크롤
    document.querySelectorAll('.store-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.id === storeId);
    });

    const targetCard = document.getElementById(`card-${storeId}`);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 2) 지도 이동 및 팝업 오픈
    const marker = state.markersMap.get(storeId);
    if (marker) {
      if (shouldPan) {
        map.flyTo([store.lat, store.lng], 15, {
          duration: 1.0,
          easeLinearity: 0.25
        });
      }

      // 클러스터 안에 있는 마커인 경우 spiderfy/zoom 후 팝업 오픈
      markerClusterGroup.zoomToShowLayer(marker, () => {
        marker.openPopup();
      });
    }
  }

  // ==========================================================================
  // 9. 브랜드 필터 칩 렌더링
  // ==========================================================================
  function initBrandChips() {
    const brands = [
      { id: 'all', label: '전체' },
      { id: '이마트', label: '이마트 계열' },
      { id: '홈플러스', label: '홈플러스' },
      { id: '롯데마트', label: '롯데마트' },
      { id: '메가마트', label: '메가마트' },
      { id: '농협 하나로마트', label: '하나로마트' },
      { id: '서원유통 탑마트', label: '탑마트' },
      { id: '기타 마트', label: '기타 마트' }
    ];

    const chipsHtml = brands.map(b => {
      const isActive = state.selectedBrand === b.id;
      let count = 0;
      if (b.id === 'all') {
        count = state.allStores.length;
      } else if (b.id === '이마트') {
        count = state.allStores.filter(s => s.brand === '이마트' || s.brand === '트레이더스' || s.brand === '이마트 에브리데이').length;
      } else if (b.id === '홈플러스') {
        count = state.allStores.filter(s => s.brand === '홈플러스' || s.brand === '홈플러스 익스프레스').length;
      } else {
        count = state.allStores.filter(s => s.brand === b.id).length;
      }

      const color = BRAND_META[b.id] ? BRAND_META[b.id].color : '#64748b';

      return `
        <button type="button" class="brand-chip ${isActive ? 'active' : ''}" data-brand="${escapeHtml(b.id)}">
          <span class="chip-dot" style="background-color: ${color};"></span>
          <span>${escapeHtml(b.label)}</span>
          <span class="chip-count">(${count})</span>
        </button>
      `;
    }).join('');

    dom.brandChipsContainer.innerHTML = chipsHtml;
  }

  // ==========================================================================
  // 10. 구/군 드롭다운 옵션 렌더링
  // ==========================================================================
  function initGuOptions() {
    const gus = new Set();
    state.allStores.forEach(s => {
      if (s.gu && s.gu.trim()) gus.add(s.gu.trim());
    });

    const sortedGus = Array.from(gus).sort((a, b) => a.localeCompare(b, 'ko'));
    const optionsHtml = ['<option value="all">부산광역시 전체 구/군</option>']
      .concat(sortedGus.map(gu => `<option value="${escapeHtml(gu)}">${escapeHtml(gu)}</option>`))
      .join('');

    dom.guSelect.innerHTML = optionsHtml;
  }

  // ==========================================================================
  // 11. 이벤트 바인딩 (Event Listeners & Delegation)
  // ==========================================================================
  function bindEvents() {
    // 1) 브랜드 칩 클릭
    dom.brandChipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.brand-chip');
      if (!chip) return;

      const brand = chip.dataset.brand;
      state.selectedBrand = brand;

      // 칩 액티브 클래스 토글
      dom.brandChipsContainer.querySelectorAll('.brand-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.brand === brand);
      });

      applyFilters();
    });

    // 2) 구/군 셀렉트 변경
    dom.guSelect.addEventListener('change', (e) => {
      state.selectedGu = e.target.value;
      applyFilters();
    });

    // 3) 검색어 입력 (200ms 디바운스 적용)
    let searchDebounceTimer = null;
    dom.searchInput.addEventListener('input', (e) => {
      const value = e.target.value;
      dom.searchClearBtn.style.display = value ? 'flex' : 'none';

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        state.searchQuery = value;
        applyFilters();
      }, 200);
    });

    // 검색어 지우기 버튼
    dom.searchClearBtn.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.searchClearBtn.style.display = 'none';
      state.searchQuery = '';
      applyFilters();
      dom.searchInput.focus();
    });

    // 4) 필터 초기화 링크
    dom.btnResetFilters.addEventListener('click', () => {
      state.selectedBrand = 'all';
      state.selectedGu = 'all';
      state.searchQuery = '';
      dom.searchInput.value = '';
      dom.searchClearBtn.style.display = 'none';
      dom.guSelect.value = 'all';

      dom.brandChipsContainer.querySelectorAll('.brand-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.brand === 'all');
      });

      applyFilters();
      resetMapView();
    });

    // 5) 사이드바 매장 카드 클릭 (이벤트 위임)
    dom.storeListContainer.addEventListener('click', (e) => {
      // 주소 복사 버튼 클릭
      const copyBtn = e.target.closest('.btn-copy-card');
      if (copyBtn) {
        e.stopPropagation();
        const address = copyBtn.dataset.address;
        copyAddressToClipboard(address);
        return;
      }

      // 카드 본체 또는 위치보기 버튼 클릭
      const card = e.target.closest('.store-card');
      if (card) {
        const storeId = card.dataset.id;
        selectStore(storeId, true);
      }
    });

    // 6) 키보드 접근성 (Enter/Space on card)
    dom.storeListContainer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.store-card');
        if (card) {
          e.preventDefault();
          selectStore(card.dataset.id, true);
        }
      }
    });

    // 7) 플로팅 컨트롤: 부산 전도 보기
    dom.btnResetMap.addEventListener('click', () => {
      resetMapView();
    });

    // 8) 플로팅 컨트롤: 내 위치 찾기
    dom.btnMyLocation.addEventListener('click', () => {
      locateUser();
    });

    // 9) 모바일 사이드바 토글 버튼
    dom.btnToggleSidebar.addEventListener('click', () => {
      const isCollapsed = dom.sidebarPanel.classList.toggle('collapsed');
      dom.btnToggleSidebar.textContent = isCollapsed ? '목록 열기' : '목록 접기';
    });
  }

  // ==========================================================================
  // 12. 유틸리티 함수 (클립보드, 내 위치, 이스케이프)
  // ==========================================================================
  function resetMapView() {
    map.flyTo(BUSAN_CENTER, DEFAULT_ZOOM, {
      duration: 1.0,
      easeLinearity: 0.25
    });
  }

  function locateUser() {
    if (!navigator.geolocation) {
      showToast('브라우저가 위치 정보를 지원하지 않습니다.');
      return;
    }

    showToast('현재 위치를 확인하는 중입니다...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (userLocationMarker) {
          map.removeLayer(userLocationMarker);
        }

        userLocationMarker = L.circleMarker([lat, lng], {
          radius: 8,
          fillColor: '#3b82f6',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9
        }).addTo(map);

        userLocationMarker.bindPopup('<strong>📍 현재 위치</strong>').openPopup();

        map.flyTo([lat, lng], 14, { duration: 1.2 });
        showToast('현재 위치로 이동했습니다.');
      },
      (err) => {
        console.warn('Geolocation Error:', err);
        showToast('위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해 주세요.');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }

  function copyAddressToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(`주소가 복사되었습니다: ${text}`);
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(`주소가 복사되었습니다: ${text}`);
    } catch (e) {
      showToast('주소 복사에 실패했습니다.');
    }
    document.body.removeChild(textArea);
  }

  let toastTimer = null;
  function showToast(message) {
    dom.toastMessage.textContent = message;
    dom.toastNotice.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toastNotice.classList.remove('show');
    }, 2500);
  }

  // 전역 팝업용 헬퍼 등록
  window.__copyAddress = copyAddressToClipboard;

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeForJs(str) {
    if (str == null) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  // ==========================================================================
  // 13. 초기 진입점 (Bootstrap App)
  // ==========================================================================
  function initApp() {
    // 1. 임베디드 데이터 로드
    state.allStores = window.STORES_DATA || [];
    state.filteredStores = [...state.allStores];

    // 헤더 통계 표시
    if (dom.headerTotalCount) {
      dom.headerTotalCount.textContent = state.allStores.length;
    }

    // 2. 지도 생성
    initMap();

    // 3. UI 컴포넌트 초기화
    initBrandChips();
    initGuOptions();

    // 4. 이벤트 바인딩
    bindEvents();

    // 5. 초기 마커 및 목록 렌더링
    applyFilters();

    console.log(`[Busan Supermarket Map] Successfully loaded ${state.allStores.length} stores.`);
  }

  // DOM 로드 완료 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
