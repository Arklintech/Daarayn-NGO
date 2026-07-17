const fs = require('fs');

const payHtmlPath = 'c:/Users/NEXAWAVE/Desktop/NGO/public/pay.html';
let html = fs.readFileSync(payHtmlPath, 'utf8');

const newHeader = `  <div class="daarayn-navbar-container" style="position: relative; padding: 24px 32px; z-index: 50; display: flex; justify-content: center; background-color: #030a06;">
    <nav class="daarayn-navbar" style="width: 100%; max-width: 1400px; height: 72px; background: rgba(10, 20, 38, 0.65); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);">
      
      <!-- Left: Logo -->
      <a href="/#home" class="daarayn-logo-container" style="display: flex; align-items: center; gap: 12px; text-decoration: none;">
        <img src="./brand logo1.png" alt="Daarayn Aid Logo" class="daarayn-logo-icon" style="width: 56px; height: 56px; object-fit: contain;" />
        <div class="daarayn-logo-text" style="display: flex; flex-direction: column;">
          <span class="daarayn-logo-title" style="font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 600; letter-spacing: 0.5px; color: #fff; line-height: 1.1;">DAARAYN</span>
          <span class="daarayn-logo-subtitle" style="font-size: 10px; font-weight: 300; letter-spacing: 1.5px; color: rgba(255, 255, 255, 0.7); text-transform: uppercase;">FOUNDATION</span>
        </div>
      </a>

      <!-- Middle: Links -->
      <div class="daarayn-nav-links" style="display: flex; align-items: center; gap: 32px;">
        <a href="/#home" class="daarayn-nav-link" style="font-size: 14px; font-weight: 400; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 6px; white-space: nowrap;">Home</a>
        <a href="/#family" class="daarayn-nav-link" style="font-size: 14px; font-weight: 400; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 6px; white-space: nowrap;">Family Relief</a>
        <a href="/#quran" class="daarayn-nav-link" style="font-size: 14px; font-weight: 400; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 6px; white-space: nowrap;">Qur'an Endowment</a>
        <a href="/#masjid" class="daarayn-nav-link" style="font-size: 14px; font-weight: 400; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 6px; white-space: nowrap;">Masjid Fund</a>
        <div class="daarayn-nav-dropdown">
          <a href="/#about" class="daarayn-nav-link" style="font-size: 14px; font-weight: 400; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 6px; white-space: nowrap;">About Us 
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron-down" style="opacity: 0.7;"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </a>
        </div>
      </div>

      <!-- Right: Actions -->
      <div class="daarayn-nav-actions" style="display: flex; align-items: center; gap: 20px;">
        <a href="/#quick-donate" class="btn btn-outline nav-cta">← Back</a>
      </div>
    </nav>
  </div>`;

// Replace the old header
html = html.replace(/<header class="site-header">[\s\S]*?<\/header>/, newHeader);

// Write it back
fs.writeFileSync(payHtmlPath, html);
console.log('Successfully updated pay.html header.');
