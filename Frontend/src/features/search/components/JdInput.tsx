import { useRef, useState } from 'react'

import { Button } from '@/shared/components/ui/button'

import { useParseJdStream } from '../hooks/use-new-search'
import type { SearchSpec } from '../schemas/search-spec'
import { ParseProgressBar } from './ParseProgressBar'

export function JdInput({
  onParsed,
}: {
  readonly onParsed: (spec: SearchSpec, jdText: string) => void
}) {
  const [jdText, setJdText] = useState('')
  const parseJd = useParseJdStream()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isStreaming = parseJd.status === 'streaming'

  const handleFileChosen = (file: File): void => {
    // Plain text only for now — a JD dropped as a .txt/.md file reads
    // directly into the same textarea a paste would, no separate upload
    // endpoint needed. PDF/docx extraction is a real backend feature to add
    // later, not something to fake client-side.
    void file.text().then(setJdText)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="jd-text" className="text-[13px] font-medium text-[var(--color-ink)]">
          Job description
        </label>
        <textarea
          id="jd-text"
          value={jdText}
          onChange={(event) => setJdText(event.target.value)}
          placeholder="Paste the full job description here…"
          rows={10}
          disabled={isStreaming}
          className="w-full resize-y rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>

      {parseJd.status === 'error' ? (
        <p role="alert" className="text-[13px] text-[var(--color-sig-bad)]">
          {parseJd.errorMessage}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          onClick={() => parseJd.start(jdText, (spec) => onParsed(spec, jdText))}
          disabled={jdText.trim().length === 0 || isStreaming}
        >
          {isStreaming ? 'Reading…' : 'Read job description'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isStreaming}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) handleFileChosen(file)
            event.target.value = ''
          }}
        />
      </div>

      {/* Parsing takes seconds — show real streamed progress, not a spinner. */}
      {isStreaming ? <ParseProgressBar stage={parseJd.stage} percent={parseJd.percent} /> : null}
    </div>
  )
}
