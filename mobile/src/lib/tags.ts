/** Splits tag text into single tags. Commas, semicolons and line breaks all separate tags; empty ones are dropped. */
export function splitTags(text: string | null | undefined): string[] {
  return (text || '')
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/** How a tag is compared: ignoring case and repeated spaces, so "Best  Quality" and "best quality" count as the same tag. */
function tagKey(tag: string): string {
  return tag.toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Puts remembered tags in front of a prompt. A tag is added once even if several models list it,
 * and is left out if the prompt already has it, so nothing is repeated.
 */
export function withTags(tagTexts: string[], prompt: string): string {
  const seen = new Set(splitTags(prompt).map(tagKey))
  const added: string[] = []
  for (const text of tagTexts) {
    for (const tag of splitTags(text)) {
      const key = tagKey(tag)
      if (!seen.has(key)) {
        seen.add(key)
        added.push(tag)
      }
    }
  }
  if (added.length == 0) {
    return prompt
  }
  return prompt.trim() ? `${added.join(', ')}, ${prompt}` : added.join(', ')
}
