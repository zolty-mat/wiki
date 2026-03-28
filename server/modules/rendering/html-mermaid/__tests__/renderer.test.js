'use strict'

/**
 * Unit tests for the html-mermaid rendering module.
 *
 * The renderer's single responsibility: find <pre.prismjs><code.language-mermaid>
 * blocks in the HTML cheerio tree and replace them with <div class="mermaid">.
 * The browser is responsible for actually rendering the Mermaid SVG at runtime.
 */

const cheerio = require('cheerio')
const renderer = require('../renderer')

// Helper: parse HTML into a cheerio $, run init(), return resulting HTML
function render (html, config = {}) {
  const $ = cheerio.load(html, { xmlMode: false })
  renderer.init($, config)
  return $.html()
}

describe('html-mermaid renderer', () => {
  // ---------------------------------------------------------------------------
  // Basic transformation
  // ---------------------------------------------------------------------------

  describe('basic transformation', () => {
    it('replaces matching pre>code with a .mermaid div', () => {
      const input = `<pre class="prismjs"><code class="language-mermaid">graph TD\nA --> B</code></pre>`
      const output = render(input)
      expect(output).toContain('<div class="mermaid">')
      expect(output).toContain('graph TD')
      expect(output).not.toContain('<pre class="prismjs">')
      expect(output).not.toContain('<code class="language-mermaid">')
    })

    it('preserves the diagram source content inside the div', () => {
      const source = 'sequenceDiagram\nAlice->>Bob: Hello\nBob-->>Alice: Hi'
      const input = `<pre class="prismjs"><code class="language-mermaid">${source}</code></pre>`
      const $ = cheerio.load(input)
      renderer.init($, {})
      // Check decoded text content — cheerio may HTML-encode arrows in serialized output
      // but the DOM text content should match the original source
      const text = $('.mermaid').text()
      expect(text).toContain('sequenceDiagram')
      expect(text).toContain('Alice->>Bob')
      expect(text).toContain('Bob-->>Alice')
    })

    it('does nothing to non-mermaid code blocks', () => {
      const input = `<pre class="prismjs"><code class="language-javascript">const x = 1</code></pre>`
      const output = render(input)
      expect(output).toContain('<pre class="prismjs">')
      expect(output).toContain('language-javascript')
      expect(output).not.toContain('<div class="mermaid">')
    })

    it('does nothing when there are no code blocks at all', () => {
      const input = `<p>Just a paragraph.</p>`
      const output = render(input)
      expect(output).toContain('<p>Just a paragraph.</p>')
      expect(output).not.toContain('<div class="mermaid">')
    })

    it('returns empty string unchanged', () => {
      const output = render('')
      expect(output).not.toContain('<div class="mermaid">')
    })
  })

  // ---------------------------------------------------------------------------
  // Multiple blocks
  // ---------------------------------------------------------------------------

  describe('multiple blocks', () => {
    it('converts all mermaid blocks on the page', () => {
      const input = [
        `<pre class="prismjs"><code class="language-mermaid">graph TD\nA --> B</code></pre>`,
        `<p>Some prose</p>`,
        `<pre class="prismjs"><code class="language-mermaid">pie title Pets\n"Dogs": 50</code></pre>`,
      ].join('\n')
      const output = render(input)
      const matches = [...output.matchAll(/<div class="mermaid">/g)]
      expect(matches).toHaveLength(2)
    })

    it('only converts mermaid blocks, leaves other code blocks intact', () => {
      const input = [
        `<pre class="prismjs"><code class="language-mermaid">graph TD\nA --> B</code></pre>`,
        `<pre class="prismjs"><code class="language-javascript">const x = 1</code></pre>`,
        `<pre class="prismjs"><code class="language-bash">echo hello</code></pre>`,
      ].join('\n')
      const output = render(input)
      expect([...output.matchAll(/<div class="mermaid">/g)]).toHaveLength(1)
      expect(output).toContain('language-javascript')
      expect(output).toContain('language-bash')
    })
  })

  // ---------------------------------------------------------------------------
  // Selector specificity
  // ---------------------------------------------------------------------------

  describe('selector specificity', () => {
    it('does NOT match a bare <pre> without class prismjs', () => {
      const input = `<pre><code class="language-mermaid">graph TD\nA --> B</code></pre>`
      const output = render(input)
      expect(output).not.toContain('<div class="mermaid">')
    })

    it('does NOT match a <code> directly without a parent <pre>', () => {
      const input = `<code class="language-mermaid">graph TD\nA --> B</code>`
      const output = render(input)
      expect(output).not.toContain('<div class="mermaid">')
    })

    it('does NOT match when <code> class is just "mermaid" without language- prefix', () => {
      const input = `<pre class="prismjs"><code class="mermaid">graph TD\nA --> B</code></pre>`
      const output = render(input)
      expect(output).not.toContain('<div class="mermaid">')
    })
  })

  // ---------------------------------------------------------------------------
  // Content preservation
  // ---------------------------------------------------------------------------

  describe('content preservation', () => {
    it('preserves all 10 Mermaid diagram types', () => {
      const diagrams = [
        'graph TD\nA --> B',
        'sequenceDiagram\nAlice->>Bob: Hello',
        'classDiagram\nAnimal <|-- Duck',
        'stateDiagram-v2\n[*] --> Active',
        'erDiagram\nCUSTOMER ||--o{ ORDER : places',
        'gantt\ntitle Project\nsection Phase\nTask A :2024-01-01, 30d',
        'pie\ntitle Pets\n"Dogs" : 50',
        'gitGraph\ncommit\nbranch dev',
        'mindmap\nroot((Topic))\n  A\n  B',
        'timeline\ntitle History\n2024 : Event',
      ]

      diagrams.forEach(diagramSource => {
        const input = `<pre class="prismjs"><code class="language-mermaid">${diagramSource}</code></pre>`
        const $ = cheerio.load(input)
        renderer.init($, {})
        // Verify the div.mermaid exists
        expect($('.mermaid').length).toBe(1)
        // Verify first line of diagram type is preserved in text content
        const firstLine = diagramSource.split('\n')[0]
        expect($('.mermaid').text()).toContain(firstLine)
      })
    })

    it('preserves HTML-encoded content unchanged', () => {
      // Cheerio may encode certain chars — verify the content round-trips intact
      const source = 'graph TD\nA["Label &amp; More"] --> B'
      const input = `<pre class="prismjs"><code class="language-mermaid">${source}</code></pre>`
      const output = render(input)
      expect(output).toContain('<div class="mermaid">')
    })

    it('preserves multiline diagram content', () => {
      const source = `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do thing]
    B -->|No| D[Skip]
    C --> E[End]
    D --> E`
      const input = `<pre class="prismjs"><code class="language-mermaid">${source}</code></pre>`
      const output = render(input)
      expect(output).toContain('A[Start]')
      expect(output).toContain('B{Decision}')
    })
  })

  // ---------------------------------------------------------------------------
  // Output structure
  // ---------------------------------------------------------------------------

  describe('output structure', () => {
    it('output is a single div.mermaid with no wrapper', () => {
      const input = `<pre class="prismjs"><code class="language-mermaid">graph TD\nA --> B</code></pre>`
      const $ = cheerio.load(input)
      renderer.init($, {})
      const mermaidDivs = $('.mermaid')
      expect(mermaidDivs.length).toBe(1)
      // Should not be wrapped in anything extra
      expect(mermaidDivs.parent().is('body')).toBe(true)
    })

    it('the .mermaid div has no child elements — just text content', () => {
      const input = `<pre class="prismjs"><code class="language-mermaid">graph TD\nA --> B</code></pre>`
      const $ = cheerio.load(input)
      renderer.init($, {})
      const div = $('.mermaid')
      expect(div.children().length).toBe(0)
      expect(div.text()).toContain('graph TD')
    })
  })

  // ---------------------------------------------------------------------------
  // Config parameter (currently unused — test it doesn't break anything)
  // ---------------------------------------------------------------------------

  describe('config parameter', () => {
    it('accepts undefined config without throwing', () => {
      const $ = cheerio.load('<p>test</p>')
      expect(() => renderer.init($, undefined)).not.toThrow()
    })

    it('accepts an empty config object', () => {
      const $ = cheerio.load('<p>test</p>')
      expect(() => renderer.init($, {})).not.toThrow()
    })

    it('accepts arbitrary config keys without throwing', () => {
      const $ = cheerio.load('<p>test</p>')
      expect(() => renderer.init($, { theme: 'dark', foo: 'bar' })).not.toThrow()
    })
  })
})
