// Builds the RAG chat messages: the system prompt constrains the model to the
// provided sources and forces inline [n] citations.

/**
 * @param {string} query
 * @param {Array<{index:number,title:string,url:string,snippet:string}>} sources
 * @returns {Array<{role:string,content:string}>}
 */
export function buildMessages(query, sources) {
  // Keep each source to one line of usable context — no URLs (the model
  // doesn't need them and echoing them encourages source-by-source listing).
  const context = sources
    .map((s) => {
      const title = (s.title || '').replace(/\s+/g, ' ').trim();
      const snippet = (s.snippet || '').replace(/\s+/g, ' ').trim();
      return `[${s.index}] ${title}${title && snippet ? ' — ' : ''}${snippet}`;
    })
    .join('\n');

  const system = [
    'You are a privacy-first search assistant. Using ONLY the numbered search',
    "results below, write ONE direct answer to the user's question, in your own words.",
    '',
    'How to answer:',
    '- Directly answer the question in 1–3 short paragraphs. Combine and synthesize',
    '  information from across the results into a single, coherent answer.',
    '- Do NOT summarize the sources one by one. Do NOT describe, list, or restate the',
    '  sources, their titles, or their URLs. The reader wants the answer, not a rundown',
    '  of the search results.',
    '- Do NOT begin with filler such as "Based on the results" or "According to the',
    '  sources." Start with the answer itself.',
    '- Support each factual claim with the relevant source number(s) in square brackets,',
    '  e.g. [1] or [2][3]. Put the citation right after the claim it supports.',
    '- Use only information found in the results. Never add outside knowledge and never',
    '  invent facts, sources, or URLs. Every sentence must be backed by a source number.',
    '- Keep the answer proportional to what the results actually say — do NOT pad it with',
    '  extra generic points the results do not support. It is fine to be short.',
    '- If the results genuinely lack enough information to answer, reply with exactly:',
    '  "Insufficient information in the results."',
  ].join('\n');

  const user = `Question: ${query}\n\nSearch results:\n${context}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Messages for summarizing a SINGLE source (page text or snippet).
 * @param {{title:string,url:string,text:string}} src
 */
export function buildSummaryMessages({ title, url, text }) {
  const system = [
    'You summarize a single web page for the reader.',
    'Give a concise summary (3–5 sentences) of the main points, in plain language.',
    'Use ONLY the provided content. Do not add outside knowledge or invent details.',
    'If the content is empty, truncated, paywalled, or unreadable, say so briefly instead of guessing.',
  ].join(' ');

  const user = `Title: ${title}\nURL: ${url}\n\nContent:\n${text}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
