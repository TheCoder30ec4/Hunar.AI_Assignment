import { useRef, useState } from 'react'

import { Button } from '@/shared/components/ui/button'
import { isApiError } from '@/shared/api/errors'

import { useParseJd } from '../hooks/use-new-search'
import type { SearchSpec } from '../schemas/search-spec'
import { FilterChipsSkeleton } from './FilterChipsSkeleton'

export function JdInput({ onParsed }: { readonly onParsed: (spec: SearchSpec) => void }) {
  const [jdText, setJdText] = useState('')
  const parseJd = useParseJd()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleParse = (): void => {
    parseJd.mutate(jdText, { onSuccess: onParsed })
  }

  const handleFileChosen = (file: File): void => {
    // Plain text only for now — a JD dropped as a .txt/.md file reads
    // directly into the same textarea a paste would, no separate upload
    // endpoint needed. PDF/docx extraction is a real backend feature to add
    // later, not something to fake client-side.
    void file.text().then(setJdText)
  }

  const errorMessage = parseJd.isError
    ? isApiError(parseJd.error)
      ? parseJd.error.message
      : 'Could not parse the job description. Try again.'
    : null

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
          disabled={parseJd.isPending}
          className="w-full resize-y rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>

      {errorMessage ? (
        <p role="alert" className="text-[13px] text-[var(--color-sig-bad)]">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          onClick={handleParse}
          disabled={jdText.trim().length === 0 || parseJd.isPending}
        >
          {parseJd.isPending ? 'Reading…' : 'Read job description'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
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

      {/* Parsing takes seconds — show the shape of what's coming, not a spinner. */}
      {parseJd.isPending ? <FilterChipsSkeleton /> : null}
    </div>
  )
}
