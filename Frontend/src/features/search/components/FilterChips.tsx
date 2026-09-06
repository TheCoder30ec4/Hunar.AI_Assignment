import { zodResolver } from '@hookform/resolvers/zod'
import { XIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'

import { searchSpecFormSchema, type SearchSpec } from '../schemas/search-spec'

const SENIORITY_OPTIONS = [
  'intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'lead',
] as const

export function FilterChips({
  initialSpec,
  onSubmit,
  isSubmitting,
}: {
  readonly initialSpec: SearchSpec
  readonly onSubmit: (spec: SearchSpec) => void
  readonly isSubmitting: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SearchSpec>({
    resolver: zodResolver(searchSpecFormSchema),
    defaultValues: initialSpec,
  })

  const skills = watch('skills')
  const [skillDraft, setSkillDraft] = useState('')

  const addSkill = (): void => {
    const trimmed = skillDraft.trim()
    if (trimmed.length === 0 || skills.includes(trimmed)) return
    setValue('skills', [...skills, trimmed], { shouldValidate: true })
    setSkillDraft('')
  }

  const removeSkill = (skill: string): void => {
    setValue(
      'skills',
      skills.filter((existing) => existing !== skill),
      { shouldValidate: true },
    )
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="flex flex-col gap-4 border-t border-[var(--color-line)] pt-4"
    >
      <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">
        Review the parsed filters
      </h2>

      <Field label="Title" htmlFor="title" error={errors.title?.message}>
        <Input id="title" {...register('title')} />
      </Field>

      <Field label="Skills" htmlFor="skill-draft" error={errors.skills?.message}>
        <div className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <Badge key={skill} withDot={false} className="gap-1 pr-1">
              {skill}
              <button
                type="button"
                onClick={() => removeSkill(skill)}
                aria-label={`Remove ${skill}`}
                className="rounded-full p-0.5 hover:bg-[var(--color-line)]"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="mt-1.5 flex gap-2">
          <Input
            id="skill-draft"
            value={skillDraft}
            onChange={(event) => setSkillDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addSkill()
              }
            }}
            placeholder="Add a skill and press Enter"
          />
          <Button type="button" variant="secondary" onClick={addSkill}>
            Add
          </Button>
        </div>
      </Field>

      <Field label="Seniority" htmlFor="seniority" error={errors.seniority?.message}>
        <Select
          value={watch('seniority')}
          onValueChange={(value) =>
            setValue('seniority', value as SearchSpec['seniority'], { shouldValidate: true })
          }
        >
          <SelectTrigger id="seniority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SENIORITY_OPTIONS.map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Location" htmlFor="location" error={errors.location?.message}>
        <Input id="location" {...register('location')} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Min years experience"
          htmlFor="minYearsExperience"
          error={errors.minYearsExperience?.message}
        >
          <Input
            id="minYearsExperience"
            type="number"
            min={0}
            {...register('minYearsExperience', { valueAsNumber: true })}
          />
        </Field>
        <Field
          label="Max years experience"
          htmlFor="maxYearsExperience"
          error={errors.maxYearsExperience?.message}
        >
          <Input
            id="maxYearsExperience"
            type="number"
            min={0}
            {...register('maxYearsExperience', { valueAsNumber: true })}
          />
        </Field>
      </div>

      {/* Registered so the array validates, never rendered as its own input. */}
      <input type="hidden" {...register('skills')} />

      <div>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Estimating…' : 'Continue to provider plan'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  readonly label: string
  readonly htmlFor: string
  readonly error?: string | undefined
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--color-ink)]">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12px] text-[var(--color-sig-bad)]">{error}</p> : null}
    </div>
  )
}
