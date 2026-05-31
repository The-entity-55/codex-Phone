/**
 * Gemini Speech-to-Text Client
 * Converts audio buffers (L16 PCM from FreeSWITCH) to text
 */

const axios = require("axios");
const WaveFile = require("wavefile").WaveFile;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_STT_MODEL = process.env.GEMINI_STT_MODEL || "gemini-2.5-flash";

/**
 * Convert L16 PCM buffer to WAV format for Gemini API
 * @param {Buffer} pcmBuffer - Raw L16 PCM audio data
 * @param {number} sampleRate - Sample rate (default: 8000 Hz for telephony)
 * @returns {Buffer} WAV file buffer
 */
function pcmToWav(pcmBuffer, sampleRate = 8000) {
  const wav = new WaveFile();

  // Convert Buffer to Int16Array for wavefile library
  const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);

  // Create WAV from raw PCM data
  wav.fromScratch(1, sampleRate, "16", samples);

  return Buffer.from(wav.toBuffer());
}

/**
 * Transcribe audio using Gemini audio understanding
 * @param {Buffer} audioBuffer - Audio data (either WAV or raw PCM)
 * @param {Object} options - Transcription options
 * @param {string} options.format - Input format: "wav" or "pcm" (default: "pcm")
 * @param {number} options.sampleRate - Sample rate for PCM (default: 8000)
 * @param {string} options.language - Language code (default: "en")
 * @returns {Promise<string>} Transcribed text
 */
async function transcribe(audioBuffer, options = {}) {
  const {
    format = "pcm",
    sampleRate = 8000,
    language = "en"
  } = options;

  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }

  // Convert PCM to WAV if needed
  let wavBuffer;
  if (format === "pcm") {
    wavBuffer = pcmToWav(audioBuffer, sampleRate);
  } else {
    wavBuffer = audioBuffer;
  }

  const prompt = language && language !== "auto"
    ? `Transcribe the speech in this audio. The expected language is ${language}. Return only the spoken words as plain text. If there is no clear speech, return an empty string.`
    : "Transcribe the speech in this audio. Return only the spoken words as plain text. If there is no clear speech, return an empty string.";

  const response = await axios({
    method: "POST",
    url: `${GEMINI_API_URL}/models/${GEMINI_STT_MODEL}:generateContent`,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    data: {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: "audio/wav",
              data: wavBuffer.toString("base64")
            }
          },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0
      }
    },
    timeout: 30000
  });

  const parts = response.data?.candidates?.[0]?.content?.parts || [];
  const transcription = parts
    .map(part => part.text || "")
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");

  const timestamp = new Date().toISOString();
  console.log("[" + timestamp + "] GEMINI STT Transcribed: " + transcription.substring(0, 100) + (transcription.length > 100 ? "..." : ""));

  return transcription;
}

/**
 * Check if Gemini STT is configured and available
 * @returns {boolean} True if API key is set
 */
function isAvailable() {
  return !!GEMINI_API_KEY;
}

module.exports = {
  transcribe,
  pcmToWav,
  isAvailable
};
