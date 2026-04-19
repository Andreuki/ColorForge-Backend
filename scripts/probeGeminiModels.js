require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!apiKey) {
  console.error('No GEMINI_API_KEY/GOOGLE_API_KEY found in environment.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

const candidates = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemini-3-flash-preview'
];

async function testModel(modelName) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent('Responde solo OK');
    const text = result?.response?.text?.() || '';
    return { modelName, ok: true, text };
  } catch (error) {
    return { modelName, ok: false, message: error?.message || String(error) };
  }
}

async function run() {
  const results = [];
  for (const modelName of candidates) {
    // Serial para no disparar rate limits durante el diagnostico.
    // eslint-disable-next-line no-await-in-loop
    const result = await testModel(modelName);
    results.push(result);
  }

  for (const item of results) {
    if (item.ok) {
      console.log(`[OK] ${item.modelName} => ${item.text}`);
    } else {
      console.log(`[FAIL] ${item.modelName} => ${item.message}`);
    }
  }

  const firstWorking = results.find((r) => r.ok);
  if (firstWorking) {
    console.log(`FIRST_WORKING_MODEL=${firstWorking.modelName}`);
    process.exit(0);
  }

  console.log('FIRST_WORKING_MODEL=NONE');
  process.exit(2);
}

run();
