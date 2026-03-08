(function () {
  const SEARCH_RADIUS = 10000; // meters
  const OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  const LOADING_MESSAGES = [
    'Tracing the light\u2026',
    'Mapping the eternal\u2026',
    'Reading the stones\u2026',
    'Chasing golden hour\u2026',
    'Finding quiet places\u2026',
  ];

  const overlay = document.getElementById('loading-overlay');
  const loadingMsg = overlay.querySelector('.loading-msg');
  const statusEl = document.getElementById('status');
  const listEl = document.getElementById('cemetery-list');
  const detailPanel = document.getElementById('detail-panel');
  const detailName = document.getElementById('detail-name');
  const detailMeta = document.getElementById('detail-meta');
  const detailEmbed = document.getElementById('detail-embed');
  const detailLinks = document.getElementById('detail-links');
  const detailBack = document.getElementById('detail-back');

  const sunArcEl = document.getElementById('sun-arc');
  const compassView = document.getElementById('compass-view');
  const compassToggle = document.getElementById('compass-toggle');
  const skyGradient = document.getElementById('sky-gradient');
  const sunDot = skyGradient.querySelector('.sun-dot');
  const appTitle = document.getElementById('app-title');
  const modeToggleEl = document.getElementById('mode-toggle');

  let mode = 'sunset'; // 'sunset' or 'sunrise'
  let countdownInterval = null;

  // Rotate loading messages
  let loadingMsgIdx = 0;
  const loadingMsgTimer = setInterval(() => {
    loadingMsgIdx = (loadingMsgIdx + 1) % LOADING_MESSAGES.length;
    if (loadingMsg) loadingMsg.textContent = LOADING_MESSAGES[loadingMsgIdx];
  }, 2500);

  detailBack.addEventListener('click', closeDetail);

  modeToggleEl.addEventListener('click', () => {
    mode = mode === 'sunset' ? 'sunrise' : 'sunset';
    modeToggleEl.textContent = mode;
    appTitle.textContent = mode === 'sunset' ? 'Cemetery Sunsets' : 'Cemetery Sunrises';
    document.title = appTitle.textContent;
    document.body.classList.toggle('sunrise', mode === 'sunrise');
    if (allCemeteries.length > 0) {
      listEl.innerHTML = '';
      renderCemeteries(allCemeteries);
      renderSunArc(allCemeteries, userLat, userLng);
      renderCompass(allCemeteries, userLat, userLng);
      updateCountdown();
    }
  });

  let map;
  let userLat, userLng;
  let allCemeteries = [];
  let updateTimer = null;
  let compassInitialized = false;
  let compassTooltip = null;
  let compassAbort = null;
  let beamLayers = [];

  // --- Entry point ---
  getLocation();

  function getLocation() {
    if (!navigator.geolocation) {
      return showError('Geolocation not supported by your browser.');
    }
    navigator.geolocation.getCurrentPosition(onLocation, onLocationError, {
      enableHighAccuracy: false,
      timeout: 10000,
    });
  }

  function onLocation(pos) {
    const { latitude: lat, longitude: lng } = pos.coords;
    userLat = lat;
    userLng = lng;
    statusEl.textContent = 'Searching nearby cemeteries\u2026';
    initMap(lat, lng);
    fetchCemeteries(lat, lng);
    initSkyGradient(lat, lng);
  }

  function onLocationError(err) {
    hideOverlay();
    const msgs = {
      1: 'Location access denied. Please allow location access and reload.',
      2: 'Location unavailable. Try again later.',
      3: 'Location request timed out. Try again.',
    };
    showError(msgs[err.code] || 'Could not get your location.');
  }

  // --- Map ---
  function initMap(lat, lng) {
    map = L.map('map', { zoomControl: false }).setView([lat, lng], 13);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    // Warm light tiles — CartoDB Voyager
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 20,
      subdomains: 'abcd',
    }).addTo(map);

    // User marker
    L.marker([lat, lng], {
      icon: L.divIcon({ className: 'user-marker', iconSize: [16, 16] }),
      zIndexOffset: 1000,
    })
      .addTo(map)
      .bindPopup('You are here');
  }

  // --- Overpass ---
  function fetchCemeteries(lat, lng) {
    const query = `[out:json][timeout:25];
(
  node["landuse"="cemetery"](around:${SEARCH_RADIUS},${lat},${lng});
  way["landuse"="cemetery"](around:${SEARCH_RADIUS},${lat},${lng});
  relation["landuse"="cemetery"](around:${SEARCH_RADIUS},${lat},${lng});
  node["amenity"="grave_yard"](around:${SEARCH_RADIUS},${lat},${lng});
  way["amenity"="grave_yard"](around:${SEARCH_RADIUS},${lat},${lng});
  relation["amenity"="grave_yard"](around:${SEARCH_RADIUS},${lat},${lng});
);
out center;`;

    const body = 'data=' + encodeURIComponent(query);
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    function tryFetch(urlIdx) {
      if (urlIdx >= OVERPASS_URLS.length) {
        hideOverlay();
        showError('All Overpass servers failed. Try reloading in a minute.');
        return;
      }
      fetch(OVERPASS_URLS[urlIdx], { method: 'POST', body, headers })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data) => processCemeteries(data.elements, lat, lng))
        .catch((e) => {
          console.warn(`Overpass ${urlIdx} failed: ${e.message}, trying next`);
          tryFetch(urlIdx + 1);
        });
    }
    tryFetch(0);
  }

  // --- Process results ---
  function processCemeteries(elements, userLat, userLng) {
    hideOverlay();
    clearInterval(loadingMsgTimer);

    // Deduplicate by extracting lat/lng + computing sunset
    const cemeteries = elements
      .map((el) => {
        const lat = el.lat || (el.center && el.center.lat);
        const lng = el.lon || (el.center && el.center.lon);
        if (!lat || !lng) return null;

        const name = (el.tags && el.tags.name) || 'Unnamed Cemetery';
        const dist = haversine(userLat, userLng, lat, lng);
        const times = SunCalc.getTimes(new Date(), lat, lng);

        return { name, lat, lng, dist, sunset: times.sunset, sunrise: times.sunrise };
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist);

    // Deduplicate by proximity (within 50m)
    const unique = [];
    for (const c of cemeteries) {
      const dup = unique.some((u) => haversine(u.lat, u.lng, c.lat, c.lng) < 0.05);
      if (!dup) unique.push(c);
    }

    if (unique.length === 0) {
      statusEl.textContent = 'No cemeteries found within 10 km.';
      return;
    }

    allCemeteries = unique;
    renderCemeteries(unique);
    renderLightBeams(unique);
    renderSunArc(unique, userLat, userLng);
    renderCompass(unique, userLat, userLng);
    initCompassToggle();
    initKeyboardNav();
    startCountdown();
  }

  // --- Sunset countdown ---
  function startCountdown() {
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 15000);
  }

  function updateCountdown() {
    if (allCemeteries.length === 0) return;
    const now = new Date();
    const times = SunCalc.getTimes(now, userLat, userLng);
    const event = times[mode];
    const diff = event - now;
    const label = mode === 'sunset' ? 'Sunset' : 'Sunrise';

    let countdownText;
    if (diff > 0) {
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      countdownText = `${label} in <span class="countdown-time">${timeStr}</span>`;
      document.title = `${label} in ${timeStr} \u2014 Cemetery ${label}s`;
    } else {
      const ago = Math.abs(diff);
      const m = Math.floor(ago / 60000);
      const timeStr = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
      countdownText = `${label} was <span class="countdown-time">${timeStr} ago</span>`;
      document.title = `${label} ${timeStr} ago \u2014 Cemetery ${label}s`;
    }
    statusEl.innerHTML = `${allCemeteries.length} cemeteries \u00b7 ${countdownText}`;
  }

  // --- Render ---
  function renderCemeteries(cemeteries) {
    const markers = [];
    const modeLabel = mode === 'sunset' ? 'Sunset' : 'Sunrise';

    // Find "next" cemetery — nearest upcoming event
    const now = new Date();
    let nextIdx = -1;
    let nextDiff = Infinity;
    cemeteries.forEach((c, i) => {
      const diff = c[mode] - now;
      if (diff > 0 && diff < nextDiff) {
        nextDiff = diff;
        nextIdx = i;
      }
    });

    cemeteries.forEach((c, i) => {
      const timeStr = formatTime(c[mode]);

      // Map marker
      const marker = L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: 'cemetery-marker', iconSize: [14, 14] }),
      }).addTo(map);

      const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
      marker.bindPopup(
        `<div class="popup-name">${esc(c.name)}</div>` +
          `<div class="popup-sunset">${modeLabel}: ${timeStr}</div>` +
          `<div style="font-size:0.8rem;color:#8a8a9a;margin-top:4px">${formatDist(c.dist)} away</div>` +
          `<a href="${gmapsUrl}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;color:var(--accent);font-size:0.82rem;">Open in Google Maps &rarr;</a>`
      );

      markers.push(marker);

      // Sidebar item
      const li = document.createElement('li');
      li.style.animationDelay = `${i * 0.06}s`;
      const isNext = i === nextIdx;
      if (isNext) li.classList.add('next-cemetery');

      li.innerHTML =
        `<div class="name">${esc(c.name)}${isNext ? '<span class="next-badge">next</span>' : ''}</div>` +
        `<div class="meta">` +
        `<span class="sunset-time">${modeLabel} ${timeStr}</span>` +
        `<span>${formatDist(c.dist)}</span>` +
        `</div>`;
      li.addEventListener('click', () => {
        map.flyTo([c.lat, c.lng], 16, { duration: 1.2 });
        marker.openPopup();
        openDetail(c, timeStr);
      });
      listEl.appendChild(li);
    });

    // Fit map to show all markers + user location
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.15));
    }
  }

  // --- Detail panel ---
  function openDetail(c, timeStr) {
    const modeLabel = mode === 'sunset' ? 'Sunset' : 'Sunrise';
    detailName.textContent = c.name;
    detailMeta.innerHTML =
      `<span class="sunset-time">${modeLabel} ${timeStr}</span>` +
      `<span>${formatDist(c.dist)} away</span>`;

    // Google Maps satellite embed (free, no key)
    detailEmbed.innerHTML =
      `<iframe src="https://maps.google.com/maps?q=${c.lat},${c.lng}&t=k&z=17&output=embed" ` +
      `loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe>`;

    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
    const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${c.lat},${c.lng}`;
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;

    const iconMap = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`;
    const iconEye = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const iconDir = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;

    detailLinks.innerHTML =
      `<a href="${gmapsUrl}" target="_blank" rel="noopener">` +
      `<span class="link-icon">${iconMap}</span> View on Google Maps</a>` +
      `<a href="${streetViewUrl}" target="_blank" rel="noopener">` +
      `<span class="link-icon">${iconEye}</span> Street View</a>` +
      `<a href="${directionsUrl}" target="_blank" rel="noopener">` +
      `<span class="link-icon">${iconDir}</span> Get Directions</a>`;

    detailPanel.classList.remove('hidden');
  }

  function closeDetail() {
    detailPanel.classList.add('hidden');
    detailEmbed.innerHTML = ''; // stop iframe
  }

  // --- Keyboard navigation ---
  function initKeyboardNav() {
    let selectedIdx = -1;

    document.addEventListener('keydown', (e) => {
      const items = listEl.querySelectorAll('li');
      if (!items.length) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.key === 'ArrowDown') {
          selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
        } else {
          selectedIdx = Math.max(selectedIdx - 1, 0);
        }
        items.forEach((li) => li.style.background = '');
        items[selectedIdx].style.background = 'var(--accent-bg)';
        items[selectedIdx].scrollIntoView({ block: 'nearest' });
      }

      if (e.key === 'Enter' && selectedIdx >= 0) {
        items[selectedIdx].click();
      }

      if (e.key === 'Escape') {
        if (!detailPanel.classList.contains('hidden')) {
          closeDetail();
        }
      }

      if (e.key === 'c' || e.key === 'C') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        compassToggle.click();
      }
    });
  }

  // --- Helpers ---
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDist(km) {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showError(msg) {
    statusEl.innerHTML = `<div class="error-msg">${esc(msg)}</div>`;
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  // ============================================
  // Feature 1: Live Sky Gradient
  // ============================================
  function initSkyGradient(lat, lng) {
    updateSkyGradient(lat, lng);
    if (!updateTimer) {
      updateTimer = setInterval(() => {
        updateSkyGradient(lat, lng);
        updateLightBeams();
        updateSunArc(lat, lng);
      }, 60000);
    }
  }

  function updateSkyGradient(lat, lng) {
    const now = new Date();
    const pos = SunCalc.getPosition(now, lat, lng);
    const alt = pos.altitude; // radians, negative = below horizon

    // Map altitude to gradient
    let gradient, dotTop, dotOpacity;
    const altDeg = alt * (180 / Math.PI);

    if (altDeg > 10) {
      // Day
      gradient = 'linear-gradient(to bottom, #1e90ff, #87ceeb, #b0d4f1)';
    } else if (altDeg > 1) {
      // Golden hour
      gradient = 'linear-gradient(to bottom, #4a90d9, #f0a050, #e87040)';
    } else if (altDeg > -6) {
      // Civil twilight / sunset
      gradient = 'linear-gradient(to bottom, #2a1a4a, #c05040, #f0a050)';
    } else if (altDeg > -12) {
      // Nautical twilight
      gradient = 'linear-gradient(to bottom, #1a1030, #3a2060, #6a3060)';
    } else {
      // Night
      gradient = 'linear-gradient(to bottom, #0a0a1a, #141428, #1a1a2e)';
    }

    skyGradient.style.background = gradient;

    // Sun dot position: map altitude from -20..90 deg to 100%..0%
    const pct = Math.max(0, Math.min(1, (altDeg + 20) / 110));
    dotTop = (1 - pct) * 100;
    dotOpacity = altDeg < -12 ? 0 : altDeg < -6 ? 0.3 : 1;

    sunDot.style.top = `${dotTop}%`;
    sunDot.style.opacity = dotOpacity;
  }

  // ============================================
  // Feature 2: Sun Path Arc + Golden Hour Band
  // ============================================
  function renderSunArc(cemeteries, lat, lng) {
    const now = new Date();
    const times = SunCalc.getTimes(now, lat, lng);
    const sunrise = times.sunrise;
    const sunset = times.sunset;
    const goldenHourStart = times.goldenHour; // evening golden hour start
    const goldenHourEnd = sunset;

    const W = 300, H = 95;
    const cx = W / 2, cy = H - 10;
    const r = 120;

    // Arc from left to right (180 deg to 0 deg)
    const arcStartX = cx - r;
    const arcEndX = cx + r;

    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    // Glow filter
    svg += `<defs><filter id="sun-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs>`;

    // Arc path (semicircle)
    svg += `<path class="arc-path" d="M ${arcStartX} ${cy} A ${r} ${r} 0 0 1 ${arcEndX} ${cy}"/>`;

    // Golden hour band
    if (goldenHourStart && goldenHourEnd) {
      const ghStartProg = Math.max(0, Math.min(1, (goldenHourStart - sunrise) / (sunset - sunrise)));
      const ghEndProg = 1; // sunset
      const ghStartAngle = Math.PI - ghStartProg * Math.PI;
      const ghEndAngle = Math.PI - ghEndProg * Math.PI;
      const ghStartX = cx + r * Math.cos(ghStartAngle);
      const ghStartY = cy - r * Math.sin(ghStartAngle);
      const ghEndX = cx + r * Math.cos(ghEndAngle);
      const ghEndY = cy - r * Math.sin(ghEndAngle);
      const ghLargeArc = (ghEndProg - ghStartProg) > 0.5 ? 1 : 0;
      svg += `<path class="golden-hour-arc" d="M ${ghStartX} ${ghStartY} A ${r} ${r} 0 ${ghLargeArc} 1 ${ghEndX} ${ghEndY}"/>`;
    }

    // Progress arc + sun position
    const progress = Math.max(0, Math.min(1, (now - sunrise) / (sunset - sunrise)));
    if (progress > 0 && progress < 1) {
      const angle = Math.PI - progress * Math.PI; // pi..0
      const sunX = cx + r * Math.cos(angle);
      const sunY = cy - r * Math.sin(angle);

      // Progress arc
      const largeArc = progress > 0.5 ? 1 : 0;
      svg += `<path class="arc-progress" d="M ${arcStartX} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${sunX} ${sunY}"/>`;

      // Sun marker
      svg += `<circle class="sun-marker" cx="${sunX}" cy="${sunY}" r="5" filter="url(#sun-glow)"/>`;

      // "now" label
      const labelY = sunY - 12;
      svg += `<text x="${sunX}" y="${labelY}" text-anchor="middle" class="arc-label" font-size="9">now</text>`;
    } else if (progress <= 0) {
      // Before sunrise: dim sun at left
      svg += `<circle cx="${arcStartX - 8}" cy="${cy}" r="4" fill="#ffe066" opacity="0.3"/>`;
    } else {
      // After sunset: dim sun at right, full progress
      svg += `<path class="arc-progress" d="M ${arcStartX} ${cy} A ${r} ${r} 0 0 1 ${arcEndX} ${cy}"/>`;
      svg += `<circle cx="${arcEndX + 8}" cy="${cy}" r="4" fill="#6a5a7a" opacity="0.5"/>`;
    }

    // Cemetery event ticks
    cemeteries.forEach((c) => {
      const cProg = Math.max(0, Math.min(1, (c[mode] - sunrise) / (sunset - sunrise)));
      const cAngle = Math.PI - cProg * Math.PI;
      const tx = cx + r * Math.cos(cAngle);
      const ty = cy - r * Math.sin(cAngle);
      svg += `<circle class="cemetery-tick" cx="${tx}" cy="${ty}" r="2.5"/>`;
    });

    // Labels
    svg += `<text x="${arcStartX}" y="${cy + 14}" text-anchor="middle" class="arc-label">${formatTime(sunrise)}</text>`;
    svg += `<text x="${arcEndX}" y="${cy + 14}" text-anchor="middle" class="arc-label">${formatTime(sunset)}</text>`;

    svg += `</svg>`;
    sunArcEl.innerHTML = svg;
  }

  function updateSunArc(lat, lng) {
    if (allCemeteries.length > 0) {
      renderSunArc(allCemeteries, lat, lng);
    }
  }

  // ============================================
  // Feature 3: Map Light Beam Projections
  // ============================================
  function destinationPoint(lat, lng, bearingDeg, distKm) {
    const R = 6371;
    const d = distKm / R;
    const brng = toRad(bearingDeg);
    const lat1 = toRad(lat);
    const lng1 = toRad(lng);
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    );
    const lng2 = lng1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
    return [lat2 * (180 / Math.PI), lng2 * (180 / Math.PI)];
  }

  // ---- Shadow Projections ----
  function renderLightBeams(cemeteries) {
    beamLayers.forEach((l) => map.removeLayer(l));
    beamLayers = [];

    const now = new Date();
    const baseLengthKm = 1.5;
    const maxLengthKm = 5;
    const shadowSpreadDeg = 15;
    const sunBeamSpreadDeg = 8;
    const layerSteps = [0.2, 0.4, 0.6, 0.8, 1.0];
    const shadowOpacities = [0.5, 0.38, 0.25, 0.15, 0.08];
    const sunBeamOpacityScale = 0.7;

    cemeteries.forEach((c) => {
      const pos = SunCalc.getPosition(now, c.lat, c.lng);
      const altDeg = pos.altitude * (180 / Math.PI);

      if (altDeg < -6) return;

      // azDeg = bearing TO sun from north, clockwise
      const azDeg = (pos.azimuth * (180 / Math.PI) + 180) % 360;

      // Shadow points away from sun
      const shadowBearing = (azDeg + 180) % 360;

      // Length inversely proportional to altitude
      const clampedAlt = Math.max(pos.altitude, 0.03);
      const length = Math.min(baseLengthKm / Math.tan(clampedAlt), maxLengthKm);

      // Shadow color based on altitude
      let shadowColor;
      if (altDeg <= 0) shadowColor = '#8a4070';
      else if (altDeg <= 10) shadowColor = '#d08030';
      else shadowColor = '#e0a030';

      // Incoming sun beam color (paler)
      let sunBeamColor;
      if (altDeg <= 0) sunBeamColor = '#6a3050';
      else if (altDeg <= 10) sunBeamColor = '#d09030';
      else sunBeamColor = '#e8b040';

      // Fade opacity for twilight
      const altFade = altDeg < 0 ? Math.max(0, (altDeg + 6) / 6) : 1;

      // Shadow cone — wider, longer, points away from sun
      layerSteps.forEach((pct, i) => {
        const layerLen = length * pct;
        const p1 = destinationPoint(c.lat, c.lng, shadowBearing - shadowSpreadDeg * pct, layerLen);
        const p2 = destinationPoint(c.lat, c.lng, shadowBearing + shadowSpreadDeg * pct, layerLen);
        const poly = L.polygon(
          [[c.lat, c.lng], p1, p2],
          {
            color: shadowColor,
            fillColor: shadowColor,
            fillOpacity: shadowOpacities[i] * altFade,
            weight: 0,
            interactive: false,
          }
        ).addTo(map);
        beamLayers.push(poly);
      });

      // Incoming sun beam — thinner, shorter, points toward sun
      const sunBeamLength = length * 0.6;
      layerSteps.forEach((pct, i) => {
        const layerLen = sunBeamLength * pct;
        const p1 = destinationPoint(c.lat, c.lng, azDeg - sunBeamSpreadDeg * pct, layerLen);
        const p2 = destinationPoint(c.lat, c.lng, azDeg + sunBeamSpreadDeg * pct, layerLen);
        const poly = L.polygon(
          [[c.lat, c.lng], p1, p2],
          {
            color: sunBeamColor,
            fillColor: sunBeamColor,
            fillOpacity: shadowOpacities[i] * sunBeamOpacityScale * altFade,
            weight: 0,
            interactive: false,
          }
        ).addTo(map);
        beamLayers.push(poly);
      });
    });
  }

  function updateLightBeams() {
    if (allCemeteries.length > 0) {
      renderLightBeams(allCemeteries);
    }
  }

  // ============================================
  // Feature 4: Radial Compass Plot
  // ============================================
  function bearing(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    const brng = Math.atan2(y, x) * (180 / Math.PI);
    return (brng + 360) % 360;
  }

  function renderCompass(cemeteries, lat, lng) {
    const size = 280;
    const cx = size / 2, cy = size / 2;
    const plotR = size / 2 - 30;

    const maxDist = Math.max(...cemeteries.map((c) => c.dist), 1);
    const sunsetTimes = cemeteries.map((c) => c[mode].getTime());
    const minSunset = Math.min(...sunsetTimes);
    const maxSunset = Math.max(...sunsetTimes);
    const sunsetRange = maxSunset - minSunset || 1;

    // Distance rings
    const ringDistances = [2, 5, 10].filter((d) => d <= maxDist * 1.2);

    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;

    // Concentric rings
    ringDistances.forEach((d) => {
      const rr = (d / maxDist) * plotR;
      if (rr > 0 && rr <= plotR) {
        svg += `<circle class="compass-ring" cx="${cx}" cy="${cy}" r="${rr}"/>`;
        svg += `<text x="${cx + 3}" y="${cy - rr + 2}" class="compass-label" text-anchor="start" font-size="8" opacity="0.5">${d}km</text>`;
      }
    });
    // Outer ring
    svg += `<circle class="compass-ring" cx="${cx}" cy="${cy}" r="${plotR}" stroke-opacity="0.12"/>`;

    // Cross lines
    svg += `<line x1="${cx}" y1="${cy - plotR - 5}" x2="${cx}" y2="${cy + plotR + 5}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;
    svg += `<line x1="${cx - plotR - 5}" y1="${cy}" x2="${cx + plotR + 5}" y2="${cy}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;

    // N/E/S/W labels
    svg += `<text x="${cx}" y="${cy - plotR - 8}" class="compass-label">N</text>`;
    svg += `<text x="${cx + plotR + 10}" y="${cy + 1}" class="compass-label">E</text>`;
    svg += `<text x="${cx}" y="${cy + plotR + 16}" class="compass-label">S</text>`;
    svg += `<text x="${cx - plotR - 10}" y="${cy + 1}" class="compass-label">W</text>`;

    // Cemetery dots
    cemeteries.forEach((c, i) => {
      const b = bearing(lat, lng, c.lat, c.lng);
      const bRad = toRad(b - 90); // rotate so N is up
      const dist = Math.min(c.dist / maxDist, 1) * plotR;

      const dotX = cx + dist * Math.cos(bRad);
      const dotY = cy + dist * Math.sin(bRad);

      // Color: gold→purple by event time
      const t = (c[mode].getTime() - minSunset) / sunsetRange;
      const color = sunsetColor(t);

      svg += `<circle class="compass-dot" cx="${dotX}" cy="${dotY}" r="5" fill="${color}" data-idx="${i}"/>`;
    });

    svg += `</svg>`;
    compassView.innerHTML = svg;

    // Clean up previous listeners/tooltip
    if (compassTooltip) compassTooltip.remove();
    if (compassAbort) compassAbort.abort();
    compassAbort = new AbortController();
    const signal = compassAbort.signal;

    const tooltip = document.createElement('div');
    tooltip.className = 'compass-tooltip';
    document.getElementById('sidebar').appendChild(tooltip);
    compassTooltip = tooltip;

    // Event delegation
    compassView.addEventListener('mousemove', (e) => {
      const dot = e.target.closest('.compass-dot');
      if (dot) {
        const idx = parseInt(dot.dataset.idx, 10);
        const c = cemeteries[idx];
        const label = mode === 'sunset' ? 'Sunset' : 'Sunrise';
        tooltip.textContent = `${c.name} \u2014 ${label} ${formatTime(c[mode])}`;
        tooltip.classList.add('visible');
        const rect = compassView.getBoundingClientRect();
        tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
        tooltip.style.top = (e.clientY - rect.top - 30) + 'px';
      } else {
        tooltip.classList.remove('visible');
      }
    }, { signal });

    compassView.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    }, { signal });

    compassView.addEventListener('click', (e) => {
      const dot = e.target.closest('.compass-dot');
      if (dot) {
        const idx = parseInt(dot.dataset.idx, 10);
        const c = cemeteries[idx];
        map.flyTo([c.lat, c.lng], 16, { duration: 1.2 });
        openDetail(c, formatTime(c[mode]));
      }
    }, { signal });
  }

  function sunsetColor(t) {
    // t: 0 (earliest) → 1 (latest), gold → purple
    const r = Math.round(240 - t * 120);
    const g = Math.round(160 - t * 100);
    const b = Math.round(80 + t * 60);
    return `rgb(${r},${g},${b})`;
  }

  function initCompassToggle() {
    if (compassInitialized) return;
    compassInitialized = true;
    let showing = false;
    compassToggle.addEventListener('click', () => {
      showing = !showing;
      compassToggle.classList.toggle('active', showing);
      listEl.style.display = showing ? 'none' : '';
      compassView.classList.toggle('hidden', !showing);
    });
  }
})();
