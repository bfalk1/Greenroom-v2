const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sizes = [192, 512];
const outputDir = path.join(__dirname, '../public/icons');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  // Create a simple icon with the Greenroom "G" on green background
  for (const size of sizes) {
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#0a0a0a"/>
        <rect x="${size * 0.1}" y="${size * 0.1}" width="${size * 0.8}" height="${size * 0.8}" rx="${size * 0.15}" fill="#00FF88"/>
        <text x="50%" y="58%" font-family="Arial, sans-serif" font-size="${size * 0.5}" font-weight="bold" fill="#0a0a0a" text-anchor="middle" dominant-baseline="middle">G</text>
      </svg>
    `;

    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(outputDir, `icon-${size}x${size}.png`));

    console.log(`Generated icon-${size}x${size}.png`);
  }

  // Also generate Apple touch icon
  const appleSvg = `
    <svg width="180" height="180" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0a0a0a"/>
      <rect x="18" y="18" width="144" height="144" rx="27" fill="#00FF88"/>
      <text x="50%" y="58%" font-family="Arial, sans-serif" font-size="90" font-weight="bold" fill="#0a0a0a" text-anchor="middle" dominant-baseline="middle">G</text>
    </svg>
  `;

  await sharp(Buffer.from(appleSvg))
    .png()
    .toFile(path.join(outputDir, 'apple-touch-icon.png'));

  console.log('Generated apple-touch-icon.png');
}

generateIcons().catch(console.error);
