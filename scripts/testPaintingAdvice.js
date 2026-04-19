require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPaintingAdvice } = require('../utils/aiPaintingAdvisor');

async function main() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const imagePath = fs.readdirSync(uploadsDir)
    .filter((file) => /\.(png|jpe?g)$/i.test(file))
    .sort()
    .map((file) => path.join(uploadsDir, file))[0];

  if (!imagePath) {
    throw new Error('No se encontró ninguna imagen válida en uploads.');
  }

  const detectedColors = ['#C59A4D', '#1E1E1E', '#D9D9D9', '#3B5E9A'];
  const recommendedScheme = 'Complementario';

  try {
    const result = await getPaintingAdvice(imagePath, detectedColors, recommendedScheme, null);
    const keys = Object.keys(result || {});

    console.log('TEST_OK=true');
    console.log(`MODEL_USED=${result.__modelName || 'unknown'}`);
    console.log(`KEYS_COUNT=${keys.length}`);
    console.log(`HAS_STEP_GUIDE=${Array.isArray(result.stepByStepGuide)}`);
    console.log(`STEP_GUIDE_LEN=${Array.isArray(result.stepByStepGuide) ? result.stepByStepGuide.length : 0}`);
    console.log(`HAS_TECHNIQUES=${Array.isArray(result.techniques)}`);
    process.exit(0);
  } catch (error) {
    console.log('TEST_OK=false');
    console.log(`ERROR_CODE=${error.code || 'UNKNOWN'}`);
    console.log(`ERROR_MESSAGE=${error.message || String(error)}`);
    process.exit(2);
  }
}

main();
