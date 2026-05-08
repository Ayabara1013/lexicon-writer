import { app, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import { listAllDocs } from './db'

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8212;/g, '—')
    .replace(/&#8211;/g, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'open'; tag: string }
  | { kind: 'close'; tag: string }
  | { kind: 'self'; tag: string }

function tokenize(html: string): Token[] {
  const tokens: Token[] = []
  let pos = 0
  while (pos < html.length) {
    const lt = html.indexOf('<', pos)
    if (lt < 0) {
      const t = decodeEntities(html.slice(pos))
      if (t) tokens.push({ kind: 'text', text: t })
      break
    }
    if (lt > pos) {
      const t = decodeEntities(html.slice(pos, lt))
      if (t) tokens.push({ kind: 'text', text: t })
    }
    const gt = html.indexOf('>', lt)
    if (gt < 0) break
    const raw = html.slice(lt + 1, gt).trim()
    const tagName = raw.replace(/^\//, '').split(/[\s/]/)[0].toLowerCase()
    if (raw.startsWith('/')) {
      tokens.push({ kind: 'close', tag: tagName })
    } else if (raw.endsWith('/') || tagName === 'br' || tagName === 'hr' || tagName === 'img') {
      tokens.push({ kind: 'self', tag: tagName })
    } else {
      tokens.push({ kind: 'open', tag: tagName })
    }
    pos = gt + 1
  }
  return tokens
}

type InlineStyle = { bold?: boolean; italics?: boolean; underline?: {}; strike?: boolean }

function buildRuns(tokens: Token[], from: number, style: InlineStyle): [TextRun[], number] {
  const runs: TextRun[] = []
  let i = from
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.kind === 'text') {
      runs.push(new TextRun({ text: t.text, ...style }))
      i++
    } else if (t.kind === 'self' && t.tag === 'br') {
      runs.push(new TextRun({ text: '', break: 1 }))
      i++
    } else if (t.kind === 'open') {
      const ns: InlineStyle = { ...style }
      if (t.tag === 'strong' || t.tag === 'b') ns.bold = true
      else if (t.tag === 'em' || t.tag === 'i') ns.italics = true
      else if (t.tag === 'u') ns.underline = {}
      else if (t.tag === 's' || t.tag === 'del' || t.tag === 'strike') ns.strike = true
      const [inner, newI] = buildRuns(tokens, i + 1, ns)
      runs.push(...inner)
      i = newI
    } else if (t.kind === 'close') {
      return [runs, i + 1]
    } else {
      i++
    }
  }
  return [runs, i]
}

const HEADING_MAP: Record<string, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
}

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'])

function htmlToParagraphs(html: string, pageBreakBefore = false): Paragraph[] {
  const tokens = tokenize(html)
  const paras: Paragraph[] = []
  let i = 0
  let isFirst = true
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.kind === 'open' && BLOCK_TAGS.has(t.tag)) {
      const [runs, newI] = buildRuns(tokens, i + 1, {})
      const heading = HEADING_MAP[t.tag]
      const opts: ConstructorParameters<typeof Paragraph>[0] = { children: runs, heading }
      if (isFirst && pageBreakBefore) opts.pageBreakBefore = true
      if (runs.length > 0 || heading) {
        paras.push(new Paragraph(opts))
        isFirst = false
      }
      i = newI
    } else {
      i++
    }
  }
  return paras
}

export async function exportManuscript(): Promise<{ saved: boolean; path?: string; error?: string }> {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Manuscript',
      defaultPath: `${app.getPath('documents')}/manuscript.docx`,
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
    })
    if (canceled || !filePath) return { saved: false }

    const all = listAllDocs()
    const chapters = all
      .filter((d) => d.type === 'chapter' && !d.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order)

    const children: Paragraph[] = []
    for (let idx = 0; idx < chapters.length; idx++) {
      const ch = chapters[idx]
      children.push(new Paragraph({
        children: [new TextRun({ text: ch.title, bold: true })],
        heading: HeadingLevel.TITLE,
        pageBreakBefore: idx > 0,
      }))
      children.push(...htmlToParagraphs(ch.content || ''))
    }

    if (children.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'No chapters yet.' })] }))
    }

    const doc = new Document({ sections: [{ children }] })
    const buffer = await Packer.toBuffer(doc)
    writeFileSync(filePath, buffer)
    return { saved: true, path: filePath }
  } catch (err) {
    return { saved: false, error: String(err) }
  }
}
