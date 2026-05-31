/**
 * Gemini Text-to-Speech Service
 * Generates speech audio files and returns URLs for FreeSWITCH playback
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Gemini TTS uses prebuilt voice names such as Kore, Puck, Charon, and Zephyr.
const DEFAULT_VOICE_NAME = process.env.GEMINI_TTS_VOICE || 'Kore';
const MODEL_ID = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const SAMPLE_RATE = 24000;

// Audio output directory (set via setAudioDir)
let audioDir = path.join(__dirname, '../audio-temp');

/**
 * Set the audio output directory
 * @param {string} dir - Absolute path to audio directory
 */
function setAudioDir(dir) {
  audioDir = dir;

  // Create directory if it doesn't exist
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
    logger.info('Created audio directory', { path: audioDir });
  }
}

/**
 * Generate unique filename for audio file
 * @param {string} text - Text being converted
 * @returns {string} Filename (without path)
 */
function generateFilename(text) {
  // Hash text to create unique identifier
  const hash = crypto.createHash('md5').update(text).digest('hex').substring(0, 8);
  const timestamp = Date.now();
  return `tts-${timestamp}-${hash}.wav`;
}

/**
 * Wrap Gemini's raw 16-bit PCM audio in a WAV container.
 * @param {Buffer} pcmData - Raw PCM audio returned by Gemini
 * @param {number} sampleRate - Audio sample rate
 * @returns {Buffer} WAV file bytes
 */
function pcmToWav(pcmData, sampleRate = SAMPLE_RATE) {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * Convert text to speech using Gemini API
 * @param {string} text - Text to convert to speech
 * @param {string} voiceName - Gemini prebuilt voice name (optional)
 * @returns {Promise<string>} HTTP URL to audio file
 */
async function generateSpeech(text, voiceName = DEFAULT_VOICE_NAME) {
  const startTime = Date.now();

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set');
    }

    const selectedVoice = voiceName || DEFAULT_VOICE_NAME;

    logger.info('Generating speech with Gemini', {
      textLength: text.length,
      voiceName: selectedVoice,
      model: MODEL_ID
    });

    // Gemini TTS returns base64-encoded raw PCM in the first inlineData part.
    const response = await axios({
      method: 'POST',
      url: `${GEMINI_API_URL}/models/${MODEL_ID}:generateContent`,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      data: {
        contents: [{
          parts: [{ text }]
        }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: selectedVoice
              }
            }
          }
        }
      },
      timeout: 30000
    });

    const base64Audio = response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('Gemini TTS response did not include audio data');
    }

    const pcmData = Buffer.from(base64Audio, 'base64');
    const wavData = pcmToWav(pcmData);

    // Generate filename and save audio
    const filename = generateFilename(text);
    const filepath = path.join(audioDir, filename);

    fs.writeFileSync(filepath, wavData);

    const latency = Date.now() - startTime;
    const fileSize = wavData.length;

    logger.info('Speech generation successful', {
      filename,
      fileSize,
      latency,
      textLength: text.length
    });

    // Return HTTP URL (assumes audio-temp is served via HTTP)
    // Format: http://localhost:PORT/audio/filename.mp3
    // The HTTP server setup is handled elsewhere
    const audioUrl = `http://127.0.0.1:3000/audio-files/${filename}`;

    return audioUrl;

  } catch (error) {
    const latency = Date.now() - startTime;

    logger.error('Speech generation failed', {
      error: error.message,
      latency,
      textLength: text?.length,
      responseStatus: error.response?.status,
      responseData: error.response?.data?.toString()
    });

    // Handle specific errors
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('Gemini API authentication failed - check API key');
    } else if (error.response?.status === 429) {
      throw new Error('Gemini API rate limit exceeded');
    } else if (error.response?.status === 400) {
      throw new Error('Invalid request to Gemini TTS API');
    }

    throw new Error(`TTS generation failed: ${error.message}`);
  }
}

/**
 * Clean up old audio files (older than specified age)
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 */
function cleanupOldFiles(maxAgeMs = 60 * 60 * 1000) {
  try {
    const now = Date.now();
    const files = fs.readdirSync(audioDir);

    let deletedCount = 0;
    files.forEach(file => {
      if (!file.startsWith('tts-') || !file.endsWith('.wav')) {
        return;
      }

      const filepath = path.join(audioDir, file);
      const stats = fs.statSync(filepath);
      const age = now - stats.mtimeMs;

      if (age > maxAgeMs) {
        fs.unlinkSync(filepath);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      logger.info('Cleaned up old audio files', { deletedCount });
    }

  } catch (error) {
    logger.warn('Failed to cleanup old audio files', { error: error.message });
  }
}

/**
 * Get list of available Gemini voices
 * @returns {Promise<Array>} Array of voice objects
 */
async function getAvailableVoices() {
  return [
    'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda',
    'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus',
    'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
    'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima',
    'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'
  ].map(name => ({ name, voiceId: name }));
}

// Initialize audio directory
setAudioDir(audioDir);

// Setup periodic cleanup (every 30 minutes)
setInterval(() => {
  cleanupOldFiles();
}, 30 * 60 * 1000);

module.exports = {
  generateSpeech,
  setAudioDir,
  cleanupOldFiles,
  getAvailableVoices,
  pcmToWav
};
