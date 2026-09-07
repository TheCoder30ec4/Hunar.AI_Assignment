import { useState, type FormEvent } from 'react'

import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import type { SearchId } from '@/shared/types/ids'

import { useAddCandidate } from '../hooks/use-new-search'

/**
 * The manual path. Contact providers are blocked on the current accounts
 * (Apollo: Free plan; Enrich.so: phone lookup 500 credits), so a recruiter
 * can type a person in with their number — they're ranked into the search
 * like any provider row and pass the campaign's clean check.
 */
export function AddPersonDialog({
  searchId,
  open,
  onOpenChange,
}: {
  readonly searchId: SearchId
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  const add = useAddCandidate(searchId)
  const [form, setForm] = useState(EMPTY)

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    add.mutate(
      {
        full_name: form.name.trim(),
        title: form.title.trim() || null,
        company: form.company.trim() || null,
        location: form.location.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        linkedin_url: form.linkedinUrl.trim() || null,
        about: form.about.trim() || null,
      },
      {
        onSuccess: () => {
          setForm(EMPTY)
          onOpenChange(false)
        },
      },
    )
  }

  const hasContact = form.phone.trim().length > 0 || form.email.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a person</DialogTitle>
            <DialogDescription>
              They'll be ranked against this job description. A phone or email is needed for them to be callable.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" required className="col-span-2">
              <Input value={form.name} onChange={set('name')} required autoFocus />
            </Field>
            <Field label="Title">
              <Input value={form.title} onChange={set('title')} placeholder="Backend Engineer" />
            </Field>
            <Field label="Company">
              <Input value={form.company} onChange={set('company')} placeholder="Razorpay" />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" inputMode="tel" />
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={set('email')} placeholder="name@company.com" type="email" />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={set('location')} placeholder="Bengaluru" />
            </Field>
            <Field label="LinkedIn URL">
              <Input value={form.linkedinUrl} onChange={set('linkedinUrl')} placeholder="https://linkedin.com/in/…" />
            </Field>
            <Field label="Skills / summary" className="col-span-2">
              <textarea
                value={form.about}
                onChange={set('about')}
                rows={3}
                placeholder="Python, SQL, Kubernetes… (used for ranking)"
                className="w-full resize-y rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
              />
            </Field>
          </div>

          {!hasContact ? (
            <p className="text-[12px] text-[var(--color-ink-muted)]">
              No phone or email — this person will be excluded from calling by the clean check.
            </p>
          ) : null}

          {add.isError ? (
            <p role="alert" className="text-[13px] text-[var(--color-sig-bad)]">
              Could not add this person. Try again.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={add.isPending || form.name.trim().length === 0}>
              {add.isPending ? 'Adding…' : 'Add person'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const EMPTY = {
  name: '',
  title: '',
  company: '',
  location: '',
  phone: '',
  email: '',
  linkedinUrl: '',
  about: '',
}

function Field({
  label,
  required,
  className,
  children,
}: {
  readonly label: string
  readonly required?: boolean
  readonly className?: string
  readonly children: React.ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="text-[12px] font-medium text-[var(--color-ink)]">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {children}
    </label>
  )
}
