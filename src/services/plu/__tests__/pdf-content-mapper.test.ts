import { describe, expect, it } from 'vitest'
import {
  PdfContentMapper,
  PdfExtractor,
  type PdfPageInput,
} from '@/services/pdf'

/**
 * Build a minimal valid PDF 1.4 buffer with one text block per page (no external dependencies).
 */
function buildMinimalPdfBuffer(pageTexts: string[]): Buffer {
  const objects: string[] = []
  // 1: Catalog, 2: Pages
  const pageObjIds: number[] = []
  const contentObjIds: number[] = []

  let nextId = 4 // 3 will be Font
  for (let i = 0; i < pageTexts.length; i++) {
    pageObjIds.push(nextId++)
    contentObjIds.push(nextId++)
  }

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageTexts.length} >>\nendobj\n`,
  )
  objects.push(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  )

  for (let i = 0; i < pageTexts.length; i++) {
    const pId = pageObjIds[i]
    const cId = contentObjIds[i]
    const lines = pageTexts[i].split('\n').filter((l) => l.length > 0)
    const streamCommands = lines
      .map((line, idx) => {
        const escaped = line
          .replace(/\\/g, '\\\\')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
        const y = 760 - idx * 16
        return `BT /F1 11 Tf 40 ${y} Td (${escaped}) Tj ET`
      })
      .join('\n')

    objects.push(
      `${pId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`,
    )
    objects.push(
      `${cId} 0 obj\n<< /Length ${Buffer.byteLength(streamCommands, 'latin1')} >>\nstream\n${streamCommands}\nendstream\nendobj\n`,
    )
  }

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += obj
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

const SAMPLE_PLU_PAGES: PdfPageInput[] = [
  {
    pageNumber: 1,
    text: `PLAN LOCAL D'URBANISME - COMMUNE DE AIX-EN-PROVENCE
SOMMAIRE
TITRE I - DISPOSITIONS GENERALES ......................... 2
CHAPITRE I - ZONE UA ..................................... 3
ANNEXES .................................................. 7`,
  },
  {
    pageNumber: 2,
    text: `TITRE I : DISPOSITIONS GENERALES
SECTION 1 : Champ d'application et définitions
Le présent règlement s'applique à l'ensemble du territoire communal conformément à l'article R.111-2 du Code de l'urbanisme.
Les servitudes d'utilité publique et les risques d'inondation (PPRI) sont reportés en annexe.`,
  },
  {
    pageNumber: 3,
    text: `DISPOSITIONS APPLICABLES À LA ZONE UA
CHAPITRE I : RÈGLEMENT DE LA ZONE UA
ARTICLE UA 1 : Occupations et utilisations du sol interdites
Sont interdites les constructions à usage d'industrie et d'entrepôt.

ARTICLE UA 6 : Implantation des constructions par rapport aux voies et emprises publiques
Les constructions doivent observer un recul minimal de 5 mètres par rapport à l'alignement des voies publiques.
L'accès et la voirie doivent permettre la desserte des véhicules de sécurité incendie.`,
  },
  {
    pageNumber: 4,
    text: `ARTICLE UA 9 : Emprise au sol des constructions
L'emprise au sol maximale des constructions est fixée à 60 % de la surface du terrain.

ARTICLE UA 10 : Hauteur maximale des constructions
La hauteur maximale au faîtage est limitée à 15 mètres (R+3). Voir l'article UA 6 pour les règles de retrait et voir page 7 pour les annexes.`,
  },
  {
    pageNumber: 5,
    text: `Page 5`,
  },
  {
    pageNumber: 6,
    text: `CHAPITRE II : ZONE UB
ARTICLE 12 : Stationnement
Il est exigé 1,5 place de stationnement par logement et un local vélo sécurisé.

ARTICLE 13 : Espaces libres et plantations
Au moins 25 % de la surface du terrain doit être maintenue en pleine terre et espaces verts avec plantation d'arbres.
Les eaux pluviales doivent être gérées par infiltration sur la parcelle.`,
  },
  {
    pageNumber: 7,
    text: `ANNEXES : TABLEAU RÉCAPITULATIF DES NORMES DE HAUTEUR ET D'EMPRISE
Zone   Hauteur max   Emprise au sol   Pleine terre
UA     15 m          60 %             20 %
UB     12 m          40 %             25 %
Selon le tableau récapitulatif, la hauteur maximale et l'emprise au sol s'appliquent sans préjudice des règles de recul de l'article UA 6.`,
  },
  {
    pageNumber: 8,
    text: '',
  },
  {
    pageNumber: 9,
    text: '\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD',
  },
]

describe('Deterministic PLU PDF Content Mapper', () => {
  it('produces 100% deterministic and reproducible JSON output', () => {
    const map1 = PdfContentMapper.buildFromPages(SAMPLE_PLU_PAGES)
    const map2 = PdfContentMapper.buildFromPages(SAMPLE_PLU_PAGES)
    expect(map1).toEqual(map2)
    expect(map1.deterministic).toBe(true)
    expect(map1.schemaVersion).toBe('1.0.0')
  })

  it('extracts document metadata and identifies scanned, empty, and unreadable pages', () => {
    const map = PdfContentMapper.buildFromPages(SAMPLE_PLU_PAGES)

    expect(map.metadata.documentType).toBe('PLU')
    expect(map.metadata.commune).toBe('AIX-EN-PROVENCE')
    expect(map.metadata.pageCount).toBe(9)
    expect(map.metadata.digitalPageCount).toBe(6)
    expect(map.metadata.scannedPageCount).toBe(1)
    expect(map.metadata.scannedPages).toEqual([5])
    expect(map.metadata.emptyPageCount).toBe(1)
    expect(map.metadata.unreadablePageCount).toBe(1)
    expect(map.metadata.unreadablePages).toEqual([9])

    expect(map.pages[4].status).toBe('scanned')
    expect(map.pages[7].status).toBe('empty')
    expect(map.pages[8].status).toBe('unreadable')
    expect(map.pages[4].articleIds).toEqual([])
    expect(map.pages[8].topics).toEqual([])
  })

  it('detects chapters, sections, zone dispositions, and regulatory articles with exact page spans', () => {
    const map = PdfContentMapper.buildFromPages(SAMPLE_PLU_PAGES)

    expect(map.sections.some((s) => s.kind === 'toc' && s.startPage === 1)).toBe(true)
    expect(map.sections.some((s) => s.kind === 'title' && s.startPage === 2)).toBe(true)
    expect(
      map.sections.some(
        (s) => s.kind === 'zone_disposition' && s.zoneCode === 'UA' && s.startPage === 3,
      ),
    ).toBe(true)
    expect(map.sections.some((s) => s.kind === 'annex' && s.startPage === 7)).toBe(true)

    const ua6 = map.articles.find((a) => a.normalizedCode === 'UA6')
    expect(ua6).toBeDefined()
    expect(ua6?.zoneCode).toBe('UA')
    expect(ua6?.startPage).toBe(3)
    expect(ua6?.topics).toContain('setbacks')
    expect(ua6?.topics).toContain('access')

    const ua10 = map.articles.find((a) => a.normalizedCode === 'UA10')
    expect(ua10).toBeDefined()
    expect(ua10?.startPage).toBe(4)
    expect(ua10?.topics).toContain('height')

    // Article 12 & 13 inherit active zone UB from CHAPITRE II : ZONE UB
    const ub12 = map.articles.find((a) => a.normalizedCode === 'UB12')
    expect(ub12).toBeDefined()
    expect(ub12?.zoneCode).toBe('UB')
    expect(ub12?.startPage).toBe(6)
    expect(ub12?.topics).toContain('parking')

    const ub13 = map.articles.find((a) => a.normalizedCode === 'UB13')
    expect(ub13).toBeDefined()
    expect(ub13?.topics).toContain('green_spaces')
    expect(ub13?.topics).toContain('utilities')
  })

  it('maps urban-planning topics and compresses page ranges', () => {
    const map = PdfContentMapper.buildFromPages(SAMPLE_PLU_PAGES)

    const setbacks = map.topics.find((t) => t.topic === 'setbacks')
    expect(setbacks).toBeDefined()
    expect(setbacks?.pageNumbers).toEqual([3, 4, 7])
    expect(setbacks?.pageRanges).toEqual([
      { startPage: 3, endPage: 4 },
      { startPage: 7, endPage: 7 },
    ])

    const height = map.topics.find((t) => t.topic === 'height')
    expect(height).toBeDefined()
    expect(height?.pageNumbers).toContain(4)
    expect(height?.pageNumbers).toContain(7)

    expect(PdfContentMapper.compressPageRanges([1, 2, 3, 5, 7, 8])).toEqual([
      { startPage: 1, endPage: 3 },
      { startPage: 5, endPage: 5 },
      { startPage: 7, endPage: 8 },
    ])
  })

  it('extracts cross-references between articles, external codes, annexes, tables, and pages', () => {
    const map = PdfContentMapper.buildFromPages(SAMPLE_PLU_PAGES)

    const artRef = map.crossReferences.find(
      (r) => r.sourcePage === 4 && r.targetType === 'article' && r.targetArticleId?.includes('UA6'),
    )
    expect(artRef).toBeDefined()
    expect(artRef?.targetPage).toBe(3)

    const extRef = map.crossReferences.find(
      (r) => r.sourcePage === 2 && r.targetType === 'external_code' && r.targetRef === 'R.111-2',
    )
    expect(extRef).toBeDefined()

    const pageRef = map.crossReferences.find(
      (r) => r.sourcePage === 4 && r.targetType === 'page' && r.targetPage === 7,
    )
    expect(pageRef).toBeDefined()

    const tablePage = map.pages.find((p) => p.pageNumber === 7)
    expect(tablePage?.hasTable).toBe(true)
    expect(tablePage?.isAnnex).toBe(true)

    const tableRef = map.crossReferences.find(
      (r) => r.sourcePage === 7 && r.targetType === 'table',
    )
    expect(tableRef?.targetPages).toContain(7)
  })

  it('queries the content map to locate relevant pages and articles for a zone and topics', () => {
    const map = PdfContentMapper.buildFromPages(SAMPLE_PLU_PAGES)
    const result = PdfContentMapper.query(map, {
      zoneCode: 'UA',
      topics: ['height', 'footprint'],
    })

    expect(result.pageNumbers).toContain(4)
    expect(result.articles.some((a) => a.normalizedCode === 'UA9')).toBe(true)
    expect(result.articles.some((a) => a.normalizedCode === 'UA10')).toBe(true)
    expect(result.articles.some((a) => a.normalizedCode === 'UB12')).toBe(false)
  })

  it('supports form-feed separated text via PdfContentMapper.buildFromText', () => {
    const text = 'ARTICLE UA 6 : Implantation\nRecul minimal de 4 mètres par rapport aux voies publiques.\fARTICLE UA 10 : Hauteur\nHauteur maximale de 12 mètres au faîtage.'
    const map = PdfContentMapper.buildFromText(text)
    expect(map.metadata.pageCount).toBe(2)
    expect(map.articles).toHaveLength(2)
    expect(map.articles[0].startPage).toBe(1)
    expect(map.articles[1].startPage).toBe(2)
  })

  it('integrates with pdf-extractor on a real multi-page PDF buffer', async () => {
    const pdfBuffer = buildMinimalPdfBuffer([
      'DISPOSITIONS APPLICABLES A LA ZONE UA\nARTICLE UA 6 : Implantation\nRecul minimal de 5 metres par rapport aux voies publiques et alignement obligatoire.',
      'ARTICLE UA 10 : Hauteur maximale\nLa hauteur maximale au faitage est de 14 metres.\nVoir article UA 6 pour les marges de recul.',
      'Page 3',
    ])

    const extraction = await PdfExtractor.extractTextAndArticles(pdfBuffer)
    expect(extraction.status).toBe('extracted')
    expect(extraction.pageCount).toBe(3)
    expect(extraction.text.split('\n').every((line) => line.trim().length > 0)).toBe(true)
    expect(extraction.contentMap).toBeDefined()
    expect(extraction.contentMap?.metadata.pageCount).toBe(3)
    expect(extraction.contentMap?.metadata.scannedPages).toEqual([3])
    expect(extraction.contentMap?.articles.map((a) => a.normalizedCode)).toEqual(['UA6', 'UA10'])

    const standaloneMap = await PdfExtractor.extractContentMap(pdfBuffer)
    expect(standaloneMap).toEqual(extraction.contentMap)
  })

  it('cleans and condenses extracted PDF text without empty lines while preserving headings', () => {
    const messy = [
      '',
      '   DISPOSITIONS APPLICABLES   A LA ZONE UA   ',
      '',
      '   ',
      'ARTICLE UA 6 : Implantation par rapport aux voies   ',
      '',
      'Les constructions doivent observer un recul',
      'minimal de 5 mètres par rapport',
      'à l’alignement des voies publiques.',
      '',
      '- Recul latéral : 3 mètres.',
      '',
      'ARTICLE UA 10 : Hauteur maximale',
      'La hauteur maximale est de 15 mètres.',
      '',
    ].join('\n')

    const cleaned = PdfExtractor.cleanAndCondenseText(messy)
    const lines = cleaned.split('\n')

    expect(lines.every((l) => l.length > 0)).toBe(true)
    expect(cleaned).not.toContain('\n\n')
    expect(lines).toEqual([
      'DISPOSITIONS APPLICABLES A LA ZONE UA',
      'ARTICLE UA 6 : Implantation par rapport aux voies',
      'Les constructions doivent observer un recul minimal de 5 mètres par rapport à l’alignement des voies publiques.',
      '- Recul latéral : 3 mètres.',
      'ARTICLE UA 10 : Hauteur maximale',
      'La hauteur maximale est de 15 mètres.',
    ])
  })

  it('exposes static utilities on PdfExtractor and PdfContentMapper classes in @/services/pdf', async () => {
    const map = PdfContentMapper.buildFromPages(SAMPLE_PLU_PAGES)
    expect(map.metadata.commune).toBe('AIX-EN-PROVENCE')
    expect(PdfContentMapper.compressPageRanges([1, 2, 4])).toEqual([
      { startPage: 1, endPage: 2 },
      { startPage: 4, endPage: 4 },
    ])
    expect(PdfContentMapper.normalizeText('Règlement PLU — Zone UA')).toBe(
      'reglement plu — zone ua',
    )

    const queryRes = PdfContentMapper.query(map, {
      zoneCode: 'UA',
      topics: ['setbacks'],
    })
    expect(queryRes.pageNumbers).toContain(3)

    const cleaned = PdfExtractor.cleanAndCondenseText(
      'ARTICLE UA 6 : Implantation\nLes constructions\ndoivent observer un recul de 5 m.',
    )
    expect(cleaned).toBe(
      'ARTICLE UA 6 : Implantation\nLes constructions doivent observer un recul de 5 m.',
    )
    const articles = PdfExtractor.parseArticles(cleaned)
    expect(articles).toHaveLength(1)
    expect(articles[0].articleNumber).toBe('Article UA 6')
  })
})
