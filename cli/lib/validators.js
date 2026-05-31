import axios from 'axios';

const GEMINI_VOICE_NAMES = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda',
  'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus',
  'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima',
  'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'
]);

/**
 * Validate Gemini API key by making a test request
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<{valid: boolean, error?: string}>} Validation result
 */
export async function validateGeminiKey(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    return {
      valid: false,
      error: 'API key cannot be empty'
    };
  }

  try {
    const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: {
        'x-goog-api-key': apiKey
      },
      timeout: 10000
    });

    if (response.status === 200) {
      return { valid: true };
    }

    return {
      valid: false,
      error: `Unexpected status: ${response.status}`
    };
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401) {
        return {
          valid: false,
          error: 'Invalid API key (401 Unauthorized)'
        };
      }
      if (error.response.status === 403) {
        return {
          valid: false,
          error: 'Invalid API key or Gemini API access denied (403 Forbidden)'
        };
      }
      return {
        valid: false,
        error: `API error: ${error.response.status} ${error.response.statusText}`
      };
    }

    if (error.code === 'ECONNABORTED') {
      return {
        valid: false,
        error: 'Request timeout - check your internet connection'
      };
    }

    return {
      valid: false,
      error: `Network error: ${error.message}`
    };
  }
}

/**
 * Backwards-compatible alias for older imports/tests.
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<{valid: boolean, error?: string}>} Validation result
 */
export async function validateElevenLabsKey(apiKey) {
  return validateGeminiKey(apiKey);
}

/**
 * Validate SIP extension format
 * @param {string} extension - SIP extension number
 * @returns {boolean} True if valid
 */
export function validateExtension(extension) {
  return /^\d{4,5}$/.test(extension);
}

/**
 * Validate IP address format
 * @param {string} ip - IP address
 * @returns {boolean} True if valid
 */
export function validateIP(ip) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) {
    return false;
  }

  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Validate hostname format
 * @param {string} hostname - Hostname or FQDN
 * @returns {boolean} True if valid
 */
export function validateHostname(hostname) {
  const hostnameRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
  return hostnameRegex.test(hostname);
}

/**
 * Validate Gemini voice name
 * @param {string} apiKey - Unused, kept for call-site compatibility
 * @param {string} voiceId - Gemini voice name to validate
 * @returns {Promise<{valid: boolean, name?: string, error?: string}>} Validation result
 */
export async function validateVoiceId(apiKey, voiceId) {
  void apiKey;

  if (!voiceId || voiceId.trim() === '') {
    return {
      valid: false,
      error: 'Voice name cannot be empty'
    };
  }

  const normalized = voiceId.trim();
  if (GEMINI_VOICE_NAMES.has(normalized)) {
    return {
      valid: true,
      name: normalized
    };
  }

  return {
    valid: false,
    error: `Unknown Gemini voice "${voiceId}". Try Kore, Puck, Charon, or Zephyr.`
  };
}
