/**
 * Loads video description data from the static JSON file.
 * Returns the parsed JSON object containing video metadata and segment descriptions.
 */
export async function loadDescriptions() {
  const response = await fetch('/data/descriptions.json');
  if (!response.ok) {
    throw new Error(`Failed to load descriptions: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
