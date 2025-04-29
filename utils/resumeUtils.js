/**
 * Resume parsing and extraction utilities
 */

/**
 * Extracts content from complex text responses using multiple strategies
 * @param {string} text - The text to extract content from
 * @param {string} sectionIdentifier - The identifier to look for (e.g., "summary", "experience")
 * @param {Object} options - Additional extraction options
 * @returns {string|null} - The extracted content or null if extraction fails
 */
export const extractContentBySection = (text, sectionIdentifier, options = {}) => {
  if (!text) return null;
  
  // Try pattern matching with the section identifier
  const mainPattern = new RegExp(`${sectionIdentifier}[:\\s]*((?:.|\\n)+?)(?=\\n\\n|$)`, 'i');
  const mainMatch = text.match(mainPattern);
  
  if (mainMatch && mainMatch[1].trim()) {
    return mainMatch[1].trim();
  }
  
  // Try looking for largest paragraph that isn't a heading or instruction
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length > 0) {
    const contentParagraphs = paragraphs.filter(p => 
      !p.startsWith('#') && 
      !p.includes(':') && 
      !p.toLowerCase().includes(sectionIdentifier.toLowerCase()) &&
      !p.toLowerCase().includes('current') &&
      !p.toLowerCase().includes('job description'));
    
    if (contentParagraphs.length > 0) {
      // Sort by length and take the longest paragraph as a fallback
      return contentParagraphs.sort((a, b) => b.length - a.length)[0];
    }
  }
  
  // Last resort - remove common non-content text and return the rest
  return text
    .replace(/Current.*?:/g, '')
    .replace(/Tailored.*?:/g, '')
    .replace(/Job description:/g, '')
    .replace(/```[^`]*```/g, '')
    .trim();
};

/**
 * Extracts list items from a text response
 * @param {string} text - The text to extract list items from
 * @returns {string[]|null} - Array of list items or null if extraction fails
 */
export const extractListItems = (text) => {
  if (!text) return null;
  
  // Try to extract bullet points
  const bulletMatches = text.match(/(?:^|\n)[-•*]\s*(.+?)(?=$|\n)/gm);
  if (bulletMatches && bulletMatches.length > 0) {
    return bulletMatches
      .map(line => line.trim().replace(/^[-•*]\s*/, ''))
      .filter(item => item.length > 0);
  }
  
  // Try to extract comma-separated list
  if (text.includes(',')) {
    return text
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }
  
  // Last resort - split by newlines
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.includes(':'));
};

/**
 * Compares two objects to determine if any fields have changed
 * @param {Object} original - The original object
 * @param {Object} updated - The updated object
 * @returns {boolean} - True if changes detected, false otherwise
 */
export const hasChanges = (original, updated) => {
  if (!original || !updated) return false;
  
  return Object.keys(updated).some(key => {
    if (Array.isArray(updated[key]) && Array.isArray(original[key])) {
      // Compare arrays
      if (updated[key].length !== original[key].length) return true;
      return updated[key].some((item, i) => item !== original[key][i]);
    }
    
    // Compare primitive values
    return updated[key] !== original[key];
  });
};

/**
 * Detects if a string contains JSON and extracts the content safely
 * @param {string} text - Input text that might contain JSON
 * @returns {string} Sanitized text with parsed JSON if detected
 */
export const sanitizeJSONString = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  // Check if the text looks like a JSON string (starts and ends with {} or [])
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      // Try to parse it
      const parsed = JSON.parse(trimmed);
      
      // Handle different types of parsed results
      if (typeof parsed === 'string') {
        return parsed;
      } else if (Array.isArray(parsed)) {
        return parsed.join(", ");
      } else if (typeof parsed === 'object') {
        // Extract meaningful content from the object
        return Object.values(parsed).filter(v => typeof v === 'string').join(", ");
      }
      
      // Fallback to original if we can't handle the parsed result
      return text;
    } catch (e) {
      // If it's not valid JSON, return the original text
      return text;
    }
  }
  
  return text;
};
