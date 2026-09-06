import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'

import { ChipRow } from './ChipRow'
import { searchSpecFormSchema, type SearchSpec } from '../schemas/search-spec'

const SENIORITY_OPTIONS = [
  'intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'lead',
] as const

/**
 * "Edit anything that's wrong before searching" — every array field here is
 * an editable ChipRow because these are exactly the values that get sent to
 * the provider APIs; a bad parse on one field must never block editing the
 * others.
 */
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
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SearchSpec>({
    resolver: zodResolver(searchSpecFormSchema),
    defaultValues: initialSpec,
  })

  const values = watch()

  type ArrayFieldName = {
    [K in keyof SearchSpec]: SearchSpec[K] extends string[] ? K : never
  }[keyof SearchSpec]

  const arrayField = (field: ArrayFieldName) => ({
    values: values[field],
    onAdd: (value: string) => {
      const current = values[field]
      if (current.includes(value)) return
      setValue(field, [...current, value], { shouldValidate: true })
    },
    onRemove: (value: string) => {
      const current = values[field]
      setValue(field, current.filter((v) => v !== value), { shouldValidate: true })
    },
  })

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="flex flex-col"
    >
      <p className="pb-2 text-[13px] text-[var(--color-ink-muted)]">
        Edit anything that&apos;s wrong before searching. These filters are what gets sent to
        the providers.
      </p>

      <div className="divide-y divide-[var(--color-line)] rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4">
        <ChipRow label="Title" {...arrayField('titles')} error={errors.titles?.message} />

        <div className="flex items-center gap-4 py-2">
          <span className="w-32 shrink-0 text-[13px] text-[var(--color-ink-muted)]">
            Seniority
          </span>
          <Select
            value={values.seniority}
            onValueChange={(value) =>
              setValue('seniority', value as SearchSpec['seniority'], { shouldValidate: true })
            }
          >
            <SelectTrigger id="seniority" className="w-40">
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
        </div>

        <ChipRow
          label="Must have"
          {...arrayField('skills')}
          error={errors.skills?.message}
          placeholder="Add a required skill"
        />

        <ChipRow
          label="Nice to have"
          {...arrayField('niceToHaveSkills')}
          placeholder="Add a bonus skill"
        />

        <div className="flex items-center gap-4 py-2">
          <span className="w-32 shrink-0 text-[13px] text-[var(--color-ink-muted)]">
            Location
          </span>
          <div className="flex flex-1 items-center gap-2">
            <Input
              id="location"
              value={values.location}
              onChange={(event) => setValue('location', event.target.value, { shouldValidate: true })}
              className="max-w-56"
            />
            <Input
              type="number"
              min={0}
              value={values.locationRadiusKm ?? ''}
              onChange={(event) =>
                setValue(
                  'locationRadiusKm',
                  event.target.value === '' ? null : Number(event.target.value),
                )
              }
              placeholder="Radius (km)"
              className="w-32"
              aria-label="Location radius in kilometres"
            />
          </div>
          {errors.location ? (
            <p className="text-[12px] text-[var(--color-sig-bad)]">{errors.location.message}</p>
          ) : null}
        </div>

        <ChipRow
          label="Company size"
          {...arrayField('companySizeRanges')}
          placeholder="e.g. 200-2000"
        />

        <ChipRow
          label="Exclude"
          {...arrayField('excludeCompanies')}
          placeholder="Company to exclude"
        />

        <div className="flex items-center gap-4 py-2">
          <span className="w-32 shrink-0 text-[13px] text-[var(--color-ink-muted)]">
            Experience
          </span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={values.minYearsExperience}
              onChange={(event) =>
                setValue('minYearsExperience', Number(event.target.value), {
                  shouldValidate: true,
                })
              }
              className="w-20"
              aria-label="Minimum years of experience"
            />
            <span className="text-[13px] text-[var(--color-ink-muted)]">to</span>
            <Input
              type="number"
              min={0}
              value={values.maxYearsExperience}
              onChange={(event) =>
                setValue('maxYearsExperience', Number(event.target.value), {
                  shouldValidate: true,
                })
              }
              className="w-20"
              aria-label="Maximum years of experience"
            />
            <span className="text-[13px] text-[var(--color-ink-muted)]">years</span>
          </div>
          {errors.maxYearsExperience ? (
            <p className="text-[12px] text-[var(--color-sig-bad)]">
              {errors.maxYearsExperience.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="pt-4">
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Estimating…' : 'Continue to provider plan'}
        </Button>
      </div>
    </form>
  )
}
