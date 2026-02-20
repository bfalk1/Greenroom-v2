// Genre normalization and validation utilities

// List of profane words to filter (basic list - extend as needed)
const PROFANE_WORDS = new Set([
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'crap', 'dick', 'cock', 'pussy',
  'slut', 'whore', 'bastard', 'cunt', 'nigger', 'nigga', 'fag', 'faggot',
  'retard', 'retarded', 'kike', 'spic', 'chink', 'gook', 'wetback'
]);

// Common genre aliases for normalization
const GENRE_ALIASES: Record<string, string> = {
  'hiphop': 'Hip-Hop',
  'hip hop': 'Hip-Hop',
  'hip-hop': 'Hip-Hop',
  'rap': 'Hip-Hop',
  'r&b': 'R&B',
  'rnb': 'R&B',
  'r and b': 'R&B',
  'rhythm and blues': 'R&B',
  'edm': 'Electronic',
  'electronic dance music': 'Electronic',
  'electronica': 'Electronic',
  'lo-fi': 'Lo-Fi',
  'lofi': 'Lo-Fi',
  'lo fi': 'Lo-Fi',
  'chillhop': 'Lo-Fi',
  'drum and bass': 'Drum & Bass',
  'dnb': 'Drum & Bass',
  'd&b': 'Drum & Bass',
  'drum n bass': 'Drum & Bass',
  'deep house': 'House',
  'tech house': 'House',
  'progressive house': 'House',
  'melodic techno': 'Techno',
  'minimal techno': 'Techno',
  'hard techno': 'Techno',
  'uk garage': 'Garage',
  'future garage': 'Garage',
  'boom bap': 'Hip-Hop',
  'trap music': 'Trap',
  'southern trap': 'Trap',
  'cinematic': 'Cinematic/Orchestral',
  'orchestral': 'Cinematic/Orchestral',
  'film score': 'Cinematic/Orchestral',
  'synthwave': 'Synthwave',
  'retrowave': 'Synthwave',
  'outrun': 'Synthwave',
  'future bass': 'Future Bass',
  'future funk': 'Future Bass',
  'reggaeton': 'Reggaeton',
  'latin trap': 'Reggaeton',
  'afrobeats': 'Afrobeats',
  'afrobeat': 'Afrobeats',
  'amapiano': 'Afrobeats',
  'soul': 'Soul',
  'neo soul': 'Soul',
  'funk': 'Funk',
  'disco': 'Disco',
  'nu disco': 'Disco',
  'dubstep': 'Dubstep',
  'brostep': 'Dubstep',
  'riddim': 'Dubstep',
  'experimental': 'Experimental',
  'avant garde': 'Experimental',
  'noise': 'Experimental',
};

/**
 * Normalize a genre string for comparison
 */
export function normalizeGenre(genre: string): string {
  return genre
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s&-]/gi, '') // Remove special chars except & and -
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Get the canonical display name for a genre
 */
export function getCanonicalGenre(genre: string): string {
  const normalized = normalizeGenre(genre);
  
  // Check if there's an alias
  if (GENRE_ALIASES[normalized]) {
    return GENRE_ALIASES[normalized];
  }
  
  // Otherwise, title case the input
  return genre
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Check if a genre name contains profanity
 */
export function containsProfanity(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  return words.some(word => PROFANE_WORDS.has(word));
}

/**
 * Validate a genre name
 */
export function validateGenre(genre: string): { valid: boolean; error?: string } {
  if (!genre || genre.trim().length === 0) {
    return { valid: false, error: 'Genre name is required' };
  }
  
  if (genre.trim().length < 2) {
    return { valid: false, error: 'Genre name must be at least 2 characters' };
  }
  
  if (genre.trim().length > 50) {
    return { valid: false, error: 'Genre name must be 50 characters or less' };
  }
  
  if (containsProfanity(genre)) {
    return { valid: false, error: 'Genre name contains inappropriate language' };
  }
  
  // Check for valid characters
  if (!/^[a-zA-Z0-9\s&-]+$/.test(genre.trim())) {
    return { valid: false, error: 'Genre name can only contain letters, numbers, spaces, & and -' };
  }
  
  return { valid: true };
}

// Default genres that come pre-installed
export const DEFAULT_GENRES = [
  'Electronic',
  'Hip-Hop',
  'Pop',
  'Rock',
  'R&B',
  'Ambient',
  'Indie',
  'Techno',
  'House',
  'Trap',
  'Jazz',
  'Classical',
  'Lo-Fi',
  'Drum & Bass',
  'Dubstep',
  'Future Bass',
  'Synthwave',
  'Soul',
  'Funk',
  'Disco',
  'Reggaeton',
  'Afrobeats',
  'Cinematic/Orchestral',
  'Experimental',
  'World',
  'Country',
  'Folk',
  'Metal',
  'Punk',
  'Blues',
];

// Instrument categories
export const INSTRUMENT_CATEGORIES = {
  'Drums': ['Kick', 'Snare', 'Hi-Hat', 'Clap', 'Percussion', 'Full Kit', 'Cymbal', 'Tom'],
  'Bass': ['Sub Bass', '808', 'Synth Bass', 'Electric Bass', 'Acoustic Bass'],
  'Synths': ['Lead', 'Pad', 'Pluck', 'Arp', 'Chord', 'Keys'],
  'Guitars': ['Electric Guitar', 'Acoustic Guitar', 'Clean', 'Distorted', 'Riff'],
  'Vocals': ['Vocal Chop', 'Vocal Lead', 'Vocal Harmony', 'Ad-lib', 'Hook', 'Spoken Word'],
  'FX': ['Riser', 'Impact', 'Transition', 'Texture', 'Ambience', 'Noise'],
  'Strings': ['Violin', 'Cello', 'Orchestral', 'Pizzicato'],
  'Brass': ['Trumpet', 'Horn', 'Trombone', 'Brass Section'],
  'Woodwinds': ['Flute', 'Saxophone', 'Clarinet'],
  'Other': ['Piano', 'Organ', 'Harp', 'Mallet', 'Full Loop', 'Stem'],
} as const;

export type InstrumentCategory = keyof typeof INSTRUMENT_CATEGORIES;
